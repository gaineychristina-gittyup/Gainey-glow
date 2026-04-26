// Curated reference data: which ingredients tend to address which concerns,
// and which ingredients commonly trigger irritation. Not medical advice.

import type { Concern } from '../db/schema';

export type Evidence = 'high' | 'moderate' | 'limited';

export interface IngredientInfo {
  name: string;             // canonical lowercase
  aliases?: string[];       // also lowercase
  targets: Concern[];
  cautions?: string[];      // human-readable caution notes
  evidence?: Evidence;      // strength of clinical research
}

export const INGREDIENT_LIBRARY: IngredientInfo[] = [
  {
    name: 'retinol',
    aliases: ['retinoid', 'retinaldehyde', 'retinyl palmitate', 'tretinoin', 'adapalene'],
    targets: ['aging', 'texture', 'hyperpigmentation', 'acne', 'pores'],
    cautions: ['can irritate sensitive skin', 'not recommended during pregnancy', 'increases sun sensitivity'],
    evidence: 'high',
  },
  {
    name: 'niacinamide',
    targets: ['redness', 'pores', 'oiliness', 'hyperpigmentation', 'sensitivity'],
    evidence: 'high',
  },
  {
    name: 'vitamin c',
    aliases: ['ascorbic acid', 'l-ascorbic acid', 'sodium ascorbyl phosphate', 'magnesium ascorbyl phosphate', 'tetrahexyldecyl ascorbate'],
    targets: ['hyperpigmentation', 'sunDamage', 'aging'],
    cautions: ['may sting on broken skin', 'oxidizes — store in cool dark place'],
    evidence: 'high',
  },
  {
    name: 'azelaic acid',
    targets: ['redness', 'hyperpigmentation', 'acne'],
    evidence: 'high',
  },
  {
    name: 'salicylic acid',
    aliases: ['bha'],
    targets: ['acne', 'pores', 'oiliness', 'texture'],
    cautions: ['drying with overuse', 'avoid layering with strong retinoids'],
    evidence: 'high',
  },
  {
    name: 'glycolic acid',
    aliases: ['aha'],
    targets: ['hyperpigmentation', 'texture', 'aging', 'sunDamage'],
    cautions: ['increases sun sensitivity', 'can sting on sensitive skin'],
    evidence: 'high',
  },
  {
    name: 'lactic acid',
    targets: ['hyperpigmentation', 'texture', 'dryness'],
    evidence: 'moderate',
  },
  {
    name: 'mandelic acid',
    targets: ['hyperpigmentation', 'acne', 'texture'],
    evidence: 'moderate',
  },
  {
    name: 'hyaluronic acid',
    aliases: ['sodium hyaluronate'],
    targets: ['dryness', 'aging'],
    evidence: 'moderate',
  },
  {
    name: 'ceramides',
    targets: ['dryness', 'sensitivity'],
    evidence: 'high',
  },
  {
    name: 'peptides',
    aliases: ['matrixyl', 'palmitoyl tripeptide-1', 'copper peptides'],
    targets: ['aging', 'texture'],
    evidence: 'moderate',
  },
  {
    name: 'centella asiatica',
    aliases: ['cica', 'madecassoside'],
    targets: ['redness', 'sensitivity'],
    evidence: 'moderate',
  },
  {
    name: 'green tea',
    aliases: ['camellia sinensis', 'egcg'],
    targets: ['redness', 'oiliness', 'sensitivity'],
    evidence: 'moderate',
  },
  {
    name: 'kojic acid',
    targets: ['hyperpigmentation', 'sunDamage'],
    cautions: ['can be sensitizing', 'patch test recommended'],
    evidence: 'moderate',
  },
  {
    name: 'tranexamic acid',
    targets: ['hyperpigmentation', 'redness'],
    evidence: 'high',
  },
  {
    name: 'alpha arbutin',
    aliases: ['arbutin'],
    targets: ['hyperpigmentation'],
    evidence: 'limited',
  },
  {
    name: 'benzoyl peroxide',
    targets: ['acne'],
    cautions: ['bleaches fabric', 'drying', 'avoid with retinoids in same routine'],
    evidence: 'high',
  },
  {
    name: 'zinc oxide',
    targets: ['acne', 'sensitivity', 'redness', 'sunDamage'],
    evidence: 'high',
  },
  {
    name: 'titanium dioxide',
    targets: ['sunDamage'],
    evidence: 'high',
  },
  {
    name: 'caffeine',
    targets: ['darkCircles'],
    evidence: 'limited',
  },
  {
    name: 'squalane',
    targets: ['dryness', 'sensitivity'],
    evidence: 'moderate',
  },
  {
    name: 'panthenol',
    aliases: ['vitamin b5', 'pro-vitamin b5'],
    targets: ['dryness', 'sensitivity', 'redness'],
    evidence: 'moderate',
  },
];

// Common irritants — flagged regardless of user-defined sensitivities.
export const COMMON_IRRITANTS: { ingredient: string; aliases?: string[]; reason: string }[] = [
  { ingredient: 'denatured alcohol', aliases: ['alcohol denat', 'sd alcohol', 'alcohol denat.'], reason: 'Drying; can compromise the barrier with frequent use.' },
  { ingredient: 'fragrance', aliases: ['parfum', 'perfume'], reason: 'Top cosmetic allergen — common cause of contact dermatitis.' },
  { ingredient: 'essential oils', aliases: ['lavender oil', 'tea tree oil', 'peppermint oil', 'citrus oil', 'lemon oil'], reason: 'Can be sensitizing or photosensitizing for reactive skin.' },
  { ingredient: 'methylisothiazolinone', aliases: ['mit', 'mi'], reason: 'Strong preservative allergen.' },
  { ingredient: 'formaldehyde', aliases: ['quaternium-15', 'dmdm hydantoin'], reason: 'Releases formaldehyde — known sensitizer.' },
  { ingredient: 'sodium lauryl sulfate', aliases: ['sls'], reason: 'Harsh surfactant; can disrupt the skin barrier.' },
];

const norm = (s: string) => s.trim().toLowerCase();

export function findIngredientInfo(ingredient: string): IngredientInfo | undefined {
  const q = norm(ingredient);
  return INGREDIENT_LIBRARY.find(
    (i) => i.name === q || (i.aliases ?? []).some((a) => a === q),
  );
}

export function findIrritant(ingredient: string) {
  const q = norm(ingredient);
  return COMMON_IRRITANTS.find(
    (i) => i.ingredient === q || (i.aliases ?? []).some((a) => a === q),
  );
}

export function targetsForIngredient(ingredient: string): Concern[] {
  return findIngredientInfo(ingredient)?.targets ?? [];
}
