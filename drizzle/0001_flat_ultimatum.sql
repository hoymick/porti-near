CREATE TABLE `profiles` (
	`username` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`wallet` text NOT NULL,
	`verified_at` integer NOT NULL,
	`version` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_owner_id_unique` ON `profiles` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_wallet_unique` ON `profiles` (`wallet`);