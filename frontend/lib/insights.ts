import {
  COMPARISON_FACTORS,
  type AccessibilityRawCounts,
  type CompetitorInfo,
  type DemandRawCounts,
  type DistanceBucket,
  type FactorKey,
  type PredictionResponse,
  type RawCounts,
  type SavedPrediction,
  type ShapFactor,
  type TypicalAccessibilityCounts,
  type TypicalCounts,
  type TypicalDemandCounts,
} from "@/components/types";
import { bearingDegrees, compassLabel, distanceInMeters } from "@/lib/utils";

const COUNT_LABELS: Record<string, string> = {
  cinema: "cinemas",
  museum: "museums",
  temple: "temples",
  recreation: "recreation venues",
  office: "offices",
  college: "colleges",
  school: "schools",
  hospital: "hospitals",
  clinic: "clinics",
  retail: "retail places",
  bank: "banks",
  bus_stop: "bus stops",
  parking_space: "parking spaces",
  intersection: "road intersections",
};

function singularize(label: string): string {
  return label.endsWith("s") ? label.slice(0, -1) : label;
}

function topSubCounts(counts: Record<string, number>, max = 3): string[] {
  return Object.entries(counts)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([key, value]) => {
      const label = COUNT_LABELS[key] ?? key;
      return `${value} ${value === 1 ? singularize(label) : label}`;
    });
}

function joinWithAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export type ScoreBand = "weak" | "below average" | "average" | "strong";

/**
 * Quartile split of this factor's PERCENTILE rank within its own study area (0-100), not the raw
 * 0-1 score. Fixed cutoffs on the raw score don't work against real data -- e.g. Demand's real max
 * is ~0.66, making a raw-score "strong" cutoff of 0.75 mathematically unreachable, and Competition's
 * real min is ~0.21, making raw-score "weak" (<0.25) nearly unreachable. Percentile-based cutoffs are
 * always reachable and evenly distributed by construction. Not tied to SHAP direction at all.
 */
export function scoreBand(percentile: number): ScoreBand {
  const clamped = Math.max(0, Math.min(100, percentile));
  if (clamped < 25) return "weak";
  if (clamped < 50) return "below average";
  if (clamped < 75) return "average";
  return "strong";
}

/**
 * Short verdict word/tag printed directly under a gauge. For Demand/Population/Accessibility this
 * is just the band name -- "strong" score directly means "strong demand," no ambiguity. Competition
 * needs its own wording: it's the inverted/cost factor (a "strong" SCORE means FEW real competitors),
 * so printing the bare word "Strong" next to the label "Competition" would read as "strong/heavy
 * competition" -- the opposite of the truth. These tags instead describe the real-world market
 * condition directly, so they're correct without requiring the reader to know the inversion.
 */
const VERDICT_WORD: Record<FactorKey, Record<ScoreBand, string>> = {
  Demand: { weak: "Weak", "below average": "Below average", average: "Average", strong: "Strong" },
  Population: { weak: "Weak", "below average": "Below average", average: "Average", strong: "Strong" },
  Accessibility: { weak: "Weak", "below average": "Below average", average: "Average", strong: "Strong" },
  Competition: { weak: "Crowded", "below average": "Busy", average: "Moderate", strong: "Quiet" },
};

export function verdictWord(factorKey: FactorKey, band: ScoreBand): string {
  return VERDICT_WORD[factorKey][band];
}

/** Plain-language percentile framing, e.g. "Lower than 85% of locations analyzed in this area." */
export function percentileLabel(percentile: number): string {
  const clamped = Math.max(0, Math.min(100, percentile));
  if (clamped >= 50) {
    return `Higher than ${Math.round(clamped)}% of locations analyzed in this area`;
  }
  return `Lower than ${Math.round(100 - clamped)}% of locations analyzed in this area`;
}

/**
 * Plain-language description of what each factor's score band means for the location itself.
 * Competition is a cost/inverted composite: a HIGH score means FEW nearby competitors (favorable),
 * a LOW score means a crowded market (unfavorable) -- verified against training data
 * (corr(competitor_count_500m, Competition) = -0.88). Its phrases run in the opposite real-world
 * direction from Demand/Population/Accessibility, where a high score directly means "more of it."
 * This table is the single source of truth for factor wording -- every caller reuses it instead of
 * building its own sentence.
 */
