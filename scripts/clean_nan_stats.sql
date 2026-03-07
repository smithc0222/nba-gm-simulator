-- Clean NaN values from player_season_stats table.
-- PostgreSQL real/float columns can store IEEE NaN, which breaks numeric calculations.
-- Run once: psql $DATABASE_URL -f scripts/clean_nan_stats.sql

UPDATE player_season_stats
SET ppg = CASE WHEN ppg = 'NaN' THEN 0 ELSE ppg END,
    rpg = CASE WHEN rpg = 'NaN' THEN 0 ELSE rpg END,
    apg = CASE WHEN apg = 'NaN' THEN 0 ELSE apg END,
    spg = CASE WHEN spg = 'NaN' THEN 0 ELSE spg END,
    bpg = CASE WHEN bpg = 'NaN' THEN 0 ELSE bpg END,
    fg_pct = CASE WHEN fg_pct = 'NaN' THEN 0 ELSE fg_pct END,
    ft_pct = CASE WHEN ft_pct = 'NaN' THEN 0 ELSE ft_pct END,
    three_pct = CASE WHEN three_pct = 'NaN' THEN 0 ELSE three_pct END,
    minutes_pg = CASE WHEN minutes_pg = 'NaN' THEN 0 ELSE minutes_pg END
WHERE ppg = 'NaN' OR rpg = 'NaN' OR apg = 'NaN' OR spg = 'NaN' OR bpg = 'NaN'
   OR fg_pct = 'NaN' OR ft_pct = 'NaN' OR three_pct = 'NaN' OR minutes_pg = 'NaN';
