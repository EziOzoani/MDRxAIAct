// Hugging Face configuration for tattoo classification
// Three models: balanced, unbalanced, uncleaned — each maps to an AI Act protection state
export const HUGGING_FACE_CONFIG = {
  // Model 1: Balanced — cleaned + balanced data, class weights, skin-tone sampling
  // Used when ALL protections are ON
  BALANCED_MODEL_ID: 'tattoo-balanced',

  // Model 2: Unbalanced — cleaned data but no balancing, no class weights
  // Used when bias-testing protection is OFF
  UNBALANCED_MODEL_ID: 'tattoo-unbalanced',

  // Model 3: Uncleaned — raw noisy data, no balancing, no class weights
  // Used when transparency protection is OFF
  UNCLEANED_MODEL_ID: 'tattoo-uncleaned',

  // API endpoint — proxied to local FastAPI inference server (port 8000)
  API_URL: '/api/models/',

  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 15000,

  // Real metrics from A100 training (2026-03-02, 5 epochs, ViT-base)
  // These are shown in the app's engineer view
  BALANCED_METRICS: {
    overall_accuracy: 0.82,
    per_class: {
      'real_tattoo': { precision: 0.84, recall: 0.74, f1: 0.79 },
      'sticker_tattoo': { precision: 0.90, recall: 0.95, f1: 0.93 },
      'pen_drawn': { precision: 0.70, recall: 0.76, f1: 0.73 },
    },
    per_skin_tone: {
      'I-II': 0.80,
      'III': 0.83,
      'IV': 0.84,
      'V': 0.81,
      'VI': 0.78,
    },
    max_gap: 0.06, // 6% gap between best and worst skin tone
    training_data: 'Balanced: 400/class, skin-tone-aware sampling, class weights=1.0',
  },
  UNBALANCED_METRICS: {
    overall_accuracy: 0.95, // inflated by class imbalance (86% sticker_tattoo in val)
    per_class: {
      'real_tattoo': { precision: 0.82, recall: 0.72, f1: 0.77 },
      'sticker_tattoo': { precision: 0.98, recall: 0.99, f1: 0.99 },
      'pen_drawn': { precision: 0.76, recall: 0.72, f1: 0.74 },
    },
    per_skin_tone: {
      'I-II': 0.68,
      'III': 0.88,
      'IV': 0.96,
      'V': 0.82,
      'VI': 0.62,
    },
    max_gap: 0.34, // 34% gap — this is the bias the AI Act catches
    training_data: 'Unbalanced: 5444/438/433 (12.6:1 ratio), no class weights',
  },
  UNCLEANED_METRICS: {
    overall_accuracy: 0.95, // also inflated, plus trained on noisy rejected images
    per_class: {
      'real_tattoo': { precision: 0.85, recall: 0.71, f1: 0.77 },
      'sticker_tattoo': { precision: 0.98, recall: 0.99, f1: 0.98 },
      'pen_drawn': { precision: 0.70, recall: 0.76, f1: 0.73 },
    },
    per_skin_tone: {
      'I-II': 0.65,
      'III': 0.85,
      'IV': 0.96,
      'V': 0.80,
      'VI': 0.58,
    },
    max_gap: 0.38, // 38% gap — noisy data + no balancing = worst bias
    training_data: 'Uncleaned: 4902/481/494 (10.2:1 ratio), includes rejected noisy images, no class weights',
  },
};

// 3-class label mapping: matches the model's output order
const LABEL_MAP: Record<string, string> = {
  'LABEL_0': 'real_tattoo',
  'LABEL_1': 'sticker_tattoo',
  'LABEL_2': 'pen_drawn',
};

type LoadingCallback = (message: string) => void;

export type ModelTier = 'balanced' | 'unbalanced' | 'uncleaned';

export type PredictedClass = 'real_tattoo' | 'sticker_tattoo' | 'pen_drawn';

export interface ClassificationResult {
  isRealTattoo: boolean;
  predictedClass: PredictedClass;
  confidence: number;
  classScores: Record<PredictedClass, number>;
  rawResult?: any;
  inferenceTimeMs?: number;
  isSimulated?: boolean;
  modelUsed?: ModelTier;
  skinToneMetrics?: typeof HUGGING_FACE_CONFIG.BALANCED_METRICS;
}

export interface AllClassificationResults {
  balanced: ClassificationResult | null;
  unbalanced: ClassificationResult | null;
  uncleaned: ClassificationResult | null;
}

// Selects model tier based on protection state:
// transparency OFF → uncleaned (worst), bias-testing OFF → unbalanced, both ON → balanced
export function selectModelTier(hasBiasTesting: boolean, hasTransparency: boolean): ModelTier {
  if (!hasTransparency) return 'uncleaned';
  if (!hasBiasTesting) return 'unbalanced';
  return 'balanced';
}

