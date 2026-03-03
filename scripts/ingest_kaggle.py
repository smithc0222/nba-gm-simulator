#!/usr/bin/env python3
"""
Ingest NBA player data into PostgreSQL using two data sources:
  - Kaggle drgilermo/nba-players-stats CSV files (1950-2017 historical stats)
  - nba_api LeagueDashPlayerStats bulk endpoint (2018-2025 modern stats)

Zero individual API calls needed. Only ~7 bulk API calls for modern seasons.

Usage:
  python scripts/ingest_kaggle.py --replace   # full ingestion (truncate + re-import)

Requires: psycopg2-binary, nba_api, pandas
"""

import argparse
import csv
import os
import sys
import time

import psycopg2
from psycopg2.extras import execute_values

DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://nbagm:nbagm_dev@localhost:5432/nba_gm_simulator",
)

KAGGLE_CSV_DIR = os.path.join(
    os.path.expanduser("~"),
    ".cache/kagglehub/datasets/drgilermo/nba-players-stats/versions/2",
)
WYATTOWALSH_SQLITE = os.path.join(
    os.path.expanduser("~"),
    ".cache/kagglehub/datasets/wyattowalsh/basketball/versions/231/nba.sqlite",
)

API_DELAY = 1.5  # seconds between nba_api bulk calls
FIRST_MODERN_SEASON = 2018  # First season to fetch from nba_api (2018-19)

# Map Basketball Reference / NBA position strings to our 2-char codes
POSITION_MAP = {
    # Full names (from common_player_info)
    "Guard": "PG", "Guard-Forward": "SG", "Forward-Guard": "SF",
    "Forward": "SF", "Forward-Center": "PF", "Center-Forward": "PF", "Center": "C",
    # BBRef abbreviations
    "G": "PG", "G-F": "SG", "F-G": "SG", "F": "SF",
    "F-C": "PF", "C-F": "PF", "C": "C",
    "PG": "PG", "SG": "SG", "SF": "SF", "PF": "PF",
}


def get_pg_connection():
    return psycopg2.connect(DB_URL)


def safe_float(val, default=0.0):
    try:
        return float(val) if val is not None and str(val).strip() != "" else default
    except (ValueError, TypeError):
        return default


def safe_int(val, default=None):
    try:
        return int(float(val)) if val is not None and str(val).strip() not in ("", "Undrafted") else default
    except (ValueError, TypeError):
        return default


def map_position(pos_str):
    if not pos_str or not pos_str.strip():
        return None
    pos_str = pos_str.strip()
    if pos_str in POSITION_MAP:
        return POSITION_MAP[pos_str]
    for sep in ("-", "/"):
        if sep in pos_str:
            first = pos_str.split(sep)[0].strip()
            if first in POSITION_MAP:
                return POSITION_MAP[first]
    return pos_str[:2].upper() if pos_str else None


def deduplicate_seasons(season_rows):
    """For mid-season trades, keep only the TOT row per season (or row with most games)."""
    by_season = {}
    for row in season_rows:
        season = row["season"]
        if season not in by_season:
            by_season[season] = []
        by_season[season].append(row)

    deduped = []
    for season, rows in by_season.items():
        if len(rows) == 1:
            deduped.append(rows[0])
        else:
            tot_rows = [r for r in rows if r.get("team", "").upper() == "TOT"]
            if tot_rows:
                deduped.append(tot_rows[0])
            else:
                rows.sort(key=lambda r: r["gp"], reverse=True)
                deduped.append(rows[0])
    return deduped


# ---------------------------------------------------------------------------
# Phase A: Load historical stats from Kaggle CSV (1950-2017)
# ---------------------------------------------------------------------------

