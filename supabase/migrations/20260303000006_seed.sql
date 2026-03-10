-- =============================================================================
-- Seed: baseline roles
-- =============================================================================
insert into public.roles (name) values
  ('admin'),
  ('user'),
  ('viewer')
on conflict (name) do nothing;

-- =============================================================================
-- Seed: default organization (required before any user can register)
-- =============================================================================
insert into public.organizations (name) values
  ('Default Organization')
on conflict do nothing;
