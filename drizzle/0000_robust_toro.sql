CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`topic` text NOT NULL,
	`message` text NOT NULL,
	`quote_json` text,
	`ip_hash` text NOT NULL,
	`consent_version` text NOT NULL,
	`request_hash` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `leads_rate_limit` ON `leads` (`ip_hash`,`created_at`);