def load_csv_player_metadata(csv_dir):
    """Load player metadata from player_data.csv.

    Returns dict of name -> {position, year_start, year_end}.
    For duplicate names, key by (name, year_start).
    """
    path = os.path.join(csv_dir, "player_data.csv")
    metadata = {}
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row["name"].strip().rstrip("*")
            year_start = safe_int(row.get("year_start"))
            year_end = safe_int(row.get("year_end"))
            position = map_position(row.get("position", ""))
            metadata[(name, year_start)] = {
                "name": name,
                "position": position,
                "year_start": year_start,
                "year_end": year_end,
            }
    print(f"  Loaded metadata for {len(metadata)} players from player_data.csv")
    return metadata


def load_csv_season_stats(csv_dir):
    """Load per-season stats from Seasons_Stats.csv.

    Stats are season totals — convert to per-game by dividing by G.
    Returns dict of player_name -> [season_row_dicts].
    """
    path = os.path.join(csv_dir, "Seasons_Stats.csv")
    stats_by_player = {}

    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            year = row.get("Year", "").strip()
            if not year:
                continue

            year_int = safe_int(year)
            if year_int is None:
                continue

            name = row.get("Player", "").strip().rstrip("*")
            if not name:
                continue

            gp = safe_int(row.get("G"), 0)
            if not gp or gp == 0:
                continue

            # Convert season totals to per-game
            pts_total = safe_float(row.get("PTS"))
            trb_total = safe_float(row.get("TRB"))
            ast_total = safe_float(row.get("AST"))
            stl_total = safe_float(row.get("STL"))
            blk_total = safe_float(row.get("BLK"))
            mp_total = safe_float(row.get("MP"))

            # Season string: Year column is the ending year of the season
            # e.g. Year=1985 means 1984-85 season
            season_str = f"{year_int - 1}-{year_int % 100:02d}"

            season_row = {
                "season": season_str,
                "team": row.get("Tm", "").strip(),
                "gp": gp,
                "minutes": round(mp_total / gp, 1),
                "pts": round(pts_total / gp, 1),
                "reb": round(trb_total / gp, 1),
                "ast": round(ast_total / gp, 1),
                "stl": round(stl_total / gp, 1),
                "blk": round(blk_total / gp, 1),
                "fg_pct": safe_float(row.get("FG%")),
                "ft_pct": safe_float(row.get("FT%")),
                "fg3_pct": safe_float(row.get("3P%")),
                "pos": row.get("Pos", "").strip(),
            }

            if name not in stats_by_player:
                stats_by_player[name] = []
            stats_by_player[name].append(season_row)

    print(f"  Loaded season stats for {len(stats_by_player)} players from Seasons_Stats.csv")
    return stats_by_player


# ---------------------------------------------------------------------------
# Phase B: Load modern stats from nba_api (2018-2025)
# ---------------------------------------------------------------------------

def load_modern_bulk_stats():
    """Fetch per-game stats for 2018-19 through 2024-25 using LeagueDashPlayerStats.

    Returns:
      - stats_by_name: dict of player_name -> [season_rows]
      - player_nba_ids: dict of player_name -> nba_id (from the bulk response)
    """
    from nba_api.stats.endpoints import LeagueDashPlayerStats

    stats_by_name = {}
    player_nba_ids = {}
    current_year = 2025

    print(f"\nPhase B: Bulk-fetching modern stats ({FIRST_MODERN_SEASON}-{FIRST_MODERN_SEASON + 1 - 2000:02d} to {current_year - 1}-{current_year % 100:02d})...")
    for year in range(FIRST_MODERN_SEASON, current_year):
        season_str = f"{year}-{(year + 1) % 100:02d}"
        try:
            time.sleep(API_DELAY)
            result = LeagueDashPlayerStats(
                season=season_str,
                per_mode_detailed="PerGame",
            )
            df = result.get_data_frames()[0]

            for _, row in df.iterrows():
                name = str(row.get("PLAYER_NAME", "")).strip()
                nba_id = safe_int(row.get("PLAYER_ID"))
                if not name or nba_id is None:
                    continue

                player_nba_ids[name] = nba_id

                season_row = {
                    "season": season_str,
                    "team": str(row.get("TEAM_ABBREVIATION", "")).strip(),
                    "gp": safe_int(row.get("GP"), 0),
                    "minutes": safe_float(row.get("MIN")),
                    "pts": safe_float(row.get("PTS")),
                    "reb": safe_float(row.get("REB")),
                    "ast": safe_float(row.get("AST")),
                    "stl": safe_float(row.get("STL")),
                    "blk": safe_float(row.get("BLK")),
                    "fg_pct": safe_float(row.get("FG_PCT")),
                    "ft_pct": safe_float(row.get("FT_PCT")),
                    "fg3_pct": safe_float(row.get("FG3_PCT")),
                }

                if name not in stats_by_name:
                    stats_by_name[name] = []
                stats_by_name[name].append(season_row)

            print(f"  {season_str}: {len(df)} players")
        except Exception as e:
            print(f"  {season_str}: ERROR - {e}", file=sys.stderr)

    print(f"  Modern stats loaded for {len(stats_by_name)} players")
    return stats_by_name, player_nba_ids


