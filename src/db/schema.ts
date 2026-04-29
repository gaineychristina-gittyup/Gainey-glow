import Dexie, { type Table } from 'dexie';

export type Zone = 'full' | 'forehead' | 'leftCheek' | 'rightCheek' | 'chin' | 'nose';

export const ZONES: { id: Zone; label: string }[] = [
  { id: 'full', label: 'Full face' },
  { id: 'forehead', label: 'Forehead' },
  { id: 'leftCheek', label: 'Left cheek' },
  { id: 'rightCheek', label: 'Right cheek' },
  { id: 'chin', label: 'Chin' },
  { id: 'nose', label: 'Nose / T-zone' },
];

export interface PhotoEntry {
  id?: number;
  date: string;       // ISO date YYYY-MM-DD
  takenAt: number;    // epoch ms
  zone: Zone;
  blob: Blob;
  thumb: Blob;        // small preview
  width: number;
  height: number;
  notes?: string;
}

export type Concern =
  | 'acne'
  | 'hyperpigmentation'
  | 'redness'
  | 'dryness'
  | 'oiliness'
  | 'aging'
  | 'texture'
  | 'pores'
  | 'darkCircles'
  | 'sensitivity'
  | 'sunDamage';

export const CONCERNS: { id: Concern; label: string }[] = [
  { id: 'acne', label: 'Acne / breakouts' },
  { id: 'hyperpigmentation', label: 'Hyperpigmentation' },
  { id: 'redness', label: 'Redness' },
  { id: 'dryness', label: 'Dryness' },
  { id: 'oiliness', label: 'Oiliness' },
  { id: 'aging', label: 'Fine lines / aging' },
  { id: 'texture', label: 'Texture' },
  { id: 'pores', label: 'Enlarged pores' },
  { id: 'darkCircles', label: 'Dark circles' },
  { id: 'sensitivity', label: 'Sensitivity' },
  { id: 'sunDamage', label: 'Sun damage' },
];

export type ProductStep =
  | 'cleanser'
  | 'toner'
  | 'serum'
  | 'treatment'
  | 'moisturizer'
  | 'eye'
  | 'sunscreen'
  | 'mask'
  | 'oil'
  | 'exfoliant';

export const PRODUCT_STEPS: { id: ProductStep; label: string }[] = [
  { id: 'cleanser', label: 'Cleanser' },
  { id: 'toner', label: 'Toner' },
  { id: 'serum', label: 'Serum' },
  { id: 'treatment', label: 'Treatment' },
  { id: 'moisturizer', label: 'Moisturizer' },
  { id: 'eye', label: 'Eye cream' },
  { id: 'sunscreen', label: 'Sunscreen' },
  { id: 'mask', label: 'Mask' },
  { id: 'oil', label: 'Face oil' },
  { id: 'exfoliant', label: 'Exfoliant' },
];

// Per-step color palette for chips. Full class strings so Tailwind keeps them
// in the production bundle (it scans source for literals; dynamic
// concatenation would be purged).
export const STEP_CHIP_CLASSES: Record<ProductStep, string> = {
  cleanser:    'bg-sky-100 text-sky-800 border border-sky-200',
  toner:       'bg-cyan-100 text-cyan-800 border border-cyan-200',
  serum:       'bg-amber-100 text-amber-800 border border-amber-200',
  treatment:   'bg-purple-100 text-purple-800 border border-purple-200',
  moisturizer: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  eye:         'bg-indigo-100 text-indigo-800 border border-indigo-200',
  sunscreen:   'bg-orange-100 text-orange-800 border border-orange-200',
  mask:        'bg-pink-100 text-pink-800 border border-pink-200',
  oil:         'bg-yellow-100 text-yellow-800 border border-yellow-200',
  exfoliant:   'bg-rose-100 text-rose-800 border border-rose-200',
};

export type ProductCategory = 'topical' | 'supplement' | 'medication';

export const PRODUCT_CATEGORIES: { id: ProductCategory; label: string }[] = [
  { id: 'topical', label: 'Topical' },
  { id: 'supplement', label: 'Supplement' },
  { id: 'medication', label: 'Medication' },
];

