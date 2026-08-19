-- Org-scoped catalog items and AR invoices (header + lines)

CREATE TABLE `item` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`sku` text,
	`unit_price_cents` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `item_organizationId_idx` ON `item` (`organization_id`);
CREATE TABLE `invoice` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`party_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`memo` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`party_id`) REFERENCES `party`(`id`) ON UPDATE no action ON DELETE restrict
);
CREATE INDEX `invoice_organizationId_idx` ON `invoice` (`organization_id`);
CREATE INDEX `invoice_partyId_idx` ON `invoice` (`party_id`);
CREATE TABLE `invoice_line` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`item_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_cents` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoice`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE restrict
);
CREATE INDEX `invoice_line_organizationId_idx` ON `invoice_line` (`organization_id`);
CREATE INDEX `invoice_line_invoiceId_idx` ON `invoice_line` (`invoice_id`);
CREATE INDEX `invoice_line_itemId_idx` ON `invoice_line` (`item_id`);
