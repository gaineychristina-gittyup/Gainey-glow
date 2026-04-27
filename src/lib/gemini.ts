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

// generateContent wrapper with retry on transient upstream errors.
// Gemini occasionally returns 503 UNAVAILABLE ("This model is currently
// experiencing high demand…") or 500 INTERNAL during traffic spikes —
// a couple of short retries usually clears them.
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  // 1s, 2s, 4s with ±25% jitter
  const base = 1000 * 2 ** (attempt - 1);
  const jitter = base * 0.25 * (Math.random() * 2 - 1);
  return Math.round(base + jitter);
}

interface CallOptions {
  maxAttempts?: number;
}

async function callGenerateContent(
  model: string,
  key: string,
  body: unknown,
  opts: CallOptions = {},
): Promise<any> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(key)}`;
  const maxAttempts = opts.maxAttempts ?? 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (attempt < maxAttempts) {
        await sleep(backoffMs(attempt));
        continue;
      }
      const detail = err instanceof Error ? err.message : 'network error';
      throw new Error(`Network error contacting Gemini: ${detail}`);
    }

    if (res.ok) return res.json();

    const text = await res.text();
    let upstreamMsg = '';
    try {
      const j = JSON.parse(text);
      if (j?.error?.message) upstreamMsg = String(j.error.message);
    } catch {
      // body wasn't JSON
    }

    const looksOverloaded =
      RETRYABLE_STATUSES.has(res.status) ||
      /overload|high demand|unavailable|try again/i.test(upstreamMsg);

    if (looksOverloaded && attempt < maxAttempts) {
      await sleep(backoffMs(attempt));
      continue;
    }

    if (res.status === 400 && /api key/i.test(upstreamMsg)) {
      throw new Error('API key not valid. Check it in Settings.');
    }
    if (res.status === 403) {
      throw new Error(
        `${upstreamMsg || 'Gemini access denied'} (Make sure the Generative Language API is enabled for this key.)`,
      );
    }
    if (res.status === 429) {
      throw new Error('Gemini rate limit reached. Wait a minute and try again.');
    }
    if (looksOverloaded) {
      throw new Error(
        "Gemini is overloaded right now. We retried but it's still busy — please try again in a minute, or switch models in Settings.",
      );
    }
    throw new Error(upstreamMsg || `Gemini request failed (${res.status})`);
  }

  // Unreachable — the loop either returns or throws.
  throw new Error('Gemini request failed.');
}

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

  const json = await callGenerateContent(model, key, body);
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

  const json = await callGenerateContent(model, key, body);
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

// ----- Product recommendations ---------------------------------------------

export interface RecommendedProduct {
  name: string;
  brand: string;
  reason: string;
  keyIngredients: string[];
  whereToFind?: string;
  priceTier?: 'budget' | 'mid' | 'premium';
}

const RECS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          brand: { type: 'string' },
          reason: { type: 'string' },
          keyIngredients: { type: 'array', items: { type: 'string' } },
          whereToFind: { type: 'string' },
          priceTier: { type: 'string', enum: ['budget', 'mid', 'premium'] },
        },
        required: ['name', 'brand', 'reason', 'keyIngredients'],
      },
    },
  },
  required: ['recommendations'],
};

export interface RecommendationContext {
  concernLabel: string;
  alreadyUsing?: string[];   // product display names
  sensitivities?: string[];  // ingredients
}

export async function recommendProducts(ctx: RecommendationContext): Promise<RecommendedProduct[]> {
  const key = getGeminiKey();
  if (!key) throw new Error('No Gemini API key set. Add one in Settings.');
  const model = getGeminiModel();

  const prompt = `You are an experienced skincare assistant.

Suggest 4–6 widely available products that target this concern: "${ctx.concernLabel}".

${ctx.alreadyUsing && ctx.alreadyUsing.length
  ? `The user is already using these — do NOT recommend duplicates or near-clones:
- ${ctx.alreadyUsing.join('\n- ')}`
  : ''}
${ctx.sensitivities && ctx.sensitivities.length
  ? `Avoid products that prominently feature these ingredients (user sensitivities):
- ${ctx.sensitivities.join('\n- ')}`
  : ''}

