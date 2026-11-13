import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Listing = {
  productName: string;
  unit: string;
  quantity: number;
  priceNaira: number;
  descriptionEn: string;
  descriptionHa: string;
  location: string;
  notes: string;
};

function fallbackListing(text: string): Listing {
  const price = Number((text.match(/(\d[\d,]{1,})/) ?? [])[1]?.replace(/,/g, "") ?? 0);
  const productName = text.replace(/₦|\d[\d,]*/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Item for sale";
  return {
    productName,
    unit: "piece",
    quantity: 1,
    priceNaira: Number.isFinite(price) ? price : 0,
    descriptionEn: text.slice(0, 2000),
    descriptionHa: text.slice(0, 2000),
    location: "",
    notes: "",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: auth } } });
  const { data } = await userClient.auth.getUser();
  if (!data.user) {
    return Response.json({ error: "Sign in first." }, { status: 401, headers: cors });
  }

  const body = (await req.json()) as { text?: string; language?: string };
  const text = (body.text ?? "").trim();
  if (text.length < 3) {
    return Response.json({ error: "Say or type what you sell." }, { status: 400, headers: cors });
  }

  const key = Deno.env.get("XAI_API_KEY") || Deno.env.get("GROK_API_KEY");
  if (!key) {
    return Response.json({ listing: fallbackListing(text), source: "local" }, { headers: cors });
  }

  const grok = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "grok-2-latest",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Extract a Nigerian marketplace listing as JSON with keys productName, unit, quantity, priceNaira, descriptionEn, descriptionHa, location, notes. Unit must be piece, bag, carton, kg, litre, yard, or metre. Write Hausa and English descriptions.",
        },
        { role: "user", content: `Language hint: ${body.language || "English"}\n\nSeller said:\n${text.slice(0, 2000)}` },
      ],
    }),
  });
  if (!grok.ok) {
    return Response.json({ listing: fallbackListing(text), source: "local", warning: "Grok was busy." }, { headers: cors });
  }
  const json = (await grok.json()) as { choices?: Array<{ message?: { content?: string } }> };
  let listing = fallbackListing(text);
  try {
    listing = { ...listing, ...JSON.parse(json.choices?.[0]?.message?.content ?? "{}") };
  } catch {
    /* keep fallback */
  }
  return Response.json({ listing, source: "grok" }, { headers: cors });
});
