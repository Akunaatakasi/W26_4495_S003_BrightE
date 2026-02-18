/**
 * Automated triage level (ESI-like 1-5) based on self-reported urgency and symptom categories.
 * Level 1 = most urgent, Level 5 = least urgent.
 * Nurse override is always available for human-in-the-loop.
 */
const SYMPTOM_ACUITY = {
  cardiac_chest_pain: 2,
  difficulty_breathing: 2,
  severe_pain: 2,
  altered_mental: 1,
  unconscious: 1,
  major_trauma: 1,
  heavy_bleeding: 2,
  stroke_symptoms: 1,
  severe_allergic: 2,
  seizure: 2,
  abdominal_pain: 3,
  high_fever: 3,
  headache: 3,
  laceration: 4,
  minor_injury: 4,
  sore_throat: 4,
  prescription_refill: 5,
  minor_illness: 5,
  other: 4,
};

export function computeAutomatedTriageLevel({ self_reported_urgency, symptoms = [], chief_complaint }) {
  let level = 5;
  if (self_reported_urgency >= 1 && self_reported_urgency <= 5) {
    level = Math.min(level, self_reported_urgency);
  }
  for (const s of symptoms) {
    const acuity = SYMPTOM_ACUITY[s] ?? 4;
    level = Math.min(level, acuity);
  }
  if (chief_complaint) {
    const lower = chief_complaint.toLowerCase();
    if (/\b(chest pain|heart|cardiac)\b/.test(lower)) level = Math.min(level, 2);
    if (/\b(can\'t breathe|shortness|breathing)\b/.test(lower)) level = Math.min(level, 2);
    if (/\b(unconscious|unresponsive|collapse)\b/.test(lower)) level = Math.min(level, 1);
    if (/\b(bleeding|hemorrhage)\b/.test(lower)) level = Math.min(level, 2);
    if (/\b(seizure|stroke|numbness)\b/.test(lower)) level = Math.min(level, 2);
  }
  return Math.max(1, Math.min(5, level));
}

export const TRIAGE_LABELS = {
  1: 'Level 1 – Immediate (life-saving intervention)',
  2: 'Level 2 – High risk / time-critical',
  3: 'Level 3 – Stable, multiple resources',
  4: 'Level 4 – Stable, single resource',
  5: 'Level 5 – Stable, minimal resources',
};
