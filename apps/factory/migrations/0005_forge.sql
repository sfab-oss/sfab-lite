-- Forge: PRs and check runs. Preview builds are keyed by PR (pull_request.preview_sha).
-- Greenfield: no backfill.

CREATE TABLE `pull_request` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`head_branch` text NOT NULL,
	`base_branch` text DEFAULT 'main' NOT NULL,
	`head_sha` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`preview_sha` text,
	`merged_sha` text,
	`merged_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `app`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX `pull_request_app_number_uidx` ON `pull_request` (`app_id`,`number`);
CREATE INDEX `pull_request_app_status_idx` ON `pull_request` (`app_id`,`status`);
CREATE INDEX `pull_request_app_head_branch_idx` ON `pull_request` (`app_id`,`head_branch`);

CREATE TABLE `check_run` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`pr_id` text,
	`sha` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`conclusion` text,
	`detail` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`app_id`) REFERENCES `app`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pr_id`) REFERENCES `pull_request`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE INDEX `check_run_app_sha_idx` ON `check_run` (`app_id`,`sha`);
CREATE INDEX `check_run_pr_idx` ON `check_run` (`pr_id`);
CREATE INDEX `check_run_app_created_idx` ON `check_run` (`app_id`,`created_at`);
