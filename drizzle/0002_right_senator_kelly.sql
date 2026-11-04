CREATE TABLE `telegram_bots` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`bot_id` text NOT NULL,
	`username` text NOT NULL,
	`token_cipher` text NOT NULL,
	`update_offset` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`last_run` integer,
	`last_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_bots_bot_id_unique` ON `telegram_bots` (`bot_id`);--> statement-breakpoint
CREATE TABLE `telegram_links` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`chat_id` text,
	`chat_label` text,
	`version` text NOT NULL,
	`challenge_hash` text,
	`challenge_expires` integer,
	`candidate_chat` text,
	`candidate_label` text,
	`preferences` text NOT NULL,
	`last_digest_day` text,
	`linked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_links_challenge_hash_unique` ON `telegram_links` (`challenge_hash`);--> statement-breakpoint
CREATE TABLE `telegram_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`event_key` text NOT NULL,
	`link_version` text NOT NULL,
	`type` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_at` integer NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	`last_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_outbox_event_key_unique` ON `telegram_outbox` (`event_key`);--> statement-breakpoint
CREATE TABLE `telegram_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`last_run` integer,
	`last_result` text
);
