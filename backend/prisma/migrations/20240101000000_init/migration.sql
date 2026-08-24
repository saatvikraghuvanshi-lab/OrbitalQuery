-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'researcher',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "eo_datasets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stac_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "provider" TEXT NOT NULL,
    "collection" TEXT,
    "platform" TEXT,
    "instrument" TEXT,
    "gsd" REAL,
    "cloud_cover" REAL,
    "geometry" TEXT NOT NULL,
    "bbox" TEXT,
    "centroid_lat" REAL,
    "centroid_lng" REAL,
    "start_date" TEXT,
    "end_date" TEXT,
    "assets" TEXT,
    "stac_link" TEXT,
    "preview_url" TEXT,
    "capabilities" TEXT,
    "temporal_res" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "has_embedding" BOOLEAN NOT NULL DEFAULT false,
    "embedding_id" INTEGER
);

-- CreateTable
CREATE TABLE "search_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "query" TEXT NOT NULL,
    "filters" TEXT,
    "result_count" INTEGER NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "user_id" TEXT,
    "ip_address" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "eo_datasets_stac_id_key" ON "eo_datasets"("stac_id");

-- CreateIndex
CREATE INDEX "eo_datasets_provider_idx" ON "eo_datasets"("provider");

-- CreateIndex
CREATE INDEX "eo_datasets_collection_idx" ON "eo_datasets"("collection");