# ---------------------------------------------------------------------------
# Phase C: Match players to nba_ids
# ---------------------------------------------------------------------------

def load_nba_ids():
    """Load nba_id mappings from nba_api CommonAllPlayers and wyattowalsh SQLite.

    Returns dict of (name, from_year) -> nba_id for disambiguation,
    and a simpler name -> nba_id for unique names.
    """
    from nba_api.stats.endpoints import CommonAllPlayers

    print("\nPhase C: Loading nba_id mappings...")
    df = CommonAllPlayers(is_only_current_season=0).get_data_frames()[0]

    by_name_year = {}  # (name, from_year) -> nba_id
    by_name = {}       # name -> nba_id (last wins for dupes, but we prefer by_name_year)
    name_counts = {}

    for _, row in df.iterrows():
        nba_id = safe_int(row["PERSON_ID"])
        name = str(row.get("DISPLAY_FIRST_LAST", "")).strip()
        from_year = safe_int(row.get("FROM_YEAR"))
        if not name or nba_id is None:
            continue
        by_name_year[(name, from_year)] = nba_id
        by_name[name] = nba_id
        name_counts[name] = name_counts.get(name, 0) + 1

    # Also try wyattowalsh SQLite for additional mappings
    if os.path.isfile(WYATTOWALSH_SQLITE):
        import sqlite3
        conn = sqlite3.connect(WYATTOWALSH_SQLITE)
        cur = conn.cursor()
        cur.execute("SELECT person_id, display_first_last FROM common_player_info")
        for person_id, display_name in cur.fetchall():
            pid = safe_int(person_id)
            if pid and display_name:
                name = display_name.strip()
                if name not in by_name:
                    by_name[name] = pid
        conn.close()

    unique_names = {n for n, c in name_counts.items() if c == 1}
    print(f"  Loaded {len(by_name)} player name->id mappings ({len(unique_names)} unique names)")
    return by_name_year, by_name, unique_names


# ---------------------------------------------------------------------------
# Main ingestion
# ---------------------------------------------------------------------------

