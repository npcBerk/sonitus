-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('idle', 'running', 'success', 'failed');

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "market_cap_change_24h" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image_url" TEXT,
    "category_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "current_market_cap" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "current_volume" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sparkline" DOUBLE PRECISION[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_metrics" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "price" DOUBLE PRECISION NOT NULL,
    "market_cap" DOUBLE PRECISION NOT NULL,
    "volume_24h" DOUBLE PRECISION NOT NULL,
    "change_1h" DOUBLE PRECISION NOT NULL,
    "change_24h" DOUBLE PRECISION NOT NULL,
    "volume_delta_24h" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_jobs" (
    "id" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scan_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cache_snapshots" (
    "id" TEXT NOT NULL,
    "snapshot_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "refreshed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cache_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_provider_id_key" ON "categories"("provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "assets_provider_id_key" ON "assets"("provider_id");

-- CreateIndex
CREATE INDEX "assets_symbol_idx" ON "assets"("symbol");

-- CreateIndex
CREATE INDEX "assets_rank_idx" ON "assets"("rank");

-- CreateIndex
CREATE INDEX "asset_metrics_asset_id_captured_at_idx" ON "asset_metrics"("asset_id", "captured_at");

-- CreateIndex
CREATE INDEX "scan_jobs_status_started_at_idx" ON "scan_jobs"("status", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "cache_snapshots_snapshot_type_key" ON "cache_snapshots"("snapshot_type");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_metrics" ADD CONSTRAINT "asset_metrics_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