const FACTOR_BAND_PHRASES: Record<FactorKey, Record<ScoreBand, string>> = {
  Demand: {
    weak: "Weak customer demand",
    "below average": "Below-average customer demand",
    average: "Average customer demand",
    strong: "Strong customer demand",
  },
  Population: {
    weak: "Very low population density nearby",
    "below average": "Below-average population density nearby",
    average: "Average population density nearby",
    strong: "High population density nearby",
  },
  Accessibility: {
    weak: "Poor accessibility",
    "below average": "Below-average accessibility",
    average: "Average accessibility",
    strong: "Strong accessibility",
  },
  Competition: {
    weak: "Crowded market",
    "below average": "Above-average competition nearby",
    average: "Moderate competition nearby",
    strong: "Little existing competition",
  },
};

/** A concrete, neutral fact to ground a factor's headline -- no "signal for X" style spin. */
function supportingFact(factorKey: FactorKey, rawCounts: RawCounts): string {
  switch (factorKey) {
    case "Demand": {
      const top = topSubCounts(rawCounts.demand);
      return top.length ? `${joinWithAnd(top)} within 500 m` : "no demand-generating destinations within 500 m";
    }
    case "Accessibility": {
      const top = topSubCounts(rawCounts.accessibility);
      return top.length ? `${joinWithAnd(top)} within 500 m` : "few transit or road connections within 500 m";
    }
    case "Competition": {
      const { competitor_count: competitorCount } = rawCounts.competition;
      return competitorCount > 0
        ? `${competitorCount} restaurant${competitorCount === 1 ? "" : "s"} already within 500 m`
        : "no existing restaurants within 500 m";
    }
    case "Population":
      return `an estimated ${rawCounts.population.building_count} mapped buildings within 500 m`;
    default:
      return "";
  }
}

/**
 * The factor entitled to say "this is the main reason this site scores X": the largest-magnitude
 * factor whose SHAP direction actually agrees with (supports) the predicted class. Rank-by-magnitude
 * alone (factors[0]) is NOT enough -- the single biggest factor can still be pointing the opposite
 * way (the strongest thing working AGAINST the result, outweighed by the others), and crediting it
 * as "the reason" produces a direct contradiction, e.g. "below-average demand -- the main reason
 * this site scores high." Returns undefined if every factor opposes the predicted class.
 */
function agreeingPrimaryFactor(factors: ShapFactor[]): ShapFactor | undefined {
  return factors.find((factor) => factor.direction === "supports");
}

export function isPrimaryDriver(factors: ShapFactor[], factorKey: FactorKey): boolean {
  return agreeingPrimaryFactor(factors)?.feature === factorKey;
}

/** Factor to feature in the top-line summary next to the verdict (Dashboard/Report). Prefers the
 *  agreeing primary driver; falls back to the largest-magnitude factor -- described in its ordinary,
 *  non-primary framing, never as "the reason" -- when every factor opposes the predicted class. */
export function summaryFactor(factors: ShapFactor[]): ShapFactor | undefined {
  return agreeingPrimaryFactor(factors) ?? factors[0];
}

/**
 * The one place factor headlines are built. Maps (factor, percentile, is-primary-driver) to a
 * plain-language sentence describing the LOCATION -- never the model's internal reasoning. Every
 * render site (Dashboard, Factor breakdown, Report, PDF) calls this instead of building its own text.
 */
export function generateFactorHeadline(
  factorKey: FactorKey,
  percentile: number,
  isPrimary: boolean,
  predictedLabel: string,
  rawCounts: RawCounts,
): string {
  const band = scoreBand(percentile);
  const phrase = FACTOR_BAND_PHRASES[factorKey][band];

  if (isPrimary) {
    return `${phrase} — this is the main reason this site scores ${predictedLabel.toLowerCase()}`;
  }
  if (band === "average") {
    return `${phrase} — neither a strength nor a problem here`;
  }
  return `${phrase} — ${supportingFact(factorKey, rawCounts)}`;
}

// ---------------------------------------------------------------------------
// "What this means for you" -- one plain-language business-implication
// sentence per factor, generated from the score band plus which raw
// sub-categories sit furthest from what's typical for this area. Never a
// single hardcoded string per factor: the chosen category/cluster and the
// favorable/unfavorable framing are both derived from the actual data.
// ---------------------------------------------------------------------------

type DemandCluster = "anchor" | "daytime" | "commercial";

