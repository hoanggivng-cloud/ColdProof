-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MeasurementOrigin" AS ENUM ('REAL_PUBLIC_DATA', 'DERIVED', 'SYNTHETIC');

-- CreateEnum
CREATE TYPE "BusinessContextOrigin" AS ENUM ('REAL', 'SYNTHETIC');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('QUEUED', 'PARSING', 'NORMALIZING', 'QUALITY_CHECK', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_assets" (
    "id" UUID NOT NULL,
    "dataset" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "version" TEXT NOT NULL,
    "origin" "MeasurementOrigin" NOT NULL,
    "uri" TEXT,
    "license_ref" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imports" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "parser_id" TEXT NOT NULL,
    "parser_version" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'QUEUED',
    "parsed_count" INTEGER NOT NULL DEFAULT 0,
    "rejected_count" INTEGER NOT NULL DEFAULT 0,
    "warning_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenarios" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" TEXT NOT NULL,
    "scenario_id" TEXT,
    "business_context_origin" "BusinessContextOrigin" NOT NULL DEFAULT 'SYNTHETIC',
    "profile_id" TEXT,
    "lower_threshold" DOUBLE PRECISION,
    "upper_threshold" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segments" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "source_id" UUID,
    "selector" TEXT NOT NULL,
    "handover_id" TEXT,
    "business_context_origin" "BusinessContextOrigin" NOT NULL DEFAULT 'SYNTHETIC',

    CONSTRAINT "segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurements" (
    "record_id" TEXT NOT NULL,
    "scenario_id" TEXT,
    "batch_id" TEXT,
    "segment_id" TEXT,
    "timestamp" TIMESTAMPTZ(3),
    "temperature_c" DOUBLE PRECISION,
    "humidity_pct" DOUBLE PRECISION,
    "source_dataset" TEXT NOT NULL,
    "source_file" TEXT NOT NULL,
    "source_sensor_id" TEXT,
    "source_row_or_ref" TEXT NOT NULL,
    "source_format" TEXT NOT NULL,
    "parser_id" TEXT NOT NULL,
    "parser_version" TEXT NOT NULL,
    "measurement_origin" "MeasurementOrigin" NOT NULL,
    "business_context_origin" "BusinessContextOrigin" NOT NULL,
    "missing_flag" BOOLEAN NOT NULL DEFAULT false,
    "duplicate_flag" BOOLEAN NOT NULL DEFAULT false,
    "conflict_flag" BOOLEAN NOT NULL DEFAULT false,
    "data_quality_code" TEXT,
    "profile_id" TEXT,
    "lower_threshold" DOUBLE PRECISION,
    "upper_threshold" DOUBLE PRECISION,
    "excursion_flag" BOOLEAN,
    "exception_id" TEXT,
    "review_status" TEXT,

    CONSTRAINT "measurements_pkey" PRIMARY KEY ("record_id")
);

-- CreateTable
CREATE TABLE "spatial_measurements" (
    "record_id" TEXT NOT NULL,
    "source_dataset" TEXT NOT NULL,
    "source_file" TEXT NOT NULL,
    "source_row_or_ref" TEXT NOT NULL,
    "parser_id" TEXT NOT NULL,
    "parser_version" TEXT NOT NULL,
    "measurement_origin" "MeasurementOrigin" NOT NULL,
    "condition_id" TEXT NOT NULL,
    "position_x" DOUBLE PRECISION NOT NULL,
    "position_y" DOUBLE PRECISION NOT NULL,
    "position_z" DOUBLE PRECISION,
    "temperature_c" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "spatial_measurements_pkey" PRIMARY KEY ("record_id")
);

-- CreateTable
CREATE TABLE "quality_issues" (
    "id" UUID NOT NULL,
    "record_ids" TEXT[],
    "code" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quality_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exceptions" (
    "id" UUID NOT NULL,
    "batch_id" TEXT NOT NULL,
    "record_ids" TEXT[],
    "profile_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "exception_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "batch_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "uri" TEXT,
    "checksum_sha256" CHAR(64),
    "provenance" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "source_assets_dataset_file_name_version_key" ON "source_assets"("dataset", "file_name", "version");

-- CreateIndex
CREATE INDEX "imports_source_id_idx" ON "imports"("source_id");

-- CreateIndex
CREATE INDEX "segments_batch_id_idx" ON "segments"("batch_id");

-- CreateIndex
CREATE INDEX "measurements_source_dataset_source_file_source_row_or_ref_idx" ON "measurements"("source_dataset", "source_file", "source_row_or_ref");

-- CreateIndex
CREATE INDEX "measurements_batch_id_timestamp_idx" ON "measurements"("batch_id", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "reports_batch_id_version_key" ON "reports"("batch_id", "version");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
