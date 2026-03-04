#!/usr/bin/env python3
"""
Ingest NBA player data from nba_api into PostgreSQL.

Usage:
  python scripts/ingest_players.py              # All players (no year filter)
  python scripts/ingest_players.py --year 1984  # Only players whose career started in 1984

Requires: pip install nba_api psycopg2-binary
"""

import argparse
import os
import sys
import time
import psycopg2
from psycopg2.extras import execute_values

from nba_api.stats.endpoints import CommonAllPlayers, CommonPlayerInfo, PlayerCareerStats

DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://nbagm:nbagm_dev@localhost:5432/nba_gm_simulator",
)

DELAY = 2.5  # seconds between API calls to respect rate limits
MAX_RETRIES = 3
INITIAL_BACKOFF = 3  # seconds


def get_connection():
    return psycopg2.connect(DB_URL)


def ensure_tables(conn):
    """Create tables if they don't exist (mirrors Drizzle schema)."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS players (
                id SERIAL PRIMARY KEY,
                nba_id INTEGER NOT NULL UNIQUE,
                name VARCHAR(255) NOT NULL,
                draft_year INTEGER,
                draft_round INTEGER,
                draft_number INTEGER,
                career_start_year INTEGER NOT NULL,
                career_end_year INTEGER NOT NULL,
                primary_position VARCHAR(2)
            );
            CREATE TABLE IF NOT EXISTS player_season_stats (
                id SERIAL PRIMARY KEY,
                player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                season VARCHAR(10) NOT NULL,
                games_played INTEGER NOT NULL,
                ppg REAL NOT NULL,
                rpg REAL NOT NULL,
                apg REAL NOT NULL,
                spg REAL NOT NULL,
                bpg REAL NOT NULL,
                fg_pct REAL NOT NULL,
                ft_pct REAL NOT NULL,
                three_pct REAL NOT NULL,
                minutes_pg REAL NOT NULL
            );
        """)
    conn.commit()


def safe_int(val, default=None):
    try:
        return int(val) if val is not None and str(val).strip() not in ("", "Undrafted") else default
    except (ValueError, TypeError):
        return default


def safe_float(val, default=0.0):
    try:
        return float(val) if val is not None else default
    except (ValueError, TypeError):
        return default


POSITION_MAP = {
    "Guard": "PG",
    "Guard-Forward": "SG",
    "Forward-Guard": "SF",
    "Forward": "SF",
    "Forward-Center": "PF",
    "Center-Forward": "PF",
    "Center": "C",
}


def map_position(pos_str):
    if not pos_str:
        return None
    return POSITION_MAP.get(pos_str, pos_str[:2].upper() if pos_str else None)


def api_call_with_retry(fn, description="API call"):
    """Call fn() with retry logic (3 attempts, exponential backoff)."""
    for attempt in range(MAX_RETRIES):
        try:
            return fn()
        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                wait = INITIAL_BACKOFF * (2 ** attempt)
                print(f"  Retry {attempt + 1}/{MAX_RETRIES} for {description} (waiting {wait}s): {e}")
                time.sleep(wait)
            else:
                raise