const DEMAND_CLUSTERS: Record<keyof DemandRawCounts, DemandCluster> = {
  cinema: "anchor",
  museum: "anchor",
  temple: "anchor",
  recreation: "anchor",
  office: "daytime",
  college: "daytime",
  school: "daytime",
  hospital: "daytime",
  clinic: "daytime",
  retail: "commercial",
  bank: "commercial",
};

const DEMAND_CLUSTER_INSIGHT: Record<DemandCluster, { negative: string; positive: string }> = {
  anchor: {
    negative:
      "Fewer leisure destinations (temples, cinemas, recreation spots) nearby means less casual weekend foot traffic — a delivery-focused or destination-dining concept may work better than relying on walk-ins.",
    positive:
      "Plenty of leisure destinations nearby brings casual weekend foot traffic — a concept that welcomes walk-ins and groups could do well here.",
  },
  daytime: {
    negative:
      "Fewer offices, schools, or clinics nearby means weaker weekday lunch traffic — a dinner-focused or weekend concept may fit better here.",
    positive:
      "Plenty of offices and other daytime destinations nearby supports strong weekday lunch traffic — a quick-service or lunch-focused concept could do well here.",
  },
  commercial: {
    negative:
      "Less retail and banking activity nearby means fewer people already out shopping or running errands — you'll rely more on being a destination in your own right.",
    positive:
      "Strong retail and commercial activity nearby means plenty of people already out and about — a concept that captures browsing and errand traffic could do well here.",
  },
};

/** A typical value below this is treated as "barely present in this area at all" -- a 0-vs-0.1
 *  gap is technically an extreme ratio but says nothing useful, so categories at that scale are
 *  only used as a last resort, after categories with a substantial-enough typical value to compare against. */
const MEANINGFUL_TYPICAL_MINIMUM = 2;

/** The category with the most extreme actual-vs-typical ratio (lowest when looking for a deficit,
 *  highest when looking for a surplus), preferring categories with a meaningful typical value so
 *  the pick is a substantive gap, not a technically-tied-but-trivial one (e.g. "0 cinemas" when
 *  typical is 0.1 shouldn't out-rank "0 colleges" when typical is 8.8). */
function mostExtremeCategory<Key extends string>(
  actual: Record<Key, number>,
  typical: Partial<Record<Key, number>> | undefined,
  direction: "lowest" | "highest",
): Key | null {
  if (!typical) return null;

  const candidates = (Object.keys(actual) as Key[])
    .map((key) => {
      const typicalValue = typical[key];
      if (!typicalValue || typicalValue <= 0) return null;
      return { key, ratio: actual[key] / typicalValue, typicalValue };
    })
    .filter((entry): entry is { key: Key; ratio: number; typicalValue: number } => entry !== null);

  const meaningful = candidates.filter((entry) => entry.typicalValue >= MEANINGFUL_TYPICAL_MINIMUM);
  const pool = meaningful.length > 0 ? meaningful : candidates;
  if (pool.length === 0) return null;

  const sorted = [...pool].sort((a, b) => (direction === "lowest" ? a.ratio - b.ratio : b.ratio - a.ratio));
  return sorted[0].key;
}

function demandInsight(band: ScoreBand, actual: DemandRawCounts, typical: TypicalDemandCounts | undefined): string {
  const isFavorable = band === "average" || band === "strong";
  const key = mostExtremeCategory(actual, typical, isFavorable ? "highest" : "lowest");
  if (!key) {
    return isFavorable
      ? "Demand-generating destinations nearby are in line with or above what's typical for this area."
      : "Demand-generating destinations nearby fall short of what's typical for this area.";
  }
  const cluster = DEMAND_CLUSTERS[key as keyof DemandRawCounts];
  return DEMAND_CLUSTER_INSIGHT[cluster][isFavorable ? "positive" : "negative"];
}

const ACCESSIBILITY_INSIGHT: Record<keyof AccessibilityRawCounts, { negative: string; positive: string }> = {
  bus_stop: {
    negative: "Fewer bus stops nearby means customers without a car may find this site harder to reach.",
    positive: "Good bus stop coverage nearby makes this site easy to reach without a car.",
  },
  parking_space: {
    negative: "Limited parking nearby may make it harder for customers to stop in, especially for a sit-down concept.",
    positive: "Ample nearby parking makes this an easy stop for customers arriving by car.",
  },
  intersection: {
    negative: "Fewer road intersections nearby means less passing foot and vehicle traffic to catch casual customers.",
    positive: "A well-connected street grid nearby brings plenty of passing traffic that can turn into walk-ins.",
  },
};

