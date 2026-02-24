/**
 * ML-style priority predictor for triage.
 * Predicts level 1–5 and confidence from case features.
 * Weights can be updated from nurse overrides (supervised learning).
 */
const SYMPTOM_IDS = [
  'cardiac_chest_pain', 'difficulty_breathing', 'severe_pain', 'altered_mental', 'unconscious',
  'major_trauma', 'heavy_bleeding', 'stroke_symptoms', 'severe_allergic', 'seizure',
  'abdominal_pain', 'high_fever', 'headache', 'laceration', 'minor_injury', 'sore_throat',
  'prescription_refill', 'minor_illness', 'other',
];

const KEYWORDS = [
  { key: 'cardiac', re: /\b(chest pain|heart|cardiac)\b/ },
  { key: 'breathing', re: /\b(can't breathe|shortness|breathing|dyspnea)\b/ },
  { key: 'stroke', re: /\b(unconscious|unresponsive|stroke|numbness|slurred)\b/ },
  { key: 'bleeding', re: /\b(bleeding|hemorrhage)\b/ },
  { key: 'seizure', re: /\b(seizure|convulsion)\b/ },
];

const FEATURE_DIM = SYMPTOM_IDS.length + 1 + KEYWORDS.length; // symptoms + urgency + keywords

function getFeatures(c) {
  const symptoms = Array.isArray(c.symptoms) ? c.symptoms : [];
  const urgency = c.self_reported_urgency != null ? Number(c.self_reported_urgency) : 5;
  const complaint = (c.chief_complaint || '').toLowerCase();
  const vec = new Array(FEATURE_DIM).fill(0);
  SYMPTOM_IDS.forEach((id, i) => {
    if (symptoms.includes(id)) vec[i] = 1;
  });
  vec[SYMPTOM_IDS.length] = (6 - Math.max(1, Math.min(5, urgency))) / 5;
  KEYWORDS.forEach(({ re }, i) => {
    if (re.test(complaint)) vec[SYMPTOM_IDS.length + 1 + i] = 1;
  });
  return vec;
}

function defaultWeights() {
  const w = new Array(FEATURE_DIM).fill(0);
  const acuityBySymptom = {
    cardiac_chest_pain: 2, difficulty_breathing: 2, severe_pain: 2, altered_mental: 1, unconscious: 1,
    major_trauma: 1, heavy_bleeding: 2, stroke_symptoms: 1, severe_allergic: 2, seizure: 2,
    abdominal_pain: 3, high_fever: 3, headache: 3, laceration: 4, minor_injury: 4, sore_throat: 4,
    prescription_refill: 5, minor_illness: 5, other: 4,
  };
  SYMPTOM_IDS.forEach((id, i) => {
    const level = acuityBySymptom[id] ?? 4;
    w[i] = (6 - level) / 5;
  });
  w[SYMPTOM_IDS.length] = 0.8;
  KEYWORDS.forEach((_, i) => {
    w[SYMPTOM_IDS.length + 1 + i] = 0.6;
  });
  return w;
}

const WEIGHTS_KEY = 'bright_ml_weights';

function loadWeights() {
  try {
    const raw = localStorage.getItem(WEIGHTS_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length === FEATURE_DIM) return arr;
  } catch (_) {}
  return null;
}

function saveWeights(w) {
  try {
    localStorage.setItem(WEIGHTS_KEY, JSON.stringify(w));
  } catch (_) {}
}

export function predictPriority(c) {
  const features = getFeatures(c);
  const w = loadWeights() || defaultWeights();
  let score = 0;
  for (let i = 0; i < FEATURE_DIM; i++) score += w[i] * features[i];
  const levelScore = Math.max(0, Math.min(1, 0.5 + score * 0.25));
  const level = Math.max(1, Math.min(5, Math.round(5 - levelScore * 4)));
  const dist = Math.abs(levelScore - (5 - level) / 4);
  const confidence = 0.5 + Math.min(0.5, dist * 2);
  return { level: Math.max(1, Math.min(5, level)), confidence: Math.round(confidence * 100) / 100 };
}

export function updateFromOverride(c, nurseLevel) {
  const features = getFeatures(c);
  const target = (5 - Math.max(1, Math.min(5, nurseLevel))) / 4;
  let w = loadWeights();
  if (!w || w.length !== FEATURE_DIM) w = defaultWeights().slice();
  const lr = 0.1;
  let score = 0;
  for (let i = 0; i < FEATURE_DIM; i++) score += w[i] * features[i];
  const pred = 0.5 + score * 0.25;
  const err = target - pred;
  for (let i = 0; i < FEATURE_DIM; i++) {
    w[i] += lr * err * features[i];
  }
  saveWeights(w);
}

export function getMlLevel(c) {
  if (c.ml_level != null) return c.ml_level;
  return predictPriority(c).level;
}

export function getMlConfidence(c) {
  if (c.ml_confidence != null) return c.ml_confidence;
  return predictPriority(c).confidence;
}