export interface Product {
  id?: number;
  name: string;
  brand?: string;
  step: ProductStep;
  category?: ProductCategory; // defaults to 'topical' if absent (older rows)
  concerns: Concern[];
  ingredients: string[];          // free-form list (lowercased on input)
  startedOn?: string;             // ISO date (optional — user may not know)
  stoppedOn?: string;             // ISO date if discontinued
  timeOfDay: ('am' | 'pm')[];
  notes?: string;
  rating?: number;                // 1–5; user's overall rating of the product
  comments?: string;              // free-form review/comments
  sortOrder?: number;             // explicit display order (lower = earlier)
  // Whether this product is part of the user's current rotation. Products
  // without it set are treated as not in rotation and sorted to the bottom
  // of the Products list.
  inRotation?: boolean;
  // Optional weekly schedule per period. 0=Sun..6=Sat. Empty (or absent)
  // arrays = use the period's default (every day the period is active).
  schedule?: { am?: number[]; pm?: number[] };
}

export const WEEKDAYS: { id: number; short: string; label: string }[] = [
  { id: 0, short: 'S', label: 'Sun' },
  { id: 1, short: 'M', label: 'Mon' },
  { id: 2, short: 'T', label: 'Tue' },
  { id: 3, short: 'W', label: 'Wed' },
  { id: 4, short: 'T', label: 'Thu' },
  { id: 5, short: 'F', label: 'Fri' },
  { id: 6, short: 'S', label: 'Sat' },
];

export type TreatmentType =
  | 'facial'
  | 'chemicalPeel'
  | 'microneedling'
  | 'laser'
  | 'botox'
  | 'filler'
  | 'hydrafacial'
  | 'extractions'
  | 'microdermabrasion'
  | 'ledTherapy'
  | 'dermaplaning'
  | 'other';

export const TREATMENT_TYPES: { id: TreatmentType; label: string }[] = [
  { id: 'facial', label: 'Facial' },
  { id: 'chemicalPeel', label: 'Chemical peel' },
  { id: 'microneedling', label: 'Microneedling' },
  { id: 'laser', label: 'Laser' },
  { id: 'botox', label: 'Botox' },
  { id: 'filler', label: 'Filler' },
  { id: 'hydrafacial', label: 'HydraFacial' },
  { id: 'extractions', label: 'Extractions' },
  { id: 'microdermabrasion', label: 'Microdermabrasion' },
  { id: 'ledTherapy', label: 'LED therapy' },
  { id: 'dermaplaning', label: 'Dermaplaning' },
  { id: 'other', label: 'Other' },
];

export interface Treatment {
  id?: number;
  type: TreatmentType;
  customName?: string;
  date: string;                   // ISO date
  provider?: string;
  notes?: string;
}

export interface Sensitivity {
  id?: number;
  ingredient: string;             // lowercased
  severity: 'mild' | 'moderate' | 'severe';
  notes?: string;
}

export interface Profile {
  id: 'me';
  name?: string;
  skinType?: 'dry' | 'oily' | 'combo' | 'normal' | 'sensitive';
  primaryConcerns: Concern[];
  notes?: string;
}

export interface RoutineLog {
  id?: number;
  date: string;       // ISO date YYYY-MM-DD
  productId: number;
  period: 'am' | 'pm';
}

// One row per (date, product, period) the user has dismissed from today's
// routine via swipe-to-delete. Lets us hide scheduled products for a single
// day without altering their permanent schedule.
export interface RoutineSkip {
  id?: number;
  date: string;
  productId: number;
  period: 'am' | 'pm';
}

export type FeelTag =
  | 'glowy'
  | 'dull'
  | 'hydrated'
  | 'dehydrated'
  | 'sensitive'
  | 'poorSleep'
  | 'breakout'
  | 'oily'
  | 'calm'
  | 'irritated';

