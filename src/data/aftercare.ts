import type { TreatmentType } from '../db/schema';

export interface AftercarePlan {
  summary: string;
  do: string[];
  avoid: string[];
  durationDays: number;
}

export const AFTERCARE: Record<TreatmentType, AftercarePlan> = {
  facial: {
    summary: 'Standard facial — keep things calm for 24 hours.',
    durationDays: 1,
    do: [
      'Use a gentle cleanser tonight',
      'Hydrate well — water and a simple moisturizer',
      'SPF 30+ tomorrow morning',
    ],
    avoid: [
      'Active ingredients (retinol, AHA/BHA, vitamin C) for 24h',
      'Heavy makeup for the rest of the day',
      'Hot showers or saunas tonight',
    ],
  },
  chemicalPeel: {
    summary: 'Skin is resurfacing — protect the barrier and stay out of the sun.',
    durationDays: 7,
    do: [
      'Gentle cleanser, lukewarm water only',
      'Bland moisturizer (ceramides, panthenol) several times a day',
      'Mineral SPF 30+ every morning, reapply every 2h outside',
      'Let any flaking shed naturally',
    ],
    avoid: [
      'Retinoids, AHA/BHA, vitamin C, scrubs for 5–7 days',
      'Picking or peeling flaking skin',
      'Sweaty workouts, hot tubs, saunas for 48h',
      'Direct sun exposure — wear a hat',
    ],
  },
  microneedling: {
    summary: 'Tiny channels are open — keep skin clean and undisturbed.',
    durationDays: 5,
    do: [
      'Use only the post-treatment serums provided by your provider for 24h',
      'Gentle hydrating cleanser starting day 2',
      'Hyaluronic acid + ceramide moisturizer',
      'Mineral SPF 30+ once skin no longer feels raw',
    ],
    avoid: [
      'Makeup for 24h',
      'Active ingredients for 5–7 days',
      'Working out, sweating, swimming for 24–48h',
      'Touching face with unwashed hands',
    ],
  },
  laser: {
    summary: 'Skin is heat-stressed and photo-sensitive.',
    durationDays: 7,
    do: [
      'Cold compress for swelling (10 min on / 10 min off)',
      'Bland moisturizer; aquaphor on any crusting',
      'Mineral SPF 50 daily, reapply every 2h outside',
    ],
    avoid: [
      'Sun exposure for at least 2 weeks',
      'Actives for 7+ days',
      'Hot showers, exercise, alcohol for 48h',
      'Picking scabs or crusting',
    ],
  },
  botox: {
    summary: 'Help the product settle where it was placed.',
    durationDays: 1,
    do: [
      'Stay upright for 4 hours',
      'Gentle facial expressions in the treated area',
    ],
    avoid: [
      'Lying down or bending over for 4h',
      'Rubbing, massaging, or facials for 24h',
      'Vigorous exercise for 24h',
      'Alcohol for 24h (bruising risk)',
    ],
  },
  filler: {
    summary: 'Minimize swelling and bruising while filler integrates.',
    durationDays: 3,
    do: [
      'Cold compress (not ice directly) for swelling',
      'Sleep slightly elevated tonight',
      'Arnica may help bruising',
    ],
    avoid: [
      'Touching, massaging, or pressing the area for 24h',
      'Vigorous exercise for 24–48h',
      'Alcohol for 24h',
      'Dental work for 2 weeks',
      'Saunas, hot yoga for 48h',
    ],
  },
  hydrafacial: {
    summary: 'Skin is freshly exfoliated and hydrated.',
    durationDays: 1,
    do: [
      'Enjoy the glow — keep skincare simple',
      'SPF 30+ tomorrow',
    ],
    avoid: [
      'Exfoliants and retinoids for 48h',
      'Waxing the area for 72h',
    ],
  },
  extractions: {
    summary: 'Pores were manually cleared — keep them clean.',
    durationDays: 2,
    do: [
      'Gentle cleanser',
      'Spot treat any lingering redness with niacinamide or azelaic acid',
    ],
    avoid: [
      'Makeup over fresh extractions for the rest of the day',
      'Picking — let the area fully close',
    ],
  },
  microdermabrasion: {
    summary: 'Surface exfoliation — barrier is thinner than usual.',
    durationDays: 3,
    do: [
      'Hydrating serum + barrier moisturizer',
      'Daily SPF 30+',
    ],
    avoid: [
      'Retinoids, AHA/BHA for 3 days',
      'Sun exposure',
    ],
  },
  ledTherapy: {
    summary: 'No downtime — continue routine as normal.',
    durationDays: 0,
    do: [
      'Regular skincare',
      'Daily SPF',
    ],
    avoid: [],
  },
  dermaplaning: {
    summary: 'Vellus hair removed and surface exfoliated.',
    durationDays: 2,
    do: [
      'Hydrating serum + moisturizer',
      'Daily SPF 30+',
    ],
    avoid: [
      'Active acids and retinoids for 48h',
      'Direct sun for 48h',
    ],
  },
  other: {
    summary: 'Follow your provider’s instructions; below is a generic gentle routine.',
    durationDays: 2,
    do: [
      'Gentle cleanser, bland moisturizer',
      'Daily SPF 30+',
    ],
    avoid: [
      'Active ingredients until skin feels fully calm',
    ],
  },
};