For each recommendation provide:
- name: the specific product name (NOT the brand)
- brand: the brand
- reason: ONE concise sentence on why it works for this concern
- keyIngredients: 2–4 short lowercase active ingredient names
- whereToFind: optional, e.g. "drugstore", "Sephora", "Amazon"
- priceTier: budget, mid, or premium

Mix price tiers when reasonable. Stick to products commonly available in the US/EU.
This is informational, not medical advice.`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RECS_RESPONSE_SCHEMA,
      temperature: 0.4,
    },
  };

  const json = await callGenerateContent(model, key, body);
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no recommendations.');
  const parsed = JSON.parse(text);
  const list: RecommendedProduct[] = Array.isArray(parsed?.recommendations) ? parsed.recommendations : [];
  return list.filter((r) => r && r.name && r.brand);
}

// ----- Routine layering order ----------------------------------------------

export interface LayeringStep {
  productId: number;
  reason: string;        // 1-line why this position
  waitMinutesAfter: number; // minutes to wait before the next step
}

export interface LayeringPlan {
  order: LayeringStep[];
  notes: string[];
}

const LAYERING_SCHEMA = {
  type: 'object',
  properties: {
    order: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          productId: { type: 'number' },
          reason: { type: 'string' },
          waitMinutesAfter: { type: 'number' },
        },
        required: ['productId', 'reason', 'waitMinutesAfter'],
      },
    },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: ['order', 'notes'],
};

export async function askLayeringOrder(opts: {
  period: 'am' | 'pm';
  products: {
    id: number;
    name: string;
    brand?: string;
    step: string;
    ingredients: string[];
  }[];
}): Promise<LayeringPlan> {
  const key = getGeminiKey();
  if (!key) throw new Error('No Gemini API key set. Add one in Settings.');
  const model = getGeminiModel();

  const productLines = opts.products.map(
    (p) =>
      `- id ${p.id}: [${p.step}] ${p.name}${p.brand ? ' — ' + p.brand : ''}${
        p.ingredients.length ? ' · ingredients: ' + p.ingredients.join(', ') : ''
      }`,
  );

  const prompt = `You are advising on the optimal layering order for a skincare routine.

Period: ${opts.period.toUpperCase()}

Products available (use their numeric ids verbatim in your response):
${productLines.join('\n')}

Return:
- order: an array of every product id from above in the correct application
  sequence. For each step include:
    - productId (number, copied from the list above)
    - reason: ONE concise sentence (e.g. "thinnest watery toner first to
      prep skin")
    - waitMinutesAfter: integer minutes to wait before the next step
      (0 if no wait needed; common values 1-3 for actives, 5-20 for strong
      ones like vitamin C before retinol).
- notes: 1-3 short tips specific to this routine (e.g. "skip the AHA on
  retinol nights").

For the AM, finish with sunscreen if any. For the PM, follow standard
thinnest-to-thickest ordering with actives near the start.`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: LAYERING_SCHEMA,
      temperature: 0.3,
    },
  };

  const json = await callGenerateContent(model, key, body);
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no plan.');
  const parsed = JSON.parse(text);
  return {
    order: Array.isArray(parsed?.order) ? parsed.order : [],
    notes: Array.isArray(parsed?.notes) ? parsed.notes : [],
  };
}

// ----- Pre-treatment guidance ----------------------------------------------

export interface PreTreatmentPlan {
  productsToPause: { name: string; reason: string; daysBefore: number }[];
  generalAdvice: string[];
}

const PRE_TREATMENT_SCHEMA = {
  type: 'object',
  properties: {
    productsToPause: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          reason: { type: 'string' },
          daysBefore: { type: 'number' },
        },
        required: ['name', 'reason', 'daysBefore'],
      },
    },
    generalAdvice: { type: 'array', items: { type: 'string' } },
  },
  required: ['productsToPause', 'generalAdvice'],
};

export async function askPreTreatmentGuidance(opts: {
  treatmentName: string;
  treatmentDate: string;
  daysAway: number;
  activeProducts: { name: string; brand?: string; ingredients: string[] }[];
  sensitivities: string[];
}): Promise<PreTreatmentPlan> {
  const key = getGeminiKey();
  if (!key) throw new Error('No Gemini API key set. Add one in Settings.');
  const model = getGeminiModel();

  const productLines = opts.activeProducts.map(
    (p) =>
      `- ${p.name}${p.brand ? ' — ' + p.brand : ''}${
        p.ingredients.length ? ' · ingredients: ' + p.ingredients.join(', ') : ''
      }`,
  );

  const prompt = `An esthetician/derm asks for pre-treatment guidance.

Upcoming treatment: ${opts.treatmentName}
Treatment date: ${opts.treatmentDate} (${opts.daysAway} days from today)

The user's currently-active products:
${productLines.length ? productLines.join('\n') : '(none)'}
${
  opts.sensitivities.length
    ? `\nSensitivities: ${opts.sensitivities.join(', ')}`
    : ''
}

For this treatment, list which of the user's products they should pause
leading up to it, and how many days before. Use only products from the
list above. For each item:
- name: copy the product name verbatim from the list
- reason: ONE concise sentence explaining why (e.g. "increases sun
  sensitivity, raises risk of post-laser hyperpigmentation")
- daysBefore: integer number of days to stop before treatment

Then 2–4 general pre-treatment tips (sun avoidance, no waxing, hydration,
etc). This is informational, not medical advice — defer to the
provider's specific instructions.`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: PRE_TREATMENT_SCHEMA,
      temperature: 0.3,
    },
  };

  const json = await callGenerateContent(model, key, body);
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no guidance.');
  const parsed = JSON.parse(text);
  return {
    productsToPause: Array.isArray(parsed?.productsToPause) ? parsed.productsToPause : [],
    generalAdvice: Array.isArray(parsed?.generalAdvice) ? parsed.generalAdvice : [],
  };
}