function accessibilityInsight(
  band: ScoreBand,
  actual: AccessibilityRawCounts,
  typical: TypicalAccessibilityCounts | undefined,
): string {
  const isFavorable = band === "average" || band === "strong";
  const key = mostExtremeCategory(actual, typical, isFavorable ? "highest" : "lowest");
  if (!key) {
    return isFavorable
      ? "Transit, parking, and road connections nearby are in line with or above what's typical for this area."
      : "Transit, parking, and road connections nearby fall short of what's typical for this area.";
  }
  return ACCESSIBILITY_INSIGHT[key as keyof AccessibilityRawCounts][isFavorable ? "positive" : "negative"];
}

/** Competition is the inverted/cost factor: a favorable (high-percentile) score means FEW real
 *  competitors. This must never read as bad news just because the word "competition" is in the
 *  factor name -- the branching below is keyed off isFavorable, not off the raw competitor count. */
function competitionInsight(band: ScoreBand, dominantCategory: string | null): string {
  const isFavorable = band === "average" || band === "strong";
  if (isFavorable) {
    return dominantCategory
      ? `Few similar restaurants nearby (mostly ${dominantCategory.toLowerCase()}) — there's room for a differentiated concept here.`
      : "Very few existing restaurants nearby — there's room for a differentiated concept here.";
  }
  return dominantCategory
    ? `Several ${pluralizeCategory(dominantCategory, 2)} already operate within 500 m — differentiation will be important if you enter this category.`
    : "Several restaurants already operate within 500 m — differentiation will be important here.";
}

function populationInsight(band: ScoreBand): string {
  const isFavorable = band === "average" || band === "strong";
  return isFavorable
    ? "Nearby building density is at or above typical for this area, suggesting steady residential and foot-traffic support for a walk-in-driven concept."
    : "Nearby building density is below typical for this area, suggesting lower residential and foot-traffic support — success here may depend more on destination dining than walk-ins.";
}

/**
 * One "What this means for you" sentence per factor, generated from the score band (same
 * scoreBand/percentile as generateFactorHeadline, so it can never disagree with the headline
 * above it) plus which raw sub-categories sit furthest from what's typical for this area.
 */
export function generateFactorInsight(
  factorKey: FactorKey,
  percentile: number,
  rawCounts: RawCounts,
  typicalCounts: TypicalCounts,
  dominantCompetitorCategory: string | null = null,
): string {
  const band = scoreBand(percentile);
  switch (factorKey) {
    case "Demand":
      return demandInsight(band, rawCounts.demand, typicalCounts.demand);
    case "Accessibility":
      return accessibilityInsight(band, rawCounts.accessibility, typicalCounts.accessibility);
    case "Competition":
      return competitionInsight(band, dominantCompetitorCategory);
    case "Population":
      return populationInsight(band);
    default:
      return "";
  }
}

function pluralizeCategory(category: string, count: number): string {
  const lower = category.toLowerCase();
  if (count === 1) return lower;
  if (/[^aeiou]y$/.test(lower)) return `${lower.slice(0, -1)}ies`;
  if (/(s|sh|ch|x)$/.test(lower)) return `${lower}es`;
  return `${lower}s`;
}