const MODEL_CONFIG: Record<ModelTier, { id: string; metrics: typeof HUGGING_FACE_CONFIG.BALANCED_METRICS }> = {
  balanced: { id: HUGGING_FACE_CONFIG.BALANCED_MODEL_ID, metrics: HUGGING_FACE_CONFIG.BALANCED_METRICS },
  unbalanced: { id: HUGGING_FACE_CONFIG.UNBALANCED_MODEL_ID, metrics: HUGGING_FACE_CONFIG.UNBALANCED_METRICS },
  uncleaned: { id: HUGGING_FACE_CONFIG.UNCLEANED_MODEL_ID, metrics: HUGGING_FACE_CONFIG.UNCLEANED_METRICS },
};

/**
 * Parse HF-format classification result into 3-class scores.
 * Input: [{label: "LABEL_0", score: 0.8}, {label: "LABEL_1", score: 0.15}, {label: "LABEL_2", score: 0.05}]
 */
function parseClassificationResult(result: Array<{ label: string; score: number }>): {
  predictedClass: PredictedClass;
  confidence: number;
  classScores: Record<PredictedClass, number>;
  isRealTattoo: boolean;
} {
  const classScores: Record<PredictedClass, number> = {
    real_tattoo: 0,
    sticker_tattoo: 0,
    pen_drawn: 0,
  };

  for (const item of result) {
    const className = LABEL_MAP[item.label];
    if (className && className in classScores) {
      classScores[className as PredictedClass] = item.score;
    }
  }

  // Find the class with highest score
  let predictedClass: PredictedClass = 'real_tattoo';
  let maxScore = 0;
  for (const [cls, score] of Object.entries(classScores)) {
    if (score > maxScore) {
      maxScore = score;
      predictedClass = cls as PredictedClass;
    }
  }

  return {
    predictedClass,
    confidence: maxScore,
    classScores,
    isRealTattoo: predictedClass === 'real_tattoo',
  };
}

/**
 * Classify an image against a single model tier.
 * Returns ClassificationResult on success, throws on failure.
 */
async function classifySingleTier(
  imageBlob: Blob,
  tier: ModelTier,
  onLoadingMessage?: LoadingCallback,
  allowSimulation: boolean = false,
): Promise<ClassificationResult> {
  const { id: modelId, metrics } = MODEL_CONFIG[tier];

  const startTime = performance.now();
  let retries = 0;
  let lastError: string = 'Classification server is unavailable';

  while (retries <= HUGGING_FACE_CONFIG.MAX_RETRIES) {
    try {
      const url = `${HUGGING_FACE_CONFIG.API_URL}${modelId}`;

      onLoadingMessage?.(`Classifying image (${tier})...`);

      const response = await fetch(url, {
        method: 'POST',
        body: imageBlob,
      });

      if (response.status === 503) {
        retries++;
        if (retries > HUGGING_FACE_CONFIG.MAX_RETRIES) {
          lastError = 'Model server is not responding after multiple retries';
          break;
        }
        const waitSec = Math.ceil(HUGGING_FACE_CONFIG.RETRY_DELAY_MS / 1000);
        onLoadingMessage?.(`Model warming up... retry ${retries}/${HUGGING_FACE_CONFIG.MAX_RETRIES} (waiting ${waitSec}s)`);
        await new Promise(resolve => setTimeout(resolve, HUGGING_FACE_CONFIG.RETRY_DELAY_MS));
        continue;
      }

      if (!response.ok) {
        lastError = `Server error (${response.status})`;
        console.error('API Error:', response.status);
        break;
      }

      const result = await response.json();
      const inferenceTimeMs = Math.round(performance.now() - startTime);

      if (Array.isArray(result)) {
        const parsed = parseClassificationResult(result);
        return {
          ...parsed,
          rawResult: result,
          inferenceTimeMs,
          isSimulated: false,
          modelUsed: tier,
          skinToneMetrics: metrics,
        };
      }

      // Unexpected format
      lastError = 'Unexpected response format from server';
      console.warn('Unexpected API response format:', result);
      break;
    } catch (error) {
      console.error('Classification error:', error);
      lastError = 'Cannot connect to classification server. Is serve_models.py running?';
      break;
    }
  }

  // Server failed — only simulate for example images, error for user uploads
  if (allowSimulation) {
    onLoadingMessage?.('Running demo simulation...');
    const delay = 800 + Math.random() * 400;
    await new Promise(resolve => setTimeout(resolve, delay));
    const sim = createSmartSimulation(imageBlob, Math.round(performance.now() - startTime), tier);
    return { ...sim, modelUsed: tier, skinToneMetrics: metrics };
  }

  throw new Error(lastError);
}

/**
 * Thin wrapper: classify with one model based on current protection state.
 * Preserved for backward compatibility.
 */
export async function classifyTattoo(
  imageBlob: Blob,
  onLoadingMessage?: LoadingCallback,
  hasBiasTesting: boolean = true,
  hasTransparency: boolean = true,
  allowSimulation: boolean = false,
): Promise<ClassificationResult> {
  const tier = selectModelTier(hasBiasTesting, hasTransparency);
  return classifySingleTier(imageBlob, tier, onLoadingMessage, allowSimulation);
}

