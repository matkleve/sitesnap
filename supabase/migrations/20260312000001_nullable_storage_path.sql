-- =============================================================================
-- Allow photoless image rows by making storage_path nullable.
--
-- Photoless datapoints are images rows created via folder import, manual
-- address entry, or other workflows where no photo file exists yet.
-- The attach pipeline (UploadAttachPipelineService) later fills in
-- storage_path when a user uploads a photo to one of these rows.
-- =============================================================================

ALTER TABLE public.images ALTER COLUMN storage_path DROP NOT NULL;