/** Groups the (already distance-capped) competitor list by category, sorted by count descending. */
export function summarizeCompetitorCategories(
  competitors: CompetitorInfo[],
): Array<{ category: string; count: number }> {
  const counts = new Map<string, number>();
  competitors.forEach((competitor) => {
    const category = competitor.category ?? "Restaurant";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

/** e.g. "3 bakeries, 2 cafes, and 1 Thai restaurant" from summarizeCompetitorCategories()'s output. */
export function formatCategorySummary(summary: Array<{ category: string; count: number }>, max = 4): string {
  if (summary.length === 0) return "";
  const parts = summary.slice(0, max).map(({ category, count }) => `${count} ${pluralizeCategory(category, count)}`);
  return joinWithAnd(parts);
}

/** One-line read of the competitor distance histogram, e.g. "Most competitors are clustered
 *  within 150 m of this site." Returns null when there are no competitors to summarize. */
export function histogramSummary(histogram: DistanceBucket[]): string | null {
  const totalCount = histogram.reduce((sum, bucket) => sum + bucket.count, 0);
  if (totalCount === 0) return null;

  const maxBucket = histogram.reduce((best, bucket) => (bucket.count > best.count ? bucket : best), histogram[0]);
  if (maxBucket.count === 0) return null;

  const share = maxBucket.count / totalCount;
  if (share > 0.5) {
    return `Most competitors are clustered within ${Math.round(maxBucket.end_m)} m of this site.`;
  }
  return `Competitors are spread across the 500 m radius, with the largest cluster ${Math.round(maxBucket.start_m)}–${Math.round(maxBucket.end_m)} m away.`;
}

const FACTOR_NOUN: Record<FactorKey, string> = {
  Demand: "demand",
  Population: "population density",
  Accessibility: "accessibility",
  Competition: "competition conditions",
};

/** Fallback sentence when no meaningfully-better nearby sample exists (backend returned no
 *  improvement_lead) -- explains the result honestly instead of inventing a specific suggestion. */
function fallbackRecommendation(prediction: PredictionResponse): string {
  const label = prediction.predicted_label.toLowerCase();
  const areaName = prediction.area_information.search_area;
  const topFactor = prediction.explanation.factors[0];

  if (!topFactor) {
    return `This ${areaName} site shows ${label} feasibility based on its location factors.`;
  }

  const factorKey = topFactor.feature as FactorKey;
  const percentile = prediction.benchmark[factorKey]?.percentile ?? 50;
  const band = scoreBand(percentile);
  const condition = FACTOR_BAND_PHRASES[factorKey][band].toLowerCase();

  // The single biggest-magnitude factor can still point AWAY from the predicted result (it's the
  // strongest thing working against it, outweighed by the rest) -- only credit it as "leading" or
  // "holding back" the result when its direction actually agrees with the predicted class.
  if (topFactor.direction !== "supports") {
    return `This ${areaName} site shows ${label} feasibility despite ${condition} — other factors outweighed it.`;
  }

  if (label.includes("high")) {
    return `This ${areaName} site shows high feasibility, led by ${condition} — a promising candidate for a new location.`;
  }
  if (label.includes("low")) {
    return `This ${areaName} site shows low feasibility, held back primarily by ${condition} — no single nearby sample scores meaningfully better on this factor, so consider comparing a few different sites directly.`;
  }
  return `This ${areaName} site shows moderate feasibility, led mainly by ${condition} — a reasonable but not exceptional candidate.`;
}

/**
 * One actionable recommendation sentence for the Dashboard and Report. When the backend found a
 * meaningfully-better nearby sample for this site's weakest factor (by percentile), points at it
 * concretely (direction, distance, how much higher); otherwise falls back to an honest explanation
 * rather than inventing specifics that aren't backed by data.
 */
export function generateRecommendation(prediction: PredictionResponse): string {
  const lead = prediction.improvement_lead;
  if (!lead) {
    return fallbackRecommendation(prediction);
  }

  const areaName = prediction.area_information.search_area;
  const factorKey = lead.factor as FactorKey;
  const noun = FACTOR_NOUN[factorKey] ?? lead.factor.toLowerCase();

  const here = { lat: prediction.latitude, lng: prediction.longitude };
  const there = { lat: lead.best_nearby_latitude, lng: lead.best_nearby_longitude };
  const distance = Math.round(distanceInMeters(here, there));
  const direction = compassLabel(bearingDegrees(here, there));

  const comparison =
    lead.current_value > 0.02
      ? `roughly ${(lead.best_nearby_value / lead.current_value).toFixed(1)}x higher`
      : `around ${Math.round(lead.best_nearby_value * 100)}/100, versus ${Math.round(lead.current_value * 100)}/100 here`;

  return `Consider sites toward the ${direction} within ${areaName} (roughly ${distance} m away), where nearby analyzed locations show ${noun} ${comparison}.`;
}

/** Plain decision-framing headline for the Report's executive summary -- leads with the
 *  recommendation itself, not the classification label (which appears only as a secondary badge). */
export function generateDecisionHeadline(predictedLabel: string): string {
  const label = predictedLabel.toLowerCase();
  if (label.includes("high")) return "This site looks promising.";
  if (label.includes("low")) return "We'd suggest caution on this site.";
  return "This site shows moderate potential — worth a closer look.";
}

/**
 * One concrete sentence per below-average factor for the Report's Key Risks section. Reuses
 * generateFactorHeadline (same wording as Dashboard/Factor breakdown) rather than a parallel
 * risk-sentence template -- a below-average, non-primary factor already reads as a fact-grounded
 * risk statement, e.g. "Poor accessibility — few transit or road connections within 500 m."
 */
export function generateKeyRisks(prediction: PredictionResponse): string[] {
  const weakFactors = COMPARISON_FACTORS.map((factor) => ({
    factor,
    percentile: prediction.benchmark[factor.key]?.percentile ?? 50,
  }))
    .filter(({ percentile }) => {
      const band = scoreBand(percentile);
      return band === "weak" || band === "below average";
    })
    .sort((a, b) => a.percentile - b.percentile);

  if (weakFactors.length === 0) {
    return [
      "No significant risk factors identified — this location's site conditions are at or above typical for the area.",
    ];
  }

  return weakFactors.map(({ factor, percentile }) =>
    generateFactorHeadline(
      factor.key,
      percentile,
      isPrimaryDriver(prediction.explanation.factors, factor.key),
      prediction.predicted_label,
      prediction.site_detail.raw_counts,
    ),
  );
}

/**
 * Actionable next steps for the Report's "What would improve this site" section: the existing
 * location-based recommendation (backed by improvement_lead, when a meaningfully-better nearby
 * sample exists) plus the weakest factor's existing business-pivot insight. Never invents a named
 * street/landmark -- improvement_lead only gives compass direction + distance to a comparable
 * sample, which is exactly what generateRecommendation already surfaces; there is no data source
 * for named local landmarks ("the main tourist route") in this pipeline.
 */
export function generateImprovementSuggestions(prediction: PredictionResponse): string[] {
  const suggestions = [generateRecommendation(prediction)];

  const weakest = [...COMPARISON_FACTORS]
    .map((factor) => ({ factor, percentile: prediction.benchmark[factor.key]?.percentile ?? 50 }))
    .sort((a, b) => a.percentile - b.percentile)[0];

  if (weakest) {
    const dominantCategory =
      weakest.factor.key === "Competition"
        ? summarizeCompetitorCategories(prediction.site_detail.nearby_competitors)[0]?.category ?? null
        : null;
    const pivotInsight = generateFactorInsight(
      weakest.factor.key,
      weakest.percentile,
      prediction.site_detail.raw_counts,
      prediction.site_detail.typical_counts,
      dominantCategory,
    );
    if (pivotInsight && !suggestions.includes(pivotInsight)) {
      suggestions.push(pivotInsight);
    }
  }

  return suggestions;
}

export type ConfidenceBand = "High" | "Moderate" | "Low";

/** High >=85%, Moderate 60-85%, Low <60%. */
export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.85) return "High";
  if (confidence >= 0.6) return "Moderate";
  return "Low";
}

export const LOCATION_ONLY_DISCLAIMER =
  "This is an estimate based on location factors only — it does not account for your menu, pricing, management, or marketing.";

// ---------------------------------------------------------------------------
// Comparison page: plain-language differences, a winner summary, and raw-
// count rows. Competition is the inverted/cost factor (a higher score means
// FEWER real competitors), so its "advantage" phrase describes LESS
// competition as the favorable direction -- never "stronger/higher
// competition," which reads backwards to a non-technical reader.
// ---------------------------------------------------------------------------

/** This factor's own 0-1 value for a saved location, coerced the same way collected_features
 *  values are elsewhere (they're sometimes serialized as strings). */
export function factorValue(entry: SavedPrediction, factorKey: FactorKey): number {
  const value = entry.prediction.collected_features[factorKey];
  return typeof value === "number" ? value : Number(value) || 0;
}

export type DifferenceBand = "no meaningful difference" | "slightly stronger" | "clearly stronger";

const NO_DIFFERENCE_THRESHOLD_POINTS = 3;
const CLEAR_DIFFERENCE_THRESHOLD_POINTS = 12;

/** Bands a 0-100-scale point gap into a plain-language difference. A sub-3-point gap is false
 *  precision on this kind of index -- it must never be presented as a real advantage. */
export function differenceBand(pointDifference: number): DifferenceBand {
  const magnitude = Math.abs(pointDifference);
  if (magnitude < NO_DIFFERENCE_THRESHOLD_POINTS) return "no meaningful difference";
  if (magnitude < CLEAR_DIFFERENCE_THRESHOLD_POINTS) return "slightly stronger";
  return "clearly stronger";
}

/** Adjective phrase describing what it means for a site to have the MORE FAVORABLE score on this
 *  factor -- always the favorable direction, never a bare "higher/stronger {factor name}" template,
 *  so Competition ("less existing competition") can't read backwards. */
const FACTOR_ADVANTAGE_PHRASE: Record<FactorKey, string> = {
  Demand: "higher customer demand",
  Population: "higher population density",
  Accessibility: "better accessibility",
  Competition: "less existing competition",
};

/** One per-factor comparison line, e.g. "Site B has clearly higher population density." or
 *  "No meaningful difference in accessibility." */
export function factorComparisonSentence(factorKey: FactorKey, leaderName: string, pointDifference: number): string {
  const band = differenceBand(pointDifference);
  if (band === "no meaningful difference") {
    const shortNoun = FACTOR_NOUN[factorKey];
    return `No meaningful difference in ${shortNoun}.`;
  }
  const intensity = band === "clearly stronger" ? "clearly" : "slightly";
  return `${leaderName} has ${intensity} ${FACTOR_ADVANTAGE_PHRASE[factorKey]}.`;
}

/**
 * One plain sentence naming the stronger option overall and why, or saying the sites are
 * genuinely close instead of forcing a winner. Compares the sum of the 4 (already
 * favorable-oriented) factor values, then cites whichever single factor has the largest gap
 * between the top two sites, phrased via FACTOR_ADVANTAGE_PHRASE so Competition can't read backwards.
 */
export function generateComparisonSummary(entries: SavedPrediction[]): string {
  if (entries.length < 2) return "";

  const totals = entries
    .map((entry) => ({
      name: entry.name,
      values: Object.fromEntries(
        COMPARISON_FACTORS.map((factor) => [factor.key, factorValue(entry, factor.key)]),
      ) as Record<FactorKey, number>,
    }))
    .map((entry) => ({
      ...entry,
      total: COMPARISON_FACTORS.reduce((sum, factor) => sum + entry.values[factor.key], 0),
    }))
    .sort((a, b) => b.total - a.total);

  const [leader, runnerUp] = totals;
  const averageGapPoints = ((leader.total - runnerUp.total) / COMPARISON_FACTORS.length) * 100;

  if (averageGapPoints < NO_DIFFERENCE_THRESHOLD_POINTS) {
    return "These sites are genuinely close overall — no single one clearly stands out across demand, population, accessibility, and competition.";
  }

  let biggestGapFactor: FactorKey = COMPARISON_FACTORS[0].key;
  let biggestGap = -Infinity;
  COMPARISON_FACTORS.forEach((factor) => {
    const gap = leader.values[factor.key] - runnerUp.values[factor.key];
    if (gap > biggestGap) {
      biggestGap = gap;
      biggestGapFactor = factor.key;
    }
  });

  return `${leader.name} is the stronger option overall, mainly due to ${FACTOR_ADVANTAGE_PHRASE[biggestGapFactor]}.`;
}

export type RawCountComparisonRow = { label: string; values: number[] };

/** Side-by-side raw counts for the saved locations being compared -- one representative,
 *  recognizable count per factor, pulled straight from each entry's already-persisted
 *  site_detail.raw_counts (no recomputation). */
export function generateRawCountRows(entries: SavedPrediction[]): RawCountComparisonRow[] {
  return [
    {
      label: "Restaurants within 500 m",
      values: entries.map((entry) => entry.prediction.site_detail.raw_counts.competition.competitor_count),
    },
    {
      label: "Offices within 500 m",
      values: entries.map((entry) => entry.prediction.site_detail.raw_counts.demand.office),
    },
    {
      label: "Retail places within 500 m",
      values: entries.map((entry) => entry.prediction.site_detail.raw_counts.demand.retail),
    },
    {
      label: "Road intersections within 500 m",
      values: entries.map((entry) => entry.prediction.site_detail.raw_counts.accessibility.intersection),
    },
    {
      label: "Mapped buildings within 500 m",
      values: entries.map((entry) => entry.prediction.site_detail.raw_counts.population.building_count),
    },
  ];
}
