import { pgTable, serial, integer, varchar, jsonb, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { drafts } from './drafts';

export const series = pgTable('series', {
  id: serial('id').primaryKey(),
  draftId: integer('draft_id').notNull().references(() => drafts.id, { onDelete: 'cascade' }),
  team1UserId: integer('team1_user_id').notNull().references(() => users.id),
  team2UserId: integer('team2_user_id').notNull().references(() => users.id),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  winnerUserId: integer('winner_user_id').references(() => users.id),
}, (table) => [
  index('idx_series_draft_id').on(table.draftId),
]);

export const seriesGames = pgTable('series_games', {
  id: serial('id').primaryKey(),
  seriesId: integer('series_id').notNull().references(() => series.id, { onDelete: 'cascade' }),
  gameNumber: integer('game_number').notNull(),
  team1Score: integer('team1_score').notNull(),
  team2Score: integer('team2_score').notNull(),
  winnerUserId: integer('winner_user_id').notNull().references(() => users.id),
  gameLog: jsonb('game_log').notNull(),
}, (table) => [
  index('idx_series_games_series_id').on(table.seriesId),
]);