export const FEEL_TAGS: { id: FeelTag; label: string; tone: 'good' | 'neutral' | 'bad' }[] = [
  { id: 'glowy', label: 'Glowy', tone: 'good' },
  { id: 'hydrated', label: 'Hydrated', tone: 'good' },
  { id: 'calm', label: 'Calm', tone: 'good' },
  { id: 'dull', label: 'Dull', tone: 'bad' },
  { id: 'dehydrated', label: 'Dehydrated', tone: 'bad' },
  { id: 'sensitive', label: 'Sensitive', tone: 'bad' },
  { id: 'irritated', label: 'Irritated', tone: 'bad' },
  { id: 'breakout', label: 'Breakout', tone: 'bad' },
  { id: 'oily', label: 'Oily', tone: 'neutral' },
  { id: 'poorSleep', label: 'Poor sleep', tone: 'neutral' },
];

export interface Checkin {
  id?: number;
  date: string;       // ISO date — unique
  tags: FeelTag[];
}

export interface Comparison {
  id?: number;
  date: string;            // when the user saved it (ISO)
  savedAt: number;
  beforePhotoId: number;
  afterPhotoId: number;
  zone: Zone;
  sliderPos: number;       // 0–100, where the divider sat at save time
  caption?: string;
  beforeZoom?: number;
  beforePanX?: number;
  beforePanY?: number;
  afterZoom?: number;
  afterPanX?: number;
  afterPanY?: number;
  // Reference: a product or treatment used as the "anchor" for the date labels.
  referenceKind?: 'product' | 'treatment';
  referenceId?: number;
  referenceLabel?: string; // e.g. "Pico" — denormalized so deletion of the
                           // referenced item doesn't break old comparisons.
  referenceDate?: string;  // ISO date of the referenced event
  preview: Blob;           // ~600px wide JPEG snapshot for Timeline
}

export interface SkinRating {
  id?: number;
  date: string;       // ISO date — unique
  rating: number;     // 1–5
  notes?: string;
}

export interface Insight {
  id?: number;
  date: string;       // ISO date — when the observation applies
  createdAt: number;  // epoch ms — when the user wrote it
  title?: string;
  text: string;
}

export type AssessmentSeverity = 'mild' | 'moderate' | 'pronounced';

export interface AssessmentObservation {
  label: string;                // e.g. "Forehead redness"
  severity: AssessmentSeverity;
  note?: string;                // 1 short sentence
}

// AI-generated read of the skin in a single photo. One row per photo (the
// photoId index is unique). Stored locally so the user can see what Gemini
// saw the day they snapped the picture without re-running the request.
export interface SkinAssessment {
  id?: number;
  photoId: number;
  date: string;                 // ISO — denormalized from the photo for sorting
  createdAt: number;
  zone: Zone;
  model: string;                // which Gemini model produced it
  overall: string;              // 1–2 sentence summary
  observations: AssessmentObservation[];
  positives: string[];
  suggestions: string[];
}

class GaineyGlowDB extends Dexie {
  photos!: Table<PhotoEntry, number>;
  products!: Table<Product, number>;
  treatments!: Table<Treatment, number>;
  sensitivities!: Table<Sensitivity, number>;
  profile!: Table<Profile, string>;
  routineLogs!: Table<RoutineLog, number>;
  checkins!: Table<Checkin, number>;
  comparisons!: Table<Comparison, number>;
  skinRatings!: Table<SkinRating, number>;
  insights!: Table<Insight, number>;
  routineSkips!: Table<RoutineSkip, number>;
  skinAssessments!: Table<SkinAssessment, number>;

  constructor() {
    super('gainey-glow');
    this.version(1).stores({
      photos: '++id, date, zone, takenAt',
      products: '++id, name, step, startedOn, stoppedOn',
      treatments: '++id, type, date',
      sensitivities: '++id, &ingredient',
      profile: 'id',
    });
    this.version(2).stores({
      routineLogs: '++id, date, productId, [date+productId+period]',
    });
    this.version(3).stores({
      checkins: '++id, &date',
    });
    this.version(4).stores({
      comparisons: '++id, date, savedAt',
    });
    this.version(5).stores({
      skinRatings: '++id, &date',
    });
    this.version(6).stores({
      insights: '++id, date, createdAt',
    });
    this.version(7).stores({
      routineSkips: '++id, date, [date+productId+period]',
    });
    this.version(8).stores({
      skinAssessments: '++id, &photoId, date, createdAt',
    });
  }
}

export const db = new GaineyGlowDB();
