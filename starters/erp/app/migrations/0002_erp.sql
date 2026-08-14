-- Per-org ERP: trading parties, catalog, and the invoices built from them

CREATE TABLE `entity` (
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
CREATE INDEX `entity_organizationId_idx` ON `entity` (`organization_id`);
CREATE TABLE `product` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`unit_price_cents` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `product_organizationId_idx` ON `product` (`organization_id`);
CREATE UNIQUE INDEX `product_organizationId_sku_unique` ON `product` (`organization_id`,`sku`);
CREATE TABLE `document` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`entity_name_snapshot` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`number` integer,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`issued_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entity_id`) REFERENCES `entity`(`id`) ON UPDATE no action ON DELETE restrict
);
CREATE INDEX `document_organizationId_idx` ON `document` (`organization_id`);
CREATE INDEX `document_entityId_idx` ON `document` (`entity_id`);
CREATE UNIQUE INDEX `document_organizationId_number_unique` ON `document` (`organization_id`,`number`);
CREATE TABLE `document_line` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`product_id` text,
	`name_snapshot` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price_cents` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `document`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE set null
);
CREATE INDEX `document_line_documentId_idx` ON `document_line` (`document_id`);
