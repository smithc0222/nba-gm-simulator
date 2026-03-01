import { pgTable, serial, integer, varchar, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';
import { players } from './players';

export const drafts = pgTable('drafts', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  createdBy: integer('created_by').notNull().references(() => users.id),
  status: varchar('status', { length: 20 }).notNull().default('waiting'),
  criteria: jsonb('criteria').notNull(),
  currentPickNumber: integer('current_pick_number').notNull().default(0),
  shareCode: varchar('share_code', { length: 21 }).notNull().unique(),
  mode: varchar('mode', { length: 10 }).notNull().default('online'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const draftParticipants = pgTable('draft_participants', {
  id: serial('id').primaryKey(),
  draftId: integer('draft_id').notNull().references(() => drafts.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id),
  pickOrder: integer('pick_order').notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('draft_participants_unique').on(table.draftId, table.userId),
]);

export const draftPicks = pgTable('draft_picks', {
  id: serial('id').primaryKey(),
  draftId: integer('draft_id').notNull().references(() => drafts.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id),
  playerId: integer('player_id').notNull().references(() => players.id),
  pickNumber: integer('pick_number').notNull(),
  assignedPosition: varchar('assigned_position', { length: 2 }).notNull(),
}, (table) => [
  uniqueIndex('draft_picks_unique').on(table.draftId, table.pickNumber),
]);
