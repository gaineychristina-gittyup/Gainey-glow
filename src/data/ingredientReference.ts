// Curated reference data: which ingredients tend to address which concerns,
// and which ingredients commonly trigger irritation. Not medical advice.

import type { Concern } from '../db/schema';

export interface IngredientInfo {
  name: string;             // canonical lowercase
  aliases?: string[];       // also lowercase
  targets: Concern[];
  cautions?: string[];      // human-readable caution notes
}

export const INGREDIENT_LIBRARY: IngredientInfo[] = [
  {
    name: 'retinol',
    aliases: ['retinoid', 'retinaldehyde', 'retinyl palmitate', 'tretinoin', 'adapalene'],
    targets: ['aging', 'texture', 'hyperpigmentation', 'acne', 'pores'],
    cautions: ['can irritate sensitive skin', 'not recommended during pregnancy', 'increases sun sensitivity'],
  },
  {
    name: 'niacinamide',
    targets: ['redness', 'pores', 'oiliness', 'hyperpigmentation', 'sensitivity'],
  },
  {
    name: 'vitamin c',
    aliases: ['ascorbic acid', 'l-ascorbic acid', 'sodium ascorbyl phosphate', 'magnesium ascorbyl phosphate', 'tetrahexyldecyl ascorbate'],
    targets: ['hyperpigmentation', 'sunDamage', 'aging'],
    cautions: ['may sting on broken skin', 'oxidizes — store in cool dark place'],
  },
  {
    name: 'azelaic acid',
    targets: ['redness', 'hyperpigmentation', 'acne'],
  },
  {
    name: 'salicylic acid',
    aliases: ['bha'],
    targets: ['acne', 'pores', 'oiliness', 'texture'],
    cautions: ['drying with overuse', 'avoid layering with strong retinoids'],
  },
  {
    name: 'glycolic acid',
    aliases: ['aha'],
    targets: ['hyperpigmentation', 'texture', 'aging', 'sunDamage'],
    cautions: ['increases sun sensitivity', 'can sting on sensitive skin'],
  },
  {
    name: 'lactic acid',
    targets: ['hyperpigmentation', 'texture', 'dryness'],
  },
  {
    name: 'mandelic acid',
    targets: ['hyperpigmentation', 'acne', 'texture'],
  },
  {
    name: 'hyaluronic acid',
    aliases: ['sodium hyaluronate'],
    targets: ['dryness', 'aging'],
  },
  {
    name: 'ceramides',
    targets: ['dryness', 'sensitivity'],
  },
  {
    name: 'peptides',
    aliases: ['matrixyl', 'palmitoyl tripeptide-1', 'copper peptides'],
    targets: ['aging', 'texture'],
  },
  {
    name: 'centella asiatica',
    aliases: ['cica', 'madecassoside'],
    targets: ['redness', 'sensitivity'],
  },
  {
    name: 'green tea',
    aliases: ['camellia sinensis', 'egcg'],
    targets: ['redness', 'oiliness', 'sensitivity'],
  },
  {
    name: 'kojic acid',
    targets: ['hyperpigmentation', 'sunDamage'],
    cautions: ['can be sensitizing', 'patch test recommended'],
  },
  {
    name: 'tranexamic acid',
    targets: ['hyperpigmentation', 'redness'],
  },
  {
    name: 'alpha arbutin',
    aliases: ['arbutin'],
    targets: ['hyperpigmentation'],
  },
  {
    name: 'benzoyl peroxide',
    targets: ['acne'],
    cautions: ['bleaches fabric', 'drying', 'avoid with retinoids in same routine'],
  },
  {
    name: 'zinc oxide',
    targets: ['acne', 'sensitivity', 'redness'],
  },
  {
    name: 'titanium dioxide',
    targets: ['sunDamage'],
  },
  {
    name: 'caffeine',
    targets: ['darkCircles'],
  },
  {
    name: 'squalane',
    targets: ['dryness', 'sensitivity'],
  },
  {
    name: 'panthenol',
    aliases: ['vitamin b5', 'pro-vitamin b5'],
    targets: ['dryness', 'sensitivity', 'redness'],
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
