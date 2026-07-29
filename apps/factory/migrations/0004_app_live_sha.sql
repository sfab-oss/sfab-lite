-- Live tip sha for each app. Serve loads the immutable build from CODE_R2
-- at builds/{appId}/{live_sha}.json. Greenfield: no backfill.
ALTER TABLE `app` ADD COLUMN `live_sha` text;
