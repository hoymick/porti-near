CREATE TABLE `friend_links` (
	`pair` text PRIMARY KEY NOT NULL,
	`a` text NOT NULL,
	`b` text NOT NULL,
	`requester` text NOT NULL,
	`status` text NOT NULL,
	`blocker` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `friend_a` ON `friend_links` (`a`);--> statement-breakpoint
CREATE INDEX `friend_b` ON `friend_links` (`b`);--> statement-breakpoint
CREATE TABLE `friend_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`pair` text NOT NULL,
	`sender` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_pair` ON `friend_messages` (`pair`,`created_at`);--> statement-breakpoint
CREATE TABLE `porti_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `porti_telegram_bots` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`bot_id` text NOT NULL,
	`state` text NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`lease_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `porti_telegram_bots_bot_id_unique` ON `porti_telegram_bots` (`bot_id`);--> statement-breakpoint
CREATE TABLE `porti_telegram_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`text` text NOT NULL,
	`version` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_at` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	`message_id` integer
);
--> statement-breakpoint
CREATE INDEX `porti_telegram_due` ON `porti_telegram_outbox` (`owner_id`,`status`,`next_at`);