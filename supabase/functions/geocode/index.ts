/**
 * geocode — Supabase Edge Function that proxies Nominatim requests.
 *
 * Eliminates browser CORS issues and enforces server-side rate limiting
 * (1 request/second to Nominatim). Requires a valid Supabase JWT.
 *
 * Endpoints:
 *   POST /geocode  { action: "reverse", lat, lng }
 *   POST /geocode  { action: "forward", q }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";
const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const MIN_INTERVAL_MS = 1100;
const USER_AGENT = "SiteSnap/1.0 (construction image management)";

let lastRequestTime = 0;

/** Simple server-side rate limiter — serializes via await. */
async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  // Verify JWT — reject unauthenticated requests
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Auth verification failed" }), {
      status: 401,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  // Parse request body
  let body: {
    action?: string;
    lat?: number;
    lng?: number;
    q?: string;
    limit?: number;
    countrycodes?: string;
    viewbox?: string;
    bounded?: number;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const { action } = body;

  if (action !== "reverse" && action !== "forward") {
    return new Response(
      JSON.stringify({ error: 'Invalid action. Use "reverse" or "forward".' }),
      {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      },
    );
  }

  // Build Nominatim URL
  let nominatimUrl: string;

  if (action === "reverse") {
    const { lat, lng } = body;
    if (typeof lat !== "number" || typeof lng !== "number") {
      return new Response(
        JSON.stringify({
          error: "lat and lng are required numbers for reverse",
        }),
        {
          status: 400,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        },
      );
    }
    // Validate coordinate ranges
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return new Response(
        JSON.stringify({ error: "Coordinates out of range" }),
        {
          status: 400,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        },
      );
    }
    nominatimUrl = `${NOMINATIM_REVERSE_URL}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&format=json&addressdetails=1`;
  } else {
    const { q } = body;
    if (typeof q !== "string" || !q.trim()) {
      return new Response(
        JSON.stringify({ error: "q is required for forward geocoding" }),
        {
          status: 400,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        },
      );
    }
    nominatimUrl = `${NOMINATIM_SEARCH_URL}?q=${encodeURIComponent(q.trim())}&format=json&limit=${encodeURIComponent(String(body.limit ?? 5))}&addressdetails=1${body.countrycodes ? `&countrycodes=${encodeURIComponent(body.countrycodes)}` : ""}${body.viewbox ? `&viewbox=${encodeURIComponent(body.viewbox)}` : ""}${body.bounded != null ? `&bounded=${encodeURIComponent(String(body.bounded))}` : ""}`;
  }

  // Rate-limit then fetch from Nominatim
  await rateLimit();

  try {
    const nominatimResp = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en",
      },
    });

    if (!nominatimResp.ok) {
      return new Response(
        JSON.stringify({
          error: "Nominatim request failed",
          status: nominatimResp.status,
        }),
        {
          status: 502,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        },
      );
    }

    const data = await nominatimResp.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to reach Nominatim" }),
      {
        status: 502,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      },
    );
  }
});
