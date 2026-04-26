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

export interface Product {
  id?: number;
  name: string;
  brand?: string;
  step: ProductStep;
  concerns: Concern[];
  ingredients: string[];          // free-form list (lowercased on input)
  startedOn: string;              // ISO date
  stoppedOn?: string;             // ISO date if discontinued
  timeOfDay: ('am' | 'pm')[];
  notes?: string;
}

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

class GaineyGlowDB extends Dexie {
  photos!: Table<PhotoEntry, number>;
  products!: Table<Product, number>;
  treatments!: Table<Treatment, number>;
  sensitivities!: Table<Sensitivity, number>;
  profile!: Table<Profile, string>;
  routineLogs!: Table<RoutineLog, number>;
  checkins!: Table<Checkin, number>;
  comparisons!: Table<Comparison, number>;

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
  }
}

export const db = new GaineyGlowDB();