/**
 * Run all 3 model tiers in parallel. Returns results for each tier (null if that tier failed).
 * Throws only if ALL 3 tiers fail (triggers existing server-unavailable path).
 */
export async function classifyAllTiers(
  imageBlob: Blob,
  onLoadingMessage?: LoadingCallback,
  allowSimulation: boolean = false,
): Promise<AllClassificationResults> {
  const tiers: ModelTier[] = ['balanced', 'unbalanced', 'uncleaned'];

  const settled = await Promise.allSettled(
    tiers.map(tier => classifySingleTier(imageBlob, tier, onLoadingMessage, allowSimulation)),
  );

  const allResults: AllClassificationResults = {
    balanced: settled[0].status === 'fulfilled' ? settled[0].value : null,
    unbalanced: settled[1].status === 'fulfilled' ? settled[1].value : null,
    uncleaned: settled[2].status === 'fulfilled' ? settled[2].value : null,
  };

  // If every tier failed, throw so callers see the server-unavailable path
  if (!allResults.balanced && !allResults.unbalanced && !allResults.uncleaned) {
    const firstReason = settled.find(s => s.status === 'rejected') as PromiseRejectedResult | undefined;
    throw new Error(firstReason?.reason?.message || 'All classification models failed');
  }

  return allResults;
}

/**
 * Pure helper: pick the active result based on current protection toggles.
 */
export function selectActiveResult(
  allResults: AllClassificationResults,
  appliedProtections: string[],
): ClassificationResult | null {
  const tier = selectModelTier(
    appliedProtections.includes('bias-testing'),
    appliedProtections.includes('transparency'),
  );
  return allResults[tier];
}

// Smart simulation that produces deterministic, realistic 3-class results
// Confidence degrades as model quality drops: balanced > unbalanced > uncleaned
function createSmartSimulation(
  imageBlob: Blob,
  inferenceTimeMs: number,
  tier: ModelTier,
): ClassificationResult {
  const seed = imageBlob.size;

  // Check if the blob was created from a named file with hints
  const fileName = ((imageBlob as File).name || '').toLowerCase();
  const isLikelyReal = fileName.includes('real');
  const isLikelySticker = fileName.includes('fake') || fileName.includes('sticker');
  const isLikelyPen = fileName.includes('sharpie') || fileName.includes('pen');

  // Confidence tiers: balanced (best) > unbalanced (medium) > uncleaned (worst)
  const confidenceMap = {
    balanced:    { high: 0.91, spread: 7, step: 0.01 },
    unbalanced:  { high: 0.82, spread: 12, step: 0.01 },
    uncleaned:   { high: 0.76, spread: 14, step: 0.01 },
  } as const;

  const tierConf = confidenceMap[tier];
  let predictedClass: PredictedClass;
  let confidence: number;

  if (isLikelyReal) {
    predictedClass = 'real_tattoo';
    confidence = tierConf.high + (seed % tierConf.spread) * tierConf.step;
  } else if (isLikelySticker) {
    predictedClass = 'sticker_tattoo';
    confidence = tierConf.high + (seed % tierConf.spread) * tierConf.step;
  } else if (isLikelyPen) {
    predictedClass = 'pen_drawn';
    confidence = tierConf.high + (seed % tierConf.spread) * tierConf.step;
  } else {
    // Unknown images — pick class based on seed
    const classes: PredictedClass[] = ['real_tattoo', 'sticker_tattoo', 'pen_drawn'];
    predictedClass = classes[seed % 3];
    confidence = (tierConf.high - 0.10) + (seed % tierConf.spread) * tierConf.step;
  }

  confidence = Math.min(confidence, 0.98);

  // Distribute remaining probability across other classes
  const remaining = 1 - confidence;
  const classScores: Record<PredictedClass, number> = {
    real_tattoo: 0,
    sticker_tattoo: 0,
    pen_drawn: 0,
  };
  classScores[predictedClass] = confidence;

  const otherClasses = (['real_tattoo', 'sticker_tattoo', 'pen_drawn'] as PredictedClass[])
    .filter(c => c !== predictedClass);
  // Split remaining unevenly for realism
  const split = 0.3 + (seed % 5) * 0.1; // 0.3–0.7
  classScores[otherClasses[0]] = remaining * split;
  classScores[otherClasses[1]] = remaining * (1 - split);

  // Build HF-format raw result
  const rawResult = [
    { label: 'LABEL_0', score: classScores.real_tattoo },
    { label: 'LABEL_1', score: classScores.sticker_tattoo },
    { label: 'LABEL_2', score: classScores.pen_drawn },
  ].sort((a, b) => b.score - a.score);

  return {
    isRealTattoo: predictedClass === 'real_tattoo',
    predictedClass,
    confidence,
    classScores,
    rawResult,
    inferenceTimeMs,
    isSimulated: true,
  };
}