def ingest(replace=False, min_seasons=3):
    print("Phase A: Loading historical data from Kaggle CSV...")
    csv_metadata = load_csv_player_metadata(KAGGLE_CSV_DIR)
    csv_stats = load_csv_season_stats(KAGGLE_CSV_DIR)

    # Phase B: Modern bulk stats
    modern_stats, modern_nba_ids = load_modern_bulk_stats()

    # Phase C: nba_id mappings
    nba_id_by_name_year, nba_id_by_name, unique_names = load_nba_ids()

    # ---------------------------------------------------------------------------
    # Merge all players into a unified dict: name -> player_info + seasons
    # ---------------------------------------------------------------------------
    print("\nMerging data sources...")

    # Start with CSV players
    all_players = {}  # keyed by (name, year_start) for disambiguation

    for (meta_name, meta_year_start), meta in csv_metadata.items():
        player_seasons = []

        # Get stats for this player name
        if meta_name in csv_stats:
            player_seasons = list(csv_stats[meta_name])

        # For duplicate names, filter seasons to the right career span
        # by checking if the season year falls within their career
        if meta["year_start"] and meta["year_end"]:
            filtered = []
            for s in player_seasons:
                # season is "YYYY-YY", parse start year
                try:
                    s_year = int(s["season"][:4])
                except (ValueError, IndexError):
                    continue
                # Allow 1 year buffer for off-by-one in career year data
                if meta["year_start"] - 1 <= s_year + 1 <= meta["year_end"] + 1:
                    filtered.append(s)
            player_seasons = filtered

        # Get position: prefer metadata, fall back to most common in stats
        position = meta.get("position")
        if not position and player_seasons:
            pos_counts = {}
            for s in player_seasons:
                p = map_position(s.get("pos", ""))
                if p:
                    pos_counts[p] = pos_counts.get(p, 0) + 1
            if pos_counts:
                position = max(pos_counts, key=pos_counts.get)

        all_players[(meta_name, meta_year_start)] = {
            "name": meta_name,
            "position": position,
            "from_year": meta["year_start"],
            "to_year": meta["year_end"],
            "seasons": player_seasons,
            "nba_id": None,
        }

    # Add modern-only players (2018+ players not in CSV)
    for name, seasons in modern_stats.items():
        # Check if this player already exists from CSV
        already_exists = False
        for (pname, _), pinfo in all_players.items():
            if pname == name:
                # Merge modern seasons into existing player
                pinfo["seasons"].extend(seasons)
                if pinfo["to_year"] is not None:
                    max_modern = max(int(s["season"][:4]) + 1 for s in seasons)
                    pinfo["to_year"] = max(pinfo["to_year"], max_modern)
                already_exists = True
                break
        if not already_exists:
            # Derive career years from seasons
            years = [int(s["season"][:4]) for s in seasons]
            from_year = min(years) + 1 if years else None  # +1 because season "2018-19" starts in 2018
            to_year = max(years) + 1 if years else None
            all_players[(name, from_year)] = {
                "name": name,
                "position": None,  # Will try to get from nba_api metadata
                "from_year": from_year,
                "to_year": to_year,
                "seasons": seasons,
                "nba_id": modern_nba_ids.get(name),
            }

    # Deduplicate seasons and apply min-seasons filter
    print("Deduplicating and filtering...")
    qualified_players = {}
    for key, player in all_players.items():
        player["seasons"] = deduplicate_seasons(player["seasons"])
        if len(player["seasons"]) < min_seasons:
            continue
        qualified_players[key] = player

    print(f"  {len(qualified_players)} players pass {min_seasons}-season minimum")

    # Assign nba_ids
    print("Assigning nba_ids...")
    matched = 0
    synthetic_id = -1

    for key, player in qualified_players.items():
        name = player["name"]
        from_year = player["from_year"]

        # Already has nba_id from modern data
        if player["nba_id"] is not None:
            matched += 1
            continue

        # Try exact (name, year) match first
        # nba_api uses FROM_YEAR which is career start year
        nba_id = nba_id_by_name_year.get((name, from_year))
        if nba_id is None and from_year is not None:
            # Try +/- 1 year (BBRef vs NBA career start can differ by 1)
            nba_id = nba_id_by_name_year.get((name, from_year - 1))
            if nba_id is None:
                nba_id = nba_id_by_name_year.get((name, from_year + 1))

        if nba_id is None and name in unique_names:
            # Unique name, safe to match without year
            nba_id = nba_id_by_name.get(name)

        if nba_id is not None:
            player["nba_id"] = nba_id
            matched += 1
        else:
            # Assign synthetic negative ID
            player["nba_id"] = synthetic_id
            synthetic_id -= 1

    print(f"  Matched {matched}/{len(qualified_players)} players to nba_ids")
    print(f"  Assigned {abs(synthetic_id) - 1} synthetic IDs")

    # Enrich positions for modern-only players missing position
    missing_pos = [p for p in qualified_players.values() if p["position"] is None and p["nba_id"] and p["nba_id"] > 0]
    if missing_pos:
        print(f"  Enriching positions for {len(missing_pos)} players from nba_api metadata...")
        try:
            from nba_api.stats.endpoints import CommonAllPlayers
            time.sleep(API_DELAY)
            df = CommonAllPlayers(is_only_current_season=0).get_data_frames()[0]
            # CommonAllPlayers doesn't have position, so we'll try wyattowalsh
        except Exception:
            pass

        if os.path.isfile(WYATTOWALSH_SQLITE):
            import sqlite3
            conn = sqlite3.connect(WYATTOWALSH_SQLITE)
            cur = conn.cursor()
            cur.execute("SELECT person_id, position FROM common_player_info")
            pos_by_id = {}
            for pid, pos in cur.fetchall():
                pid = safe_int(pid)
                if pid and pos:
                    pos_by_id[pid] = map_position(pos)
            conn.close()

            enriched = 0
            for p in qualified_players.values():
                if p["position"] is None and p["nba_id"] in pos_by_id:
                    p["position"] = pos_by_id[p["nba_id"]]
                    enriched += 1
            print(f"  Enriched {enriched} positions from wyattowalsh")

    # Check for duplicate nba_ids (shouldn't happen, but safety check)
    seen_ids = {}
    dupes_removed = 0
    final_players = {}
    for key, player in qualified_players.items():
        nba_id = player["nba_id"]
        if nba_id in seen_ids:
            # Keep the one with more seasons
            existing_key = seen_ids[nba_id]
            if len(player["seasons"]) > len(final_players[existing_key]["seasons"]):
                del final_players[existing_key]
                final_players[key] = player
                seen_ids[nba_id] = key
            dupes_removed += 1
        else:
            seen_ids[nba_id] = key
            final_players[key] = player

    if dupes_removed:
        print(f"  Removed {dupes_removed} duplicate nba_id entries")

    print(f"\nFinal player count: {len(final_players)}")

    # ---------------------------------------------------------------------------
    # Insert into PostgreSQL
    # ---------------------------------------------------------------------------
    pg_conn = get_pg_connection()

    if replace:
        print("\nTruncating existing data (--replace)...")
        with pg_conn.cursor() as cur:
            cur.execute("TRUNCATE player_season_stats, players RESTART IDENTITY CASCADE")
        pg_conn.commit()

    # Insert players
    print("Inserting players...")
    player_id_map = {}  # nba_id -> postgres id
    player_values = []

    for key, p in final_players.items():
        from_year = p["from_year"] or 1946
        to_year = p["to_year"] or from_year

        # Derive career years from actual season data if metadata is missing
        if p["seasons"]:
            season_years = []
            for s in p["seasons"]:
                try:
                    season_years.append(int(s["season"][:4]))
                except (ValueError, IndexError):
                    pass
            if season_years:
                from_year = min(season_years)
                to_year = max(season_years) + 1  # +1 because "2002-03" means played in 2003

        player_values.append((
            p["nba_id"],
            p["name"],
            None,  # draft_year - not available in this dataset
            None,  # draft_round
            None,  # draft_number
            from_year,
            to_year,
            p["position"],
        ))

    BATCH_SIZE = 500
    inserted_players = 0
    for i in range(0, len(player_values), BATCH_SIZE):
        batch = player_values[i:i + BATCH_SIZE]
        with pg_conn.cursor() as cur:
            result = execute_values(cur, """
                INSERT INTO players (nba_id, name, draft_year, draft_round, draft_number,
                                     career_start_year, career_end_year, primary_position)
                VALUES %s
                ON CONFLICT (nba_id) DO NOTHING
                RETURNING id, nba_id
            """, batch, fetch=True)
            for row in result:
                player_id_map[row[1]] = row[0]
                inserted_players += 1
        pg_conn.commit()

    print(f"  Inserted {inserted_players} players")

    # Look up IDs for players that hit ON CONFLICT
    if inserted_players < len(final_players):
        missing_nba_ids = [p["nba_id"] for p in final_players.values() if p["nba_id"] not in player_id_map]
        if missing_nba_ids:
            with pg_conn.cursor() as cur:
                cur.execute("SELECT id, nba_id FROM players WHERE nba_id = ANY(%s)", (missing_nba_ids,))
                for row in cur.fetchall():
                    player_id_map[row[1]] = row[0]

    # Insert season stats
    print("Inserting season stats...")
    stat_values = []
    for key, player in final_players.items():
        pg_id = player_id_map.get(player["nba_id"])
        if not pg_id:
            continue

        for s in player["seasons"]:
            stat_values.append((
                pg_id,
                s["season"],
                s["gp"],
                s["pts"],
                s["reb"],
                s["ast"],
                s["stl"],
                s["blk"],
                s["fg_pct"],
                s["ft_pct"],
                s["fg3_pct"],
                s["minutes"],
            ))

    total_stats = 0
    for i in range(0, len(stat_values), BATCH_SIZE):
        batch = stat_values[i:i + BATCH_SIZE]
        with pg_conn.cursor() as cur:
            execute_values(cur, """
                INSERT INTO player_season_stats
                (player_id, season, games_played, ppg, rpg, apg, spg, bpg, fg_pct, ft_pct, three_pct, minutes_pg)
                VALUES %s
            """, batch)
            total_stats += len(batch)
        pg_conn.commit()

    print(f"  Inserted {total_stats} season stat rows")

    # Summary
    with pg_conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM players")
        total_p = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM player_season_stats")
        total_s = cur.fetchone()[0]

    # Verify key players
    print("\nKey player verification:")
    key_players = ["Michael Jordan", "Magic Johnson", "Larry Bird", "Bill Russell", "Larry Johnson"]
    with pg_conn.cursor() as cur:
        for name in key_players:
            cur.execute(
                "SELECT p.name, p.primary_position, p.career_start_year, p.career_end_year, COUNT(s.id) "
                "FROM players p LEFT JOIN player_season_stats s ON s.player_id = p.id "
                "WHERE p.name ILIKE %s GROUP BY p.id",
                (f"%{name}%",),
            )
            rows = cur.fetchall()
            for r in rows:
                print(f"  {r[0]}: {r[1]}, {r[2]}-{r[3]}, {r[4]} seasons")
            if not rows:
                print(f"  {name}: NOT FOUND!", file=sys.stderr)

    print(f"\nDone! Database has {total_p} players and {total_s} season stat rows.")
    pg_conn.close()


def main():
    parser = argparse.ArgumentParser(description="Ingest NBA player data into PostgreSQL")
    parser.add_argument("--replace", action="store_true",
                        help="Truncate existing data before importing")
    parser.add_argument("--min-seasons", type=int, default=3,
                        help="Minimum number of seasons to include a player (default: 3)")
    args = parser.parse_args()

    # Verify CSV files exist
    for fname in ("Seasons_Stats.csv", "player_data.csv"):
        path = os.path.join(KAGGLE_CSV_DIR, fname)
        if not os.path.isfile(path):
            print(f"ERROR: {path} not found.", file=sys.stderr)
            print(f"Download the drgilermo/nba-players-stats dataset from Kaggle.", file=sys.stderr)
            sys.exit(1)

    ingest(replace=args.replace, min_seasons=args.min_seasons)


if __name__ == "__main__":
    main()