def ingest(target_year=None):
    conn = get_connection()
    ensure_tables(conn)

    print("Fetching all players list...")
    all_players = api_call_with_retry(
        lambda: CommonAllPlayers(is_only_current_season=0).get_data_frames()[0],
        "CommonAllPlayers"
    )
    print(f"Found {len(all_players)} total players")

    # Filter to players who have played at least one game
    active_players = all_players[all_players["TO_YEAR"].notna() & (all_players["TO_YEAR"] != "")]

    if target_year is not None:
        # Filter to players whose career started in the target year
        active_players = active_players[active_players["FROM_YEAR"].astype(int) == target_year]
        print(f"Filtered to {len(active_players)} players with career start year {target_year}")
    else:
        print(f"No year filter — processing all {len(active_players)} active players")

    with conn.cursor() as cur:
        # Check which players we already have
        cur.execute("SELECT nba_id FROM players")
        existing_ids = {row[0] for row in cur.fetchall()}

    total = len(active_players)
    inserted = 0
    skipped = 0
    errors = 0
    notable_players = []

    for idx, row in active_players.iterrows():
        nba_id = int(row["PERSON_ID"])

        if nba_id in existing_ids:
            skipped += 1
            continue

        try:
            time.sleep(DELAY)

            player_name = row["DISPLAY_FIRST_LAST"]

            # Get player info (draft details, position)
            print(f"[{inserted + skipped + errors + 1}/{total}] Fetching {player_name} (ID: {nba_id})...")
            info_df = api_call_with_retry(
                lambda nid=nba_id: CommonPlayerInfo(player_id=nid).get_data_frames()[0],
                f"CommonPlayerInfo({player_name})"
            )
            info = info_df.iloc[0] if len(info_df) > 0 else None

            draft_year = safe_int(info["DRAFT_YEAR"]) if info is not None else None
            draft_round = safe_int(info["DRAFT_ROUND"]) if info is not None else None
            draft_number = safe_int(info["DRAFT_NUMBER"]) if info is not None else None
            position = map_position(info["POSITION"]) if info is not None else None

            from_year = int(row["FROM_YEAR"]) if row["FROM_YEAR"] else 1946
            to_year = int(row["TO_YEAR"]) if row["TO_YEAR"] else from_year

            # Insert player
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO players (nba_id, name, draft_year, draft_round, draft_number, career_start_year, career_end_year, primary_position)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (nba_id) DO NOTHING
                    RETURNING id
                """, (nba_id, player_name, draft_year, draft_round, draft_number, from_year, to_year, position))
                result = cur.fetchone()
                if not result:
                    skipped += 1
                    conn.commit()
                    continue
                player_id = result[0]

            # Commit the player first so it's saved even if stats fail
            conn.commit()

            # Get career stats (may fail for players with minimal NBA time)
            try:
                time.sleep(DELAY)
                career = api_call_with_retry(
                    lambda nid=nba_id: PlayerCareerStats(player_id=nid, per_mode36="PerGame").get_data_frames(),
                    f"PlayerCareerStats({player_name})"
                )

                if len(career) > 0:
                    season_stats = career[0]  # Regular season per-game stats
                    stat_rows = []
                    for _, srow in season_stats.iterrows():
                        stat_rows.append((
                            player_id,
                            str(srow.get("SEASON_ID", "")),
                            safe_int(srow.get("GP", 0), 0),
                            safe_float(srow.get("PTS", 0)),
                            safe_float(srow.get("REB", 0)),
                            safe_float(srow.get("AST", 0)),
                            safe_float(srow.get("STL", 0)),
                            safe_float(srow.get("BLK", 0)),
                            safe_float(srow.get("FG_PCT", 0)),
                            safe_float(srow.get("FT_PCT", 0)),
                            safe_float(srow.get("FG3_PCT", 0)),
                            safe_float(srow.get("MIN", 0)),
                        ))

                    if stat_rows:
                        with conn.cursor() as cur:
                            execute_values(cur, """
                                INSERT INTO player_season_stats
                                (player_id, season, games_played, ppg, rpg, apg, spg, bpg, fg_pct, ft_pct, three_pct, minutes_pg)
                                VALUES %s
                            """, stat_rows)

                conn.commit()
            except Exception as stat_err:
                conn.rollback()
                print(f"  WARN: No stats for {player_name}: {stat_err}", file=sys.stderr)

            inserted += 1
            notable_players.append(player_name)

            if inserted % 50 == 0:
                print(f"  Progress: {inserted} inserted, {skipped} skipped, {errors} errors")

        except Exception as e:
            conn.rollback()
            errors += 1
            print(f"  ERROR on {row['DISPLAY_FIRST_LAST']}: {e}", file=sys.stderr)
            continue

    # Summary
    year_label = f"year {target_year}" if target_year else "all years"
    print(f"\n{'=' * 60}")
    print(f"Summary for {year_label}:")
    print(f"  Total candidates: {total}")
    print(f"  Inserted:         {inserted}")
    print(f"  Skipped (exist):  {skipped}")
    print(f"  Errors:           {errors}")
    if notable_players:
        print(f"  Players ingested: {', '.join(notable_players[:20])}")
        if len(notable_players) > 20:
            print(f"    ... and {len(notable_players) - 20} more")
    print(f"{'=' * 60}")

    conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest NBA player data from nba_api into PostgreSQL")
    parser.add_argument("--year", type=int, default=None,
                        help="Only ingest players whose career started in this year (e.g., --year 1984)")
    args = parser.parse_args()
    ingest(target_year=args.year)
