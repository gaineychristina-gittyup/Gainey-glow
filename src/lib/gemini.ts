// Gemini vision client for product recognition. Uses the user's own API
// key (stored locally) and the structured-output mode of generateContent.

import { CONCERNS, PRODUCT_STEPS, ZONES, type Concern, type ProductStep, type Zone } from '../db/schema';
import { getGeminiKey, getGeminiModel } from './settings';

export interface ScannedProduct {
  name: string;
  brand?: string;
  step?: ProductStep;
  concerns: Concern[];
  ingredients: string[];
  notes?: string;
}

const PROMPT = `You are helping log skincare products into a tracking app.

Look at the photo and identify EVERY skincare product visible (multiple bottles,
boxes, or labels can be in one photo). For EACH distinct product, extract:

- name: the product's specific name (NOT the brand). Trim marketing fluff.
- brand: the brand name only.
- step: which routine step it belongs to. Pick exactly one of:
  cleanser, toner, serum, treatment, moisturizer, eye, sunscreen, mask, oil, exfoliant.
- concerns: which skin concerns it most directly targets, from this list:
  acne, hyperpigmentation, redness, dryness, oiliness, aging, texture, pores, darkCircles, sensitivity, sunDamage.
  Only include concerns the product clearly addresses (max 5).
- ingredients: the KEY active ingredients (4–10 items). Use simple lowercase names
  ("niacinamide", "salicylic acid", "vitamin c"), not full INCI strings.
  If no ingredient list is visible, infer the headline actives from the product name.
- notes: optional one-line callout (e.g. "limit to PM use", "fragrance-free").

If a field is genuinely unknown, leave it empty (empty string or empty array).
Return an object with a "products" array. If only one product is visible, return
one item. If no skincare product is visible, return an empty array.`;

const PRODUCT_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    brand: { type: 'string' },
    step: {
      type: 'string',
      enum: PRODUCT_STEPS.map((s) => s.id),
    },
    concerns: {
      type: 'array',
      items: { type: 'string', enum: CONCERNS.map((c) => c.id) },
    },
    ingredients: {
      type: 'array',
      items: { type: 'string' },
    },
    notes: { type: 'string' },
  },
  required: ['name', 'concerns', 'ingredients'],
};

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    products: {
      type: 'array',
      items: PRODUCT_ITEM_SCHEMA,
    },
  },
  required: ['products'],
};

async function blobToBase64(blob: Blob): Promise<{ data: string; mime: string }> {
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { data: btoa(binary), mime: blob.type || 'image/jpeg' };
}

function normalize(p: Partial<ScannedProduct>): ScannedProduct {
  return {
    name: (p.name ?? '').toString().trim(),
    brand: (p.brand ?? '').toString().trim() || undefined,
    step: p.step,
    concerns: Array.isArray(p.concerns) ? (p.concerns as Concern[]) : [],
    ingredients: Array.isArray(p.ingredients)
      ? (p.ingredients as string[])
          .map((i) => String(i).trim().toLowerCase())
          .filter(Boolean)
      : [],
    notes: (p.notes ?? '').toString().trim() || undefined,
  };
}

export async function scanProductsFromImage(image: Blob): Promise<ScannedProduct[]> {
  const key = getGeminiKey();
  if (!key) throw new Error('No Gemini API key set. Add one in Settings.');
  const model = getGeminiModel();
  const { data, mime } = await blobToBase64(image);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(key)}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: mime, data } },
          { text: PROMPT },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    let msg = `Gemini request failed (${res.status})`;
    try {
      const j = JSON.parse(text);
      if (j?.error?.message) msg = j.error.message;
    } catch {
      // keep default msg
    }
    if (res.status === 400 && /api key/i.test(msg)) {
      msg = 'API key not valid. Check it in Settings.';
    } else if (res.status === 429) {
      msg = 'Gemini rate limit reached. Wait a minute and try again.';
    } else if (res.status === 403) {
      msg = `${msg} (Make sure the Generative Language API is enabled for this key.)`;
    }
    throw new Error(msg);
  }

  const json = await res.json();
  const candidate = json?.candidates?.[0];
  const finishReason: string | undefined = candidate?.finishReason;
  const text: string | undefined = candidate?.content?.parts?.[0]?.text;

  if (!text) {
    if (finishReason === 'SAFETY') {
      throw new Error('Gemini blocked the response (safety filter). Try a clearer photo of just the product.');
    }
    if (finishReason === 'RECITATION') {
      throw new Error('Gemini blocked the response (recitation). Try a different photo.');
    }
    if (json?.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked the request: ${json.promptFeedback.blockReason}`);
    }
    throw new Error(`Gemini returned no content${finishReason ? ` (finishReason: ${finishReason})` : ''}.`);
  }

  let parsed: { products?: Partial<ScannedProduct>[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Could not parse Gemini response as JSON.');
  }

  const products = Array.isArray(parsed.products) ? parsed.products : [];
  return products.map(normalize).filter((p) => p.name);
}

// ----- Zone classification --------------------------------------------------

const ZONE_PROMPT = `You are looking at a photo from a personal skincare journal.
Decide which face zone the photo most clearly shows. Choose exactly one of:

- "full": straight-on full-face portrait
- "leftCheek": face turned to show the LEFT side of the subject's face
  (the subject's left, NOT the viewer's left)
- "rightCheek": face turned to show the RIGHT side of the subject's face
- "forehead": photo focused on the forehead area
- "chin": photo focused on the chin/jaw area
- "nose": photo focused on the nose / T-zone

If you can't tell, pick "full".`;

const ZONE_SCHEMA = {
  type: 'object',
  properties: {
    zone: { type: 'string', enum: ZONES.map((z) => z.id) },
  },
  required: ['zone'],
};

export async function classifyPhotoZone(image: Blob): Promise<Zone> {
  const key = getGeminiKey();
  if (!key) throw new Error('No Gemini API key set.');
  const model = getGeminiModel();
  const { data, mime } = await blobToBase64(image);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(key)}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: mime, data } },
          { text: ZONE_PROMPT },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: ZONE_SCHEMA,
      temperature: 0,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Gemini classify failed (${res.status})`);

  const json = await res.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return 'full';
  try {
    const parsed = JSON.parse(text);
    if (ZONES.some((z) => z.id === parsed.zone)) return parsed.zone as Zone;
  } catch {
    // fall through
  }
  return 'full';
}
