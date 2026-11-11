CREATE TABLE `ussd_phones` (
	`phone` text PRIMARY KEY NOT NULL,
	`pocket_id` text NOT NULL,
	`owner_id` text,
	`channel` text NOT NULL,
	`pin_hash` text,
	`pin_failures` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ussd_phones_pocket` ON `ussd_phones` (`pocket_id`);--> statement-breakpoint
CREATE TABLE `ussd_sessions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`channel` text NOT NULL,
	`state` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ussd_sessions_expiry` ON `ussd_sessions` (`expires_at`);