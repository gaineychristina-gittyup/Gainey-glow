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

class GaineyGlowDB extends Dexie {
  photos!: Table<PhotoEntry, number>;
  products!: Table<Product, number>;
  treatments!: Table<Treatment, number>;
  sensitivities!: Table<Sensitivity, number>;
  profile!: Table<Profile, string>;

  constructor() {
    super('gainey-glow');
    this.version(1).stores({
      photos: '++id, date, zone, takenAt',
      products: '++id, name, step, startedOn, stoppedOn',
      treatments: '++id, type, date',
      sensitivities: '++id, &ingredient',
      profile: 'id',
    });
  }
}

export const db = new GaineyGlowDB();
