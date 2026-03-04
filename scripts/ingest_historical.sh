#!/usr/bin/env bash
# Ingest historical NBA players year by year, from 2000 back to 1970.
# Can be stopped (Ctrl+C) and resumed — already-ingested players are skipped.
#
# Usage:
#   ./scripts/ingest_historical.sh          # Run all years 2000→1970
#   ./scripts/ingest_historical.sh 1990     # Start from 1990 instead of 2000

set -euo pipefail

START_YEAR="${1:-2000}"
END_YEAR=1970
PAUSE=10  # seconds between years

echo "=== Historical Player Ingestion ==="
echo "Running from $START_YEAR down to $END_YEAR"
echo ""

for (( year=START_YEAR; year>=END_YEAR; year-- )); do
    echo ">>> Starting year $year at $(date '+%H:%M:%S')"
    python scripts/ingest_players.py --year "$year"

    if [ $year -gt $END_YEAR ]; then
        echo "    Pausing ${PAUSE}s before next year..."
        sleep $PAUSE
    fi
done

echo ""
echo "=== All years complete! ==="
