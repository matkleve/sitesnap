-- =============================================================================
-- SEED: Thousands of realistic construction-site images in Vienna
-- Run this in the Supabase SQL Editor (runs as postgres, bypasses RLS)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Ensure prerequisites exist
-- ---------------------------------------------------------------------------
INSERT INTO public.roles (name) VALUES ('admin'), ('user'), ('viewer')
ON CONFLICT (name) DO NOTHING;

-- Use the Default Organization that the registration trigger assigns.
-- If it doesn't exist yet, create it. We look it up dynamically later.
INSERT INTO public.organizations (name)
VALUES ('Default Organization')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1. Create test users in auth.users
-- ---------------------------------------------------------------------------
-- 6 users: 5 field technicians + 1 office uploader
-- Password for all: "testpass123!"
DO $$
DECLARE
  _users text[][] := ARRAY[
    ARRAY['b0000000-0000-0000-0000-000000000001', 'markus.gruber@wbau.at',   'Markus Gruber'],
    ARRAY['b0000000-0000-0000-0000-000000000002', 'anna.steiner@wbau.at',    'Anna Steiner'],
    ARRAY['b0000000-0000-0000-0000-000000000003', 'thomas.wagner@wbau.at',   'Thomas Wagner'],
    ARRAY['b0000000-0000-0000-0000-000000000004', 'lisa.bauer@wbau.at',      'Lisa Bauer'],
    ARRAY['b0000000-0000-0000-0000-000000000005', 'josef.huber@wbau.at',     'Josef Huber'],
    ARRAY['b0000000-0000-0000-0000-000000000006', 'sandra.berger@wbau.at',   'Sandra Berger']
  ];
  _u text[];
  _uid uuid;
  _org_id uuid;
  _role_user uuid;
  _role_admin uuid;
BEGIN
  -- Dynamically find the Default Organization
  SELECT id INTO _org_id FROM public.organizations WHERE name = 'Default Organization' LIMIT 1;
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Default Organization not found — run the roles/org seed first';
  END IF;
  SELECT id INTO _role_user  FROM public.roles WHERE name = 'user';
  SELECT id INTO _role_admin FROM public.roles WHERE name = 'admin';

  FOREACH _u SLICE 1 IN ARRAY _users LOOP
    _uid := _u[1]::uuid;

    -- Skip if user already exists
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _uid) THEN
      INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token
      ) VALUES (
        _uid,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        _u[2],
        crypt('testpass123!', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', _u[3]),
        now(), now(), '', ''
      );
    END IF;

    -- Profile
    INSERT INTO public.profiles (id, organization_id, full_name)
    VALUES (_uid, _org_id, _u[3])
    ON CONFLICT (id) DO NOTHING;

    -- Role: first user is admin, rest are regular users
    IF _u[1] = 'b0000000-0000-0000-0000-000000000001' THEN
      INSERT INTO public.user_roles (user_id, role_id) VALUES (_uid, _role_admin)
      ON CONFLICT (user_id, role_id) DO NOTHING;
    ELSE
      INSERT INTO public.user_roles (user_id, role_id) VALUES (_uid, _role_user)
      ON CONFLICT (user_id, role_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Create projects
-- ---------------------------------------------------------------------------
DO $$
DECLARE _org_id uuid;
BEGIN
  SELECT id INTO _org_id FROM public.organizations WHERE name = 'Default Organization' LIMIT 1;

  INSERT INTO public.projects (id, organization_id, created_by, name, description) VALUES
    ('c0000000-0000-0000-0000-000000000001', _org_id, 'b0000000-0000-0000-0000-000000000001',
     'Aspern Seestadt Bauabschnitt D12', 'Wohnbau Seestadt, 120 Einheiten, Fertigstellung Q4/2026'),
    ('c0000000-0000-0000-0000-000000000002', _org_id, 'b0000000-0000-0000-0000-000000000001',
     'Nordbahnviertel Block 7', 'Revitalisierung ehem. Bahnhofsgelände, Mischnutzung'),
    ('c0000000-0000-0000-0000-000000000003', _org_id, 'b0000000-0000-0000-0000-000000000002',
     'Sonnwendviertel Süd', 'Wohnanlage mit Tiefgarage, 85 Einheiten'),
    ('c0000000-0000-0000-0000-000000000004', _org_id, 'b0000000-0000-0000-0000-000000000003',
     'Mariahilfer Straße 78 Sanierung', 'Gründerzeit-Sanierung, Dachgeschossausbau'),
    ('c0000000-0000-0000-0000-000000000005', _org_id, 'b0000000-0000-0000-0000-000000000001',
     'Kagran Donauzentrum Erweiterung', 'Erweiterungsbau Einkaufszentrum Ost-Trakt'),
    ('c0000000-0000-0000-0000-000000000006', _org_id, 'b0000000-0000-0000-0000-000000000004',
     'Liesing Gewerbepark', 'Industriepark-Konversion, 3 Hallen'),
    ('c0000000-0000-0000-0000-000000000007', _org_id, 'b0000000-0000-0000-0000-000000000002',
     'Floridsdorf Bahnhofcity', 'Hochbau über Gleisanlage, Büro & Wohnen'),
    ('c0000000-0000-0000-0000-000000000008', _org_id, 'b0000000-0000-0000-0000-000000000003',
     'Gürtel U-Bahn-Station Sanierung', 'Stationsmodernisierung U6 Burggasse'),
    ('c0000000-0000-0000-0000-000000000009', _org_id, 'b0000000-0000-0000-0000-000000000005',
     'Donauinsel Hochwasserschutz', 'Erneuerung Schutzmauer Abschnitt 4-7'),
    ('c0000000-0000-0000-0000-000000000010', _org_id, 'b0000000-0000-0000-0000-000000000001',
     'Favoriten Bildungscampus', 'Neubau Volksschule und Kindergarten'),
    ('c0000000-0000-0000-0000-000000000011', _org_id, 'b0000000-0000-0000-0000-000000000004',
     'Ottakring Brunnenmarkt Passage', 'Unterführung und Marktplatz-Neugestaltung'),
    ('c0000000-0000-0000-0000-000000000012', _org_id, 'b0000000-0000-0000-0000-000000000002',
     'DC Tower 3 Rohbau', 'Bürohochhaus 40 Stockwerke Donaucity')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Generate images using construction-site locations across Vienna
-- ---------------------------------------------------------------------------
-- Each site: center lat/lng, main direction (what the camera typically faces),
-- project assignment, date range, assigned technicians.
-- Total: ~2500 images
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _org_id   uuid;

  -- Technician user IDs (field workers rotate between sites)
  _techs    uuid[] := ARRAY[
    'b0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000003',
    'b0000000-0000-0000-0000-000000000004',
    'b0000000-0000-0000-0000-000000000005'
  ];
  _office   uuid := 'b0000000-0000-0000-0000-000000000006';  -- office uploader

  -- Site definitions:
  -- [0] lat, [1] lng, [2] direction_center (deg), [3] direction_spread (deg),
  -- [4] gps_jitter (degrees), [5] num_images, [6] project_index (1-based),
  -- [7] days_back_start, [8] days_back_end, [9] primary_tech_index (1-based)
  _sites    numeric[][] := ARRAY[
    -- Aspern Seestadt D12 — large new development, lots of photos
    ARRAY[48.2253, 16.5076, 135, 90, 0.0012, 280, 1, 300, 10, 1],
    -- Aspern Seestadt D12 — north entrance area
    ARRAY[48.2268, 16.5060, 200, 70, 0.0008, 160, 1, 280, 15, 2],
    -- Nordbahnviertel Block 7 — mid-size residential
    ARRAY[48.2282, 16.3781, 45, 80, 0.0010, 200, 2, 250, 5, 3],
    -- Nordbahnviertel Block 7 — south side
    ARRAY[48.2270, 16.3790, 320, 60, 0.0006, 120, 2, 240, 20, 3],
    -- Sonnwendviertel Süd
    ARRAY[48.1790, 16.3790, 180, 90, 0.0010, 200, 3, 200, 10, 4],
    -- Sonnwendviertel Süd — underground garage
    ARRAY[48.1785, 16.3780, 90, 45, 0.0004, 80, 3, 180, 30, 4],
    -- Mariahilfer Str 78 Sanierung — tight urban, few photos per visit
    ARRAY[48.1964, 16.3540, 270, 60, 0.0003, 150, 4, 350, 5, 2],
    -- Mariahilfer Str 78 — courtyard shots
    ARRAY[48.1962, 16.3537, 90, 120, 0.0002, 60, 4, 340, 20, 2],
    -- Kagran Donauzentrum Erweiterung
    ARRAY[48.2410, 16.4350, 160, 80, 0.0010, 170, 5, 220, 8, 5],
    -- Kagran Donauzentrum — parking structure
    ARRAY[48.2418, 16.4340, 250, 70, 0.0008, 90, 5, 200, 25, 5],
    -- Liesing Gewerbepark — industrial conversion
    ARRAY[48.1350, 16.3250, 30, 90, 0.0015, 130, 6, 280, 15, 1],
    -- Liesing Gewerbepark — Halle 2
    ARRAY[48.1345, 16.3270, 310, 60, 0.0008, 70, 6, 260, 30, 1],
    -- Floridsdorf Bahnhofcity
    ARRAY[48.2560, 16.3990, 190, 80, 0.0010, 160, 7, 180, 5, 3],
    -- Gürtel U6 Burggasse Station
    ARRAY[48.2030, 16.3450, 0, 90, 0.0004, 110, 8, 320, 20, 4],
    -- Gürtel U6 — tunnel section
    ARRAY[48.2025, 16.3443, 180, 50, 0.0003, 60, 8, 300, 40, 4],
    -- Donauinsel Hochwasserschutz
    ARRAY[48.2300, 16.4000, 90, 60, 0.0020, 120, 9, 150, 10, 5],
    -- Donauinsel — Abschnitt 6
    ARRAY[48.2340, 16.4020, 270, 50, 0.0015, 70, 9, 140, 20, 5],
    -- Favoriten Bildungscampus
    ARRAY[48.1650, 16.3800, 225, 90, 0.0008, 140, 10, 200, 8, 1],
    -- Ottakring Brunnenmarkt Passage
    ARRAY[48.2130, 16.3100, 135, 80, 0.0005, 100, 11, 260, 12, 2],
    -- DC Tower 3 Rohbau — high-rise, many photos, long project
    ARRAY[48.2344, 16.4130, 180, 120, 0.0006, 180, 12, 350, 5, 3],
    -- DC Tower 3 — ground level / lobby
    ARRAY[48.2340, 16.4135, 0, 90, 0.0004, 80, 12, 340, 15, 3],
    -- Stephansplatz underground utility — small sporadic site
    ARRAY[48.2085, 16.3731, 45, 120, 0.0002, 40, NULL, 120, 50, 4],
    -- Prater park facilities
    ARRAY[48.2100, 16.4050, 300, 100, 0.0010, 50, NULL, 90, 30, 5],
    -- Alte Donau waterfront homes
    ARRAY[48.2380, 16.4230, 220, 90, 0.0008, 60, NULL, 160, 40, 1],
    -- Meidling Schönbrunner Straße renovation
    ARRAY[48.1740, 16.3300, 350, 70, 0.0004, 50, NULL, 190, 60, 2]
  ];

  _s           numeric[];
  _site_idx    int := 0;
  _lat_center  numeric;
  _lng_center  numeric;
  _dir_center  numeric;
  _dir_spread  numeric;
  _jitter      numeric;
  _count       int;
  _proj_idx    int;
  _days_start  int;
  _days_end    int;
  _tech_idx    int;
  _proj_id     uuid;
  _user_id     uuid;
  _img_id      uuid;
  _lat         numeric;
  _lng         numeric;
  _dir         numeric;
  _captured    timestamptz;
  _created     timestamptz;
  _has_dir     boolean;
  _is_office   boolean;
  i            int;
  _visit_day   numeric;
  _visit_hour  numeric;
  _day_offset  numeric;
  -- For storage path
  _ext         text;
BEGIN
  -- Dynamically find the Default Organization
  SELECT id INTO _org_id FROM public.organizations WHERE name = 'Default Organization' LIMIT 1;

  FOREACH _s SLICE 1 IN ARRAY _sites LOOP
    _site_idx    := _site_idx + 1;
    _lat_center  := _s[1];
    _lng_center  := _s[2];
    _dir_center  := _s[3];
    _dir_spread  := _s[4];
    _jitter      := _s[5];
    _count       := _s[6]::int;
    _proj_idx    := _s[7]::int;
    _days_start  := _s[8]::int;
    _days_end    := _s[9]::int;
    _tech_idx    := _s[10]::int;

    -- Resolve project ID
    IF _proj_idx IS NOT NULL THEN
      _proj_id := ('c0000000-0000-0000-0000-' || lpad(_proj_idx::text, 12, '0'))::uuid;
    ELSE
      _proj_id := NULL;
    END IF;

    FOR i IN 1.._count LOOP
      -- ~15% of photos are office uploads (no direction, uploaded by Sandra)
      _is_office := random() < 0.15;

      IF _is_office THEN
        _user_id := _office;
      ELSE
        -- Rotate through technicians: primary tech gets 60%, others share 40%
        IF random() < 0.6 THEN
          _user_id := _techs[_tech_idx];
        ELSE
          _user_id := _techs[1 + floor(random() * 5)::int];
        END IF;
      END IF;

      -- Generate GPS with jitter (Gaussian-ish via sum of randoms)
      _lat := _lat_center + (_jitter * (random() + random() + random() - 1.5));
      _lng := _lng_center + (_jitter * (random() + random() + random() - 1.5));

      -- Clamp to valid range
      _lat := GREATEST(-90, LEAST(90, ROUND(_lat, 7)));
      _lng := GREATEST(-180, LEAST(180, ROUND(_lng, 7)));

      -- Direction: Gaussian-ish around center, with spread
      IF _is_office AND random() < 0.4 THEN
        -- 40% of office uploads have no direction (scanned docs, old photos)
        _dir := NULL;
      ELSE
        _dir := _dir_center + (_dir_spread * (random() + random() - 1.0));
        -- Wrap to 0-360
        _dir := ROUND((_dir::numeric % 360 + 360)::numeric % 360, 2);
      END IF;

      -- Captured timestamp: spread across the project timeframe
      -- Cluster into "visit days" — a technician visits and takes a batch
      _day_offset := _days_end + random() * (_days_start - _days_end);
      -- Add some hour variation (workday: 7am-5pm)
      _visit_hour := 7 + random() * 10;
      _captured := (now() - (_day_offset || ' days')::interval)
                 + (_visit_hour || ' hours')::interval
                 + (floor(random() * 60) || ' minutes')::interval;

      -- Created_at: same as captured for field uploads, 1-7 days later for office
      IF _is_office THEN
        _created := _captured + ((1 + floor(random() * 7))::int || ' days')::interval;
      ELSE
        _created := _captured + (floor(random() * 30) || ' minutes')::interval;
      END IF;

      _img_id := gen_random_uuid();
      _ext := CASE WHEN random() < 0.9 THEN '.jpg' ELSE '.png' END;

      INSERT INTO public.images (
        id, user_id, organization_id, project_id,
        storage_path, thumbnail_path,
        exif_latitude, exif_longitude,
        latitude, longitude,
        direction, captured_at, created_at
      ) VALUES (
        _img_id,
        _user_id,
        _org_id,
        _proj_id,
        _org_id || '/' || _user_id || '/' || _img_id || _ext,
        _org_id || '/' || _user_id || '/' || _img_id || '_thumb' || _ext,
        _lat, _lng,    -- exif = original
        _lat, _lng,    -- user coords = same initially
        _dir,
        _captured,
        _created
      );
    END LOOP;

    RAISE NOTICE 'Site %: inserted % images (project %, tech %)',
      _site_idx, _count, _proj_idx, _tech_idx;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Add a handful of coordinate corrections (simulate real usage)
--    ~50 images get corrected (moved slightly by a different user)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _img   record;
  _new_lat numeric;
  _new_lng numeric;
  _corrector uuid;
  _techs uuid[] := ARRAY[
    'b0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000003'
  ];
BEGIN
  FOR _img IN
    SELECT id, latitude, longitude, user_id
    FROM public.images
    WHERE latitude IS NOT NULL
    ORDER BY random()
    LIMIT 50
  LOOP
    -- Small correction: 10-50m shift
    _new_lat := _img.latitude + (random() - 0.5) * 0.0008;
    _new_lng := _img.longitude + (random() - 0.5) * 0.0008;
    _new_lat := ROUND(_new_lat, 7);
    _new_lng := ROUND(_new_lng, 7);

    -- Pick a corrector different from the uploader
    _corrector := _techs[1 + floor(random() * 3)::int];

    -- Log the correction
    INSERT INTO public.coordinate_corrections (
      image_id, corrected_by,
      old_latitude, old_longitude,
      new_latitude, new_longitude
    ) VALUES (
      _img.id, _corrector,
      _img.latitude, _img.longitude,
      _new_lat, _new_lng
    );

    -- Apply correction to the image
    UPDATE public.images
    SET latitude = _new_lat, longitude = _new_lng
    WHERE id = _img.id;
  END LOOP;

  RAISE NOTICE 'Applied 50 coordinate corrections';
END $$;

-- ---------------------------------------------------------------------------
-- 5. Create metadata keys and assign some metadata
-- ---------------------------------------------------------------------------
DO $$
DECLARE _org_id uuid;
BEGIN
  SELECT id INTO _org_id FROM public.organizations WHERE name = 'Default Organization' LIMIT 1;

  INSERT INTO public.metadata_keys (id, organization_id, created_by, name) VALUES
    ('d0000000-0000-0000-0000-000000000001', _org_id, 'b0000000-0000-0000-0000-000000000001', 'Bauphase'),
    ('d0000000-0000-0000-0000-000000000002', _org_id, 'b0000000-0000-0000-0000-000000000001', 'Gewerk'),
    ('d0000000-0000-0000-0000-000000000003', _org_id, 'b0000000-0000-0000-0000-000000000001', 'Mangel'),
    ('d0000000-0000-0000-0000-000000000004', _org_id, 'b0000000-0000-0000-0000-000000000002', 'Stockwerk'),
    ('d0000000-0000-0000-0000-000000000005', _org_id, 'b0000000-0000-0000-0000-000000000003', 'Wetter')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- Assign metadata to ~40% of images
DO $$
DECLARE
  _img    record;
  _phases text[] := ARRAY['Aushub', 'Rohbau', 'Rohinstallation', 'Innenausbau', 'Fassade', 'Außenanlage', 'Abnahme'];
  _trades text[] := ARRAY['Maurer', 'Zimmerer', 'Elektriker', 'Installateur', 'Spengler', 'Maler', 'Estrichleger', 'Bodenleger', 'Dachdecker'];
  _defects text[] := ARRAY['Riss Wand', 'Feuchtigkeitsfleck', 'Putzschaden', 'fehlende Abdichtung', 'Rohrdurchführung unsauber', 'Bewehrung sichtbar'];
  _floors text[] := ARRAY['UG2', 'UG1', 'EG', 'OG1', 'OG2', 'OG3', 'OG4', 'OG5', 'OG6', 'DG'];
  _weather text[] := ARRAY['sonnig', 'bewölkt', 'Regen', 'Schnee', 'Nebel', 'windig'];
BEGIN
  FOR _img IN
    SELECT id FROM public.images ORDER BY random() LIMIT (SELECT COUNT(*) * 0.4 FROM public.images)::int
  LOOP
    -- Bauphase (building phase)
    IF random() < 0.7 THEN
      INSERT INTO public.image_metadata (image_id, key_id, value)
      VALUES (_img.id, 'd0000000-0000-0000-0000-000000000001', _phases[1 + floor(random() * array_length(_phases, 1))::int])
      ON CONFLICT (image_id, key_id) DO NOTHING;
    END IF;

    -- Gewerk (trade)
    IF random() < 0.5 THEN
      INSERT INTO public.image_metadata (image_id, key_id, value)
      VALUES (_img.id, 'd0000000-0000-0000-0000-000000000002', _trades[1 + floor(random() * array_length(_trades, 1))::int])
      ON CONFLICT (image_id, key_id) DO NOTHING;
    END IF;

    -- Mangel (defect) — only ~10% of photos document defects
    IF random() < 0.10 THEN
      INSERT INTO public.image_metadata (image_id, key_id, value)
      VALUES (_img.id, 'd0000000-0000-0000-0000-000000000003', _defects[1 + floor(random() * array_length(_defects, 1))::int])
      ON CONFLICT (image_id, key_id) DO NOTHING;
    END IF;

    -- Stockwerk (floor)
    IF random() < 0.4 THEN
      INSERT INTO public.image_metadata (image_id, key_id, value)
      VALUES (_img.id, 'd0000000-0000-0000-0000-000000000004', _floors[1 + floor(random() * array_length(_floors, 1))::int])
      ON CONFLICT (image_id, key_id) DO NOTHING;
    END IF;

    -- Wetter (weather)
    IF random() < 0.3 THEN
      INSERT INTO public.image_metadata (image_id, key_id, value)
      VALUES (_img.id, 'd0000000-0000-0000-0000-000000000005', _weather[1 + floor(random() * array_length(_weather, 1))::int])
      ON CONFLICT (image_id, key_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Create some saved groups
-- ---------------------------------------------------------------------------
INSERT INTO public.saved_groups (id, user_id, name) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Mängelfotos Seestadt'),
  ('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'Rohbau Fortschritt'),
  ('e0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000003', 'Fassadendetails DC Tower'),
  ('e0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000004', 'Baustelleneinrichtung'),
  ('e0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000005', 'Hochwasserschutz Donauinsel')
ON CONFLICT (id) DO NOTHING;

-- Add random images to saved groups
DO $$
DECLARE
  _groups uuid[] := ARRAY[
    'e0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000002',
    'e0000000-0000-0000-0000-000000000003',
    'e0000000-0000-0000-0000-000000000004',
    'e0000000-0000-0000-0000-000000000005'
  ];
  _g uuid;
  _img_id uuid;
BEGIN
  FOREACH _g IN ARRAY _groups LOOP
    FOR _img_id IN
      SELECT id FROM public.images ORDER BY random() LIMIT (10 + floor(random() * 25))::int
    LOOP
      INSERT INTO public.saved_group_images (group_id, image_id)
      VALUES (_g, _img_id)
      ON CONFLICT (group_id, image_id) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Populate address fields for all images based on proximity to known sites
-- ---------------------------------------------------------------------------
-- Each construction site has a known address in Vienna. We assign address
-- fields to images based on which site area their coordinates fall into.
-- This simulates reverse geocoding having already run on all images.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  -- Site definitions: lat_center, lng_center, radius (degrees), city, district, street, country, address_label
  _sites record;
BEGIN
  -- Aspern Seestadt D12 — 22nd district
  UPDATE public.images SET
    city = 'Wien', district = 'Donaustadt', street = 'Seestadt-Straße',
    country = 'Austria', address_label = 'Seestadt-Straße, 1220 Wien'
  WHERE latitude BETWEEN 48.222 AND 48.230
    AND longitude BETWEEN 16.502 AND 16.512
    AND city IS NULL;

  -- Nordbahnviertel Block 7 — 2nd district
  UPDATE public.images SET
    city = 'Wien', district = 'Leopoldstadt', street = 'Nordbahnstraße',
    country = 'Austria', address_label = 'Nordbahnstraße 15, 1020 Wien'
  WHERE latitude BETWEEN 48.224 AND 48.232
    AND longitude BETWEEN 16.374 AND 16.383
    AND city IS NULL;

  -- Sonnwendviertel Süd — 10th district
  UPDATE public.images SET
    city = 'Wien', district = 'Favoriten', street = 'Sonnwendgasse',
    country = 'Austria', address_label = 'Sonnwendgasse 20, 1100 Wien'
  WHERE latitude BETWEEN 48.175 AND 48.183
    AND longitude BETWEEN 16.374 AND 16.383
    AND city IS NULL;

  -- Mariahilfer Straße 78 — 6th district
  UPDATE public.images SET
    city = 'Wien', district = 'Mariahilf', street = 'Mariahilfer Straße',
    country = 'Austria', address_label = 'Mariahilfer Straße 78, 1060 Wien'
  WHERE latitude BETWEEN 48.193 AND 48.200
    AND longitude BETWEEN 16.350 AND 16.358
    AND city IS NULL;

  -- Kagran Donauzentrum — 22nd district
  UPDATE public.images SET
    city = 'Wien', district = 'Donaustadt', street = 'Wagramer Straße',
    country = 'Austria', address_label = 'Wagramer Straße 94, 1220 Wien'
  WHERE latitude BETWEEN 48.238 AND 48.245
    AND longitude BETWEEN 16.430 AND 16.440
    AND city IS NULL;

  -- Liesing Gewerbepark — 23rd district
  UPDATE public.images SET
    city = 'Wien', district = 'Liesing', street = 'Industriestraße',
    country = 'Austria', address_label = 'Industriestraße 8, 1230 Wien'
  WHERE latitude BETWEEN 48.131 AND 48.139
    AND longitude BETWEEN 16.321 AND 16.331
    AND city IS NULL;

  -- Floridsdorf Bahnhofcity — 21st district
  UPDATE public.images SET
    city = 'Wien', district = 'Floridsdorf', street = 'Franz-Jonas-Platz',
    country = 'Austria', address_label = 'Franz-Jonas-Platz 1, 1210 Wien'
  WHERE latitude BETWEEN 48.252 AND 48.260
    AND longitude BETWEEN 16.395 AND 16.404
    AND city IS NULL;

  -- Gürtel U6 Burggasse — 7th/15th district
  UPDATE public.images SET
    city = 'Wien', district = 'Neubau', street = 'Burggasse',
    country = 'Austria', address_label = 'Burggasse / Gürtel, 1070 Wien'
  WHERE latitude BETWEEN 48.199 AND 48.207
    AND longitude BETWEEN 16.340 AND 16.349
    AND city IS NULL;

  -- Donauinsel Hochwasserschutz — 21st/22nd district
  UPDATE public.images SET
    city = 'Wien', district = 'Donaustadt', street = 'Donauinsel',
    country = 'Austria', address_label = 'Donauinsel Abschnitt 4-7, 1220 Wien'
  WHERE latitude BETWEEN 48.226 AND 48.238
    AND longitude BETWEEN 16.396 AND 16.406
    AND city IS NULL;

  -- Favoriten Bildungscampus — 10th district
  UPDATE public.images SET
    city = 'Wien', district = 'Favoriten', street = 'Quellenstraße',
    country = 'Austria', address_label = 'Quellenstraße 52, 1100 Wien'
  WHERE latitude BETWEEN 48.161 AND 48.169
    AND longitude BETWEEN 16.376 AND 16.384
    AND city IS NULL;

  -- Ottakring Brunnenmarkt Passage — 16th district
  UPDATE public.images SET
    city = 'Wien', district = 'Ottakring', street = 'Brunnengasse',
    country = 'Austria', address_label = 'Brunnengasse / Yppenplatz, 1160 Wien'
  WHERE latitude BETWEEN 48.209 AND 48.217
    AND longitude BETWEEN 16.306 AND 16.314
    AND city IS NULL;

  -- DC Tower 3 Rohbau — 22nd district, Donaucity
  UPDATE public.images SET
    city = 'Wien', district = 'Donaustadt', street = 'Donau-City-Straße',
    country = 'Austria', address_label = 'Donau-City-Straße 12, 1220 Wien'
  WHERE latitude BETWEEN 48.230 AND 48.238
    AND longitude BETWEEN 16.409 AND 16.418
    AND city IS NULL;

  -- Stephansplatz underground utility — 1st district
  UPDATE public.images SET
    city = 'Wien', district = 'Innere Stadt', street = 'Stephansplatz',
    country = 'Austria', address_label = 'Stephansplatz, 1010 Wien'
  WHERE latitude BETWEEN 48.205 AND 48.212
    AND longitude BETWEEN 16.369 AND 16.377
    AND city IS NULL;

  -- Prater park facilities — 2nd district
  UPDATE public.images SET
    city = 'Wien', district = 'Leopoldstadt', street = 'Prater Hauptallee',
    country = 'Austria', address_label = 'Prater Hauptallee, 1020 Wien'
  WHERE latitude BETWEEN 48.206 AND 48.214
    AND longitude BETWEEN 16.401 AND 16.409
    AND city IS NULL;

  -- Alte Donau waterfront — 22nd district
  UPDATE public.images SET
    city = 'Wien', district = 'Donaustadt', street = 'Alte Donau',
    country = 'Austria', address_label = 'Obere Alte Donau, 1220 Wien'
  WHERE latitude BETWEEN 48.234 AND 48.242
    AND longitude BETWEEN 16.419 AND 16.427
    AND city IS NULL;

  -- Meidling Schönbrunner Straße — 12th district
  UPDATE public.images SET
    city = 'Wien', district = 'Meidling', street = 'Schönbrunner Straße',
    country = 'Austria', address_label = 'Schönbrunner Straße 230, 1120 Wien'
  WHERE latitude BETWEEN 48.170 AND 48.178
    AND longitude BETWEEN 16.326 AND 16.334
    AND city IS NULL;

  -- Catch-all: remaining images without address (should not happen with correct ranges)
  UPDATE public.images SET
    city = 'Wien', country = 'Austria',
    address_label = 'Wien, Austria'
  WHERE city IS NULL;

  -- Mark all as resolved
  UPDATE public.images SET location_unresolved = false
  WHERE city IS NOT NULL;

  RAISE NOTICE 'Address fields populated for all images';
END $$;

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _count bigint;
BEGIN
  SELECT COUNT(*) INTO _count FROM public.images;
  RAISE NOTICE '=== SEED COMPLETE: % total images in database ===', _count;
END $$;

COMMIT;
