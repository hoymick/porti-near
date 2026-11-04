CREATE TABLE `charity_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`story` text NOT NULL,
	`budget` text NOT NULL,
	`recipient` text NOT NULL,
	`token` text NOT NULL,
	`symbol` text NOT NULL,
	`decimals` integer NOT NULL,
	`goal_raw` text NOT NULL,
	`evidence` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`reviewed_at` integer
);
--> statement-breakpoint
CREATE INDEX `charity_status` ON `charity_campaigns` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `charity_owner` ON `charity_campaigns` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `charity_donations` (
	`draft_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `charity_donation_campaign` ON `charity_donations` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `charity_reviews` (
	`campaign_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`decision` text NOT NULL,
	`checks` text NOT NULL,
	`notes` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `charity_independent_review` ON `charity_reviews` (`campaign_id`,`reviewer_id`);