# NBA GM Simulator

Multiplayer web-based NBA GM draft simulator. Draft 5 historical NBA players, assign positions, simulate a best-of-7 Finals series.

## Tech Stack
- **Monorepo**: pnpm workspaces
- **Frontend**: Vue 3 + Vite + TypeScript + PrimeVue (Aura theme) + Pinia + Vue Router v4
- **Backend**: Fastify + TypeScript
- **ORM/DB**: Drizzle ORM + postgres-js → PostgreSQL 16 (docker-compose)
- **Validation**: Zod (shared package)
- **Auth**: Email/password (bcrypt + JWT httpOnly cookies)
- **Testing**: Vitest
- **Data**: Python scripts for player data ingestion (Kaggle SQLite or nba_api)

## Project Structure
```
packages/shared/   — Types, Zod schemas, constants (positions, simulation constants)
packages/server/   — Fastify API (routes, services, db schema, middleware)
packages/client/   — Vue 3 SPA (views, components, stores, API client)
scripts/           — Python data ingestion (Kaggle SQLite or nba_api → Postgres)
```

## Commands
- `npx pnpm install` — install all deps
- `npx pnpm dev` — run server + client concurrently
- `npx pnpm dev:server` / `npx pnpm dev:client` — run individually
- `npx pnpm db:generate` — generate Drizzle migrations
- `npx pnpm db:migrate` — run migrations
- `docker compose up -d` — start PostgreSQL 16
- `pip install -r scripts/requirements.txt && python scripts/ingest_players.py` — ingest player data (nba_api, modern era only)
- `python scripts/ingest_kaggle.py --replace` — ingest from Kaggle dataset (full history, 1946-present; auto-downloads via kagglehub, requires one-time Kaggle API token in `~/.kaggle/kaggle.json` from https://www.kaggle.com/settings)

## Database
- Connection: `postgresql://nbagm:nbagm_dev@localhost:5432/nba_gm_simulator`
- Tables: users, players, player_season_stats, drafts, draft_participants, draft_picks, series, series_games
- Schema defined in `packages/server/src/db/schema/`

## Key Design Decisions
- Snake draft order (1-2-2-1...) for 2-player drafts — shared `getPickOrder()` helper in constants
- 5 picks per team, one per position (PG/SG/SF/PF/C)
- Simulation uses career average stats with position fit bonuses/penalties
- Home court pattern: 2-2-1-1-1 for best-of-7
- Polling (3s interval) for real-time draft updates (SSE upgrade planned); skipped for local mode
- Draft share codes use nanoid
- **Local two-player mode**: `drafts.mode` column (`online` | `local`). Local mode creates a guest user (unhashable password `!`) for Player 2, starts drafting immediately with both participants. Both teams pick from the same screen — server assigns picks via snake order regardless of requesting userId. Local games excluded from leaderboard. SeriesView shows participant display names for both modes.

## Development Workflow
1. Create a feature branch from master
2. Implement changes
3. Write/update tests for changed code
4. Run `pnpm -r test` — all tests must pass
5. Commit (one commit per milestone for multi-step work)
6. Push branch and open a PR to master
7. Review, approve, and merge

## Current Status
- Phase 1-6 complete: project structure, shared types, DB schema, server routes/services, client views/stores, Python ingestion script
- Local two-player mode implemented (PR #1)
- Player pool table: pagination (25/page), debounced live search, clickable column sorting (PR #2)
