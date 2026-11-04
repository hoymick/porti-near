CREATE TABLE `porti_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `porti_limits_expiry` ON `porti_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `porti_transfer_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`hash` text NOT NULL,
	`draft_id` text NOT NULL,
	`receipt` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_owner_hash` ON `porti_transfer_receipts` (`owner_id`,`hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_owner_draft` ON `porti_transfer_receipts` (`owner_id`,`draft_id`);