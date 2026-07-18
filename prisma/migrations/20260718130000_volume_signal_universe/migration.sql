CREATE TYPE "VolumeBaselineStatus" AS ENUM ('warming_up', 'ready', 'missing', 'stale');

ALTER TABLE "assets"
ADD COLUMN "candidate_last_seen_at" TIMESTAMP(3),
ADD COLUMN "tracked_until" TIMESTAMP(3);

ALTER TABLE "asset_metrics"
ALTER COLUMN "volume_delta_24h" DROP NOT NULL,
ADD COLUMN "baseline_volume" DOUBLE PRECISION,
ADD COLUMN "baseline_captured_at" TIMESTAMP(3),
ADD COLUMN "absolute_volume_delta" DOUBLE PRECISION,
ADD COLUMN "volume_signal_score" DOUBLE PRECISION,
ADD COLUMN "baseline_status" "VolumeBaselineStatus" NOT NULL DEFAULT 'warming_up',
ADD COLUMN "provider_updated_at" TIMESTAMP(3);

UPDATE "assets"
SET "candidate_last_seen_at" = "updated_at",
    "tracked_until" = "updated_at" + INTERVAL '48 hours'
WHERE "is_active" = true;

UPDATE "asset_metrics"
SET "provider_updated_at" = "captured_at",
    "baseline_status" = 'missing'::"VolumeBaselineStatus";

ALTER TABLE "asset_metrics"
ALTER COLUMN "provider_updated_at" SET NOT NULL;

CREATE INDEX "assets_is_active_tracked_until_idx" ON "assets"("is_active", "tracked_until");
