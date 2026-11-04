import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const workspaces = sqliteTable('workspaces', {
  ownerId: text('owner_id').primaryKey(),
  state: text('state').notNull(),
  revision: integer('revision').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
});
export const profiles = sqliteTable('profiles', {
  username: text('username').primaryKey(),
  ownerId: text('owner_id').notNull().unique(),
  wallet: text('wallet').notNull().unique(),
  verifiedAt: integer('verified_at').notNull(),
  version: text('version').notNull(),
});

export const telegramBots = sqliteTable('telegram_bots', {
 ownerId:text('owner_id').primaryKey(),botId:text('bot_id').notNull().unique(),username:text('username').notNull(),tokenCipher:text('token_cipher').notNull(),
 updateOffset:integer('update_offset').notNull().default(0),leaseUntil:integer('lease_until').notNull().default(0),lastRun:integer('last_run'),lastError:text('last_error'),
});
export const telegramLinks = sqliteTable('telegram_links', {
 ownerId:text('owner_id').primaryKey(),chatId:text('chat_id'),chatLabel:text('chat_label'),version:text('version').notNull(),
 challengeHash:text('challenge_hash').unique(),challengeExpires:integer('challenge_expires'),candidateChat:text('candidate_chat'),candidateLabel:text('candidate_label'),
 preferences:text('preferences').notNull(),lastDigestDay:text('last_digest_day'),linkedAt:integer('linked_at'),
});
export const telegramOutbox = sqliteTable('telegram_outbox', {
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),eventKey:text('event_key').notNull().unique(),linkVersion:text('link_version').notNull(),
 type:text('type').notNull(),body:text('body').notNull(),status:text('status').notNull().default('pending'),attempts:integer('attempts').notNull().default(0),
 nextAt:integer('next_at').notNull(),leaseUntil:integer('lease_until').notNull().default(0),createdAt:integer('created_at').notNull(),sentAt:integer('sent_at'),lastError:text('last_error'),
});
export const telegramRuns = sqliteTable('telegram_runs', {
 id:text('id').primaryKey(),lastRun:integer('last_run'),lastResult:text('last_result'),
});
