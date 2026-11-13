CREATE TABLE `auth_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`nonce` text NOT NULL,
	`recipient` text NOT NULL,
	`message` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_challenges_expiry` ON `auth_challenges` (`expires_at`);--> statement-breakpoint
CREATE TABLE `porti_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `porti_sessions_expiry` ON `porti_sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `porti_sessions_account` ON `porti_sessions` (`account_id`);