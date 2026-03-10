/**
 * Backfill script — resolve addresses for all images with GPS but no address.
 *
 * Uses LocationIQ (free tier: 5,000/day, 2 req/sec) for reverse geocoding.
 * Connects to Supabase with the service-role key (bypasses RLS).
 *
 * Usage:
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "..."
 *   $env:LOCATIONIQ_API_KEY = "pk_..."
 *   node scripts/backfill-addresses.mjs
 *
 * Estimated time: ~25 minutes for 2932 images at 2 req/sec.
 */

import { createClient } from "@supabase/supabase-js";

// ── Config ─────────────────────────────────────────────────────────────────────

const SUPABASE_URL = "https://yvvzbpnoesxlzlbomlkv.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOCATIONIQ_KEY = process.env.LOCATIONIQ_API_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY environment variable.");
  process.exit(1);
}
if (!LOCATIONIQ_KEY) {
  console.error("Set LOCATIONIQ_API_KEY environment variable.");
  console.error(
    "Get a free key at https://locationiq.com (5,000 requests/day).",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const LOCATIONIQ_URL = "https://us1.locationiq.com/v1/reverse";
const RATE_LIMIT_MS = 600; // 2 req/sec → 500ms min; use 600ms for safety
const BATCH_SIZE = 100;
const MAX_RETRIES = 3;

// ── LocationIQ reverse geocode ─────────────────────────────────────────────────

async function reverseGeocode(lat, lng, retries = 0) {
  const url = `${LOCATIONIQ_URL}?key=${LOCATIONIQ_KEY}&lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
  const res = await fetch(url, {
    headers: { "Accept-Language": "en" },
  });

  // Handle rate limiting with exponential backoff
  if (res.status === 429) {
    if (retries >= MAX_RETRIES) {
      console.warn(`  [429] Max retries reached for ${lat},${lng}`);
      return null;
    }
    const backoff = Math.pow(2, retries + 1) * 1000; // 2s, 4s, 8s
    console.warn(
      `  [429] Rate limited, backing off ${backoff / 1000}s (retry ${retries + 1}/${MAX_RETRIES})`,
    );
    await sleep(backoff);
    return reverseGeocode(lat, lng, retries + 1);
  }

  if (!res.ok) {
    console.warn(`  [${res.status}] HTTP error for ${lat},${lng}`);
    return null;
  }

  const data = await res.json();
  if (!data?.address) {
    if (data?.error) {
      console.warn(`  [LOCATIONIQ] ${data.error} for ${lat},${lng}`);
    }
    return null;
  }

  const addr = data.address;
  const city =
    addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? null;
  const district =
    addr.city_district ?? addr.suburb ?? addr.borough ?? addr.quarter ?? null;
  const streetParts = [addr.road, addr.house_number].filter(Boolean);
  const street = streetParts.length > 0 ? streetParts.join(" ") : null;
  const country = addr.country ?? null;
  const addressLabel =
    data.display_name ?? [street, city, country].filter(Boolean).join(", ");

  return { addressLabel, city, district, street, country };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Starting address backfill...");
  console.log("Rate limit: 1 request per 1.5 seconds");

  let totalProcessed = 0;
  let totalResolved = 0;
  let totalFailed = 0;
  let hasMore = true;

  while (hasMore) {
    // Fetch a batch of images needing resolution.
    // Only fetch images still missing address_label (successfully resolved ones won't re-appear).
    const { data: images, error } = await supabase
      .from("images")
      .select("id, latitude, longitude")
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .is("address_label", null)
      .order("created_at", { ascending: false })
      .limit(BATCH_SIZE);

    if (error) {
      console.error("DB fetch error:", error.message);
      break;
    }

    if (!images || images.length === 0) {
      hasMore = false;
      break;
    }

    console.log(`\nFetched batch of ${images.length} images...`);

    for (const img of images) {
      totalProcessed++;

      // Strict rate limiting: wait BEFORE each request
      await sleep(RATE_LIMIT_MS);

      try {
        const result = await reverseGeocode(img.latitude, img.longitude);

        if (result) {
          const { error: updateError } = await supabase
            .from("images")
            .update({
              address_label: result.addressLabel,
              city: result.city,
              district: result.district,
              street: result.street,
              country: result.country,
              location_unresolved: false,
            })
            .eq("id", img.id);

          if (updateError) {
            console.error(`  [FAIL] DB update: ${updateError.message}`);
            totalFailed++;
          } else {
            totalResolved++;
          }
        } else {
          totalFailed++;
        }
      } catch (err) {
        console.error(`  [ERROR] ${img.id}: ${err.message}`);
        totalFailed++;
      }

      // Progress every 25 images
      if (totalProcessed % 25 === 0) {
        const elapsed = ((totalProcessed * RATE_LIMIT_MS) / 1000 / 60).toFixed(
          1,
        );
        console.log(
          `  [Progress] ${totalProcessed} processed | ${totalResolved} resolved | ${totalFailed} failed | ~${elapsed}m elapsed`,
        );
      }
    }
  }

  console.log("\n=== Backfill Complete ===");
  console.log(`Total processed: ${totalProcessed}`);
  console.log(`Resolved: ${totalResolved}`);
  console.log(`Failed: ${totalFailed}`);
}

main().catch(console.error);
