-- Per-org ERP: trading parties and a credit ledger

CREATE TABLE `party` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`kind` text DEFAULT 'customer' NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`tax_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `party_organizationId_idx` ON `party` (`organization_id`);
CREATE TABLE `ledger_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`party_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`memo` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`party_id`) REFERENCES `party`(`id`) ON UPDATE no action ON DELETE restrict
);
CREATE INDEX `ledger_entry_organizationId_idx` ON `ledger_entry` (`organization_id`);
CREATE INDEX `ledger_entry_partyId_idx` ON `ledger_entry` (`party_id`);
