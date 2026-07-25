-- The app registry. Exists because Durable Objects cannot be enumerated:
-- without this table there is no way to answer "list my apps".
-- Source of truth for types: src/db/schema.ts

CREATE TABLE `app` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'creating' NOT NULL,
	`create_attempt_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `app_organizationId_idx` ON `app` (`organization_id`);
CREATE INDEX `app_status_idx` ON `app` (`status`);
