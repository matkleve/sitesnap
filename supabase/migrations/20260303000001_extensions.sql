-- Enable PostGIS for spatial queries
create extension if not exists postgis with schema extensions;

-- Enable uuid generation (often pre-enabled in Supabase, safe to re-run)
create extension if not exists "uuid-ossp" with schema extensions;