// ----- Free-form skincare Q&A ----------------------------------------------

export interface AskContext {
  question: string;
  activeProducts: { name: string; brand?: string; step: string; concerns: string[]; ingredients: string[] }[];
  sensitivities: string[];
  recentTreatments: { name: string; date: string }[];
  concernCoverage: { concern: string; productCount: number }[];
}

export async function askSkincareQuestion(ctx: AskContext): Promise<string> {
  const key = getGeminiKey();
  if (!key) throw new Error('No Gemini API key set. Add one in Settings.');
  const model = getGeminiModel();

  const lines: string[] = [];
  lines.push(`User question: ${ctx.question}`);
  lines.push('');
  lines.push('Their current routine:');
  if (ctx.activeProducts.length === 0) lines.push('- (no active products yet)');
  ctx.activeProducts.forEach((p) => {
    lines.push(
      `- [${p.step}] ${p.name}${p.brand ? ' — ' + p.brand : ''}` +
        (p.concerns.length ? ` · targets: ${p.concerns.join(', ')}` : '') +
        (p.ingredients.length ? ` · key ingredients: ${p.ingredients.join(', ')}` : ''),
    );
  });
  lines.push('');
  lines.push('Concern coverage:');
  ctx.concernCoverage.forEach((c) => {
    lines.push(`- ${c.concern}: ${c.productCount} product${c.productCount === 1 ? '' : 's'}`);
  });
  if (ctx.sensitivities.length) {
    lines.push('');
    lines.push(`Personal sensitivities (avoid in any suggestion): ${ctx.sensitivities.join(', ')}`);
  }
  if (ctx.recentTreatments.length) {
    lines.push('');
    lines.push('Recent treatments:');
    ctx.recentTreatments.forEach((t) => lines.push(`- ${t.date}: ${t.name}`));
  }

  const system = `You are an experienced, level-headed skincare assistant.
Answer the user's question directly and concretely. Use their routine context above.
- Be specific. Recommend by ingredient first (niacinamide, azelaic acid, etc.) then optionally by example product names.
- Avoid suggesting anything that conflicts with their listed sensitivities.
- Don't repeat products they already have unless adjusting how they use them.
- Keep it under ~250 words. Use short paragraphs and small bullet lists when helpful.
- Plain text only — no markdown headings, no code fences. This is informational, not medical advice.`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: lines.join('\n') }] }],
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: { temperature: 0.5 },
  };

  const json = await callGenerateContent(model, key, body);
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no answer.');
  return text.trim();
}
