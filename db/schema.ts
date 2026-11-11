import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
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

export const friendLinks=sqliteTable('friend_links',{pair:text('pair').primaryKey(),a:text('a').notNull(),b:text('b').notNull(),requester:text('requester').notNull(),status:text('status').notNull(),blocker:text('blocker'),updatedAt:integer('updated_at').notNull()},t=>[index('friend_a').on(t.a),index('friend_b').on(t.b)]);
export const friendMessages=sqliteTable('friend_messages',{id:text('id').primaryKey(),pair:text('pair').notNull(),sender:text('sender').notNull(),body:text('body').notNull(),createdAt:integer('created_at').notNull()},t=>[index('messages_pair').on(t.pair,t.createdAt)]);
export const chatGroups=sqliteTable('chat_groups',{id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),title:text('title').notNull(),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull()},t=>[index('chat_group_owner').on(t.ownerId)]);
export const chatGroupMembers=sqliteTable('chat_group_members',{groupId:text('group_id').notNull(),memberId:text('member_id').notNull(),status:text('status').notNull(),afterSeq:integer('after_seq').notNull().default(0),updatedAt:integer('updated_at').notNull()},t=>[uniqueIndex('chat_group_member').on(t.groupId,t.memberId),index('chat_member_groups').on(t.memberId,t.status)]);
export const chatGroupMessages=sqliteTable('chat_group_messages',{seq:integer('seq').primaryKey({autoIncrement:true}),id:text('id').notNull().unique(),groupId:text('group_id').notNull(),sender:text('sender').notNull(),body:text('body').notNull(),createdAt:integer('created_at').notNull()},t=>[index('chat_group_history').on(t.groupId,t.seq)]);
export const portiTelegramBots=sqliteTable('porti_telegram_bots',{ownerId:text('owner_id').primaryKey(),botId:text('bot_id').notNull().unique(),state:text('state').notNull(),leaseUntil:integer('lease_until').notNull().default(0),leaseId:text('lease_id')});
export const portiTelegramOutbox=sqliteTable('porti_telegram_outbox',{id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),text:text('text').notNull(),version:text('version').notNull(),status:text('status').notNull().default('pending'),attempts:integer('attempts').notNull().default(0),nextAt:integer('next_at').notNull().default(0),createdAt:integer('created_at').notNull(),sentAt:integer('sent_at'),messageId:integer('message_id')},t=>[index('porti_telegram_due').on(t.ownerId,t.status,t.nextAt)]);
export const portiRuns=sqliteTable('porti_runs',{id:text('id').primaryKey(),value:text('value').notNull()});
export const portiLimits=sqliteTable('porti_limits',{id:text('id').primaryKey(),count:integer('count').notNull(),expiresAt:integer('expires_at').notNull()},t=>[index('porti_limits_expiry').on(t.expiresAt)]);
export const transferReceipts=sqliteTable('porti_transfer_receipts',{id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),hash:text('hash').notNull(),draftId:text('draft_id').notNull(),receipt:text('receipt').notNull(),createdAt:integer('created_at').notNull()},t=>[uniqueIndex('receipt_owner_hash').on(t.ownerId,t.hash),uniqueIndex('receipt_owner_draft').on(t.ownerId,t.draftId)]);

export const charityCampaigns=sqliteTable('charity_campaigns',{id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),title:text('title').notNull(),story:text('story').notNull(),budget:text('budget').notNull(),recipient:text('recipient').notNull(),token:text('token').notNull(),symbol:text('symbol').notNull(),decimals:integer('decimals').notNull(),goalRaw:text('goal_raw').notNull(),evidence:text('evidence').notNull(),status:text('status').notNull().default('pending'),createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at').notNull(),reviewedAt:integer('reviewed_at')},t=>[index('charity_status').on(t.status,t.createdAt),index('charity_owner').on(t.ownerId,t.createdAt)]);
export const charityReviews=sqliteTable('charity_reviews',{campaignId:text('campaign_id').notNull(),reviewerId:text('reviewer_id').notNull(),decision:text('decision').notNull(),checks:text('checks').notNull(),notes:text('notes').notNull(),createdAt:integer('created_at').notNull()},t=>[uniqueIndex('charity_independent_review').on(t.campaignId,t.reviewerId)]);
export const charityDonations=sqliteTable('charity_donations',{draftId:text('draft_id').primaryKey(),campaignId:text('campaign_id').notNull(),ownerId:text('owner_id').notNull(),createdAt:integer('created_at').notNull()},t=>[index('charity_donation_campaign').on(t.campaignId)]);

// Porti Pocket over USSD. Phones map to a pocket account; sessions hold short-lived menu context.
export const ussdPhones=sqliteTable('ussd_phones',{phone:text('phone').primaryKey(),pocketId:text('pocket_id').notNull(),ownerId:text('owner_id'),channel:text('channel').notNull(),pinHash:text('pin_hash'),pinFailures:integer('pin_failures').notNull().default(0),lockedUntil:integer('locked_until'),createdAt:integer('created_at').notNull()},t=>[index('ussd_phones_pocket').on(t.pocketId)]);
export const ussdSessions=sqliteTable('ussd_sessions',{sessionId:text('session_id').primaryKey(),phone:text('phone').notNull(),channel:text('channel').notNull(),state:text('state').notNull(),expiresAt:integer('expires_at').notNull()},t=>[index('ussd_sessions_expiry').on(t.expiresAt)]);
