CREATE TABLE `ussd_sends` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`pocket_id` text NOT NULL,
	`receiver_id` text NOT NULL,
	`username` text NOT NULL,
	`amount` text NOT NULL,
	`status` text NOT NULL,
	`hash` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ussd_sends_phone` ON `ussd_sends` (`phone`,`created_at`);