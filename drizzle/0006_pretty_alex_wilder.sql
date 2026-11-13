CREATE TABLE `chat_group_members` (
	`group_id` text NOT NULL,
	`member_id` text NOT NULL,
	`status` text NOT NULL,
	`after_seq` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_group_member` ON `chat_group_members` (`group_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `chat_member_groups` ON `chat_group_members` (`member_id`,`status`);--> statement-breakpoint
CREATE TABLE `chat_group_messages` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`group_id` text NOT NULL,
	`sender` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_group_messages_id_unique` ON `chat_group_messages` (`id`);--> statement-breakpoint
CREATE INDEX `chat_group_history` ON `chat_group_messages` (`group_id`,`seq`);--> statement-breakpoint
CREATE TABLE `chat_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chat_group_owner` ON `chat_groups` (`owner_id`);