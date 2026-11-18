CREATE TABLE `ratings` (
	`user_id` text NOT NULL,
	`track_id` integer NOT NULL,
	`song` text NOT NULL,
	`score` real NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `track_id`)
);
