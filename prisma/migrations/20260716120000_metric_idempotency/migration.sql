-- Prevent duplicate metrics when a provider snapshot is retried.
ALTER TABLE "assets" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

DELETE FROM "asset_metrics" a
USING "asset_metrics" b
WHERE a."asset_id" = b."asset_id"
  AND a."captured_at" = b."captured_at"
  AND a."id" > b."id";

CREATE UNIQUE INDEX "asset_metrics_asset_id_captured_at_key"
ON "asset_metrics"("asset_id", "captured_at");

CREATE INDEX "assets_is_active_rank_idx" ON "assets"("is_active", "rank");
