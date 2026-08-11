import type { PredictionResponse, RawCounts, ShapFactor } from "@/components/types";

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

const NEUTRAL_RELATIVE_IMPACT_THRESHOLD = 0.15;

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

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Five-band plain-language verdict: strongly/slightly supports, neutral, slightly/strongly opposes. */
export function verdictBandLabel(factor: ShapFactor): string {
  if (factor.relative_impact < NEUTRAL_RELATIVE_IMPACT_THRESHOLD) {
    return "Limited measurable effect";
  }
  return capitalize(`${factor.strength} ${factor.direction}`);
}

/** The detail sentence half of a factor verdict, without the band-label prefix. */
export function factorVerdictDetail(factor: ShapFactor, rawCounts: RawCounts): string {
  let detail: string;
  switch (factor.feature) {
    case "Demand": {
      const top = topSubCounts(rawCounts.demand);
      detail = top.length
        ? `This area sees steady traffic from nearby ${joinWithAnd(top)} within 500 m — a signal for walk-in customers.`
        : "Few demand-generating destinations were found within 500 m of this site.";
      break;
    }
    case "Accessibility": {
      const top = topSubCounts(rawCounts.accessibility);
      detail = top.length
        ? `The site is served by ${joinWithAnd(top)} within 500 m.`
        : "Few transit or road connections were found within 500 m of this site.";
      break;
    }
    case "Competition": {
      const { competitor_count: competitorCount, nearest_restaurant_m: nearestRestaurantM } = rawCounts.competition;
      detail = competitorCount > 0
        ? `There ${competitorCount === 1 ? "is" : "are"} ${competitorCount} existing restaurant${competitorCount === 1 ? "" : "s"} within 500 m${
            nearestRestaurantM !== null ? `, the nearest about ${Math.round(nearestRestaurantM)} m away` : ""
          }.`
        : "No existing restaurants were found within 500 m of this site.";
      break;
    }
    case "Population": {
      detail = `An estimated ${rawCounts.population.building_count} mapped buildings sit within 500 m, used as a proxy for surrounding population density.`;
      break;
    }
    default:
      detail = factor.description;
  }

  return detail;
}

/** One dynamically generated sentence per factor: band label + detail, derived from SHAP + raw counts. */
export function generateFactorVerdict(factor: ShapFactor, rawCounts: RawCounts): string {
  return `${verdictBandLabel(factor)} — ${factorVerdictDetail(factor, rawCounts)}`;
}

/** One top-line recommendation sentence for the Dashboard and Report. */
export function generateRecommendation(prediction: PredictionResponse): string {
  const label = prediction.predicted_label.toLowerCase();
  const areaName = prediction.area_information.search_area;
  const topFactor = prediction.explanation.factors[0];

  if (!topFactor) {
    return `This ${areaName} site shows ${label} feasibility based on the model's site-condition scores.`;
  }

  const factorName = topFactor.feature.toLowerCase();

  if (label.includes("high")) {
    return `This ${areaName} site shows high feasibility, led by strong ${factorName} — a promising candidate for a new location.`;
  }
  if (label.includes("low")) {
    return topFactor.direction === "opposes"
      ? `This ${areaName} site shows low feasibility, held back primarily by weak ${factorName} — consider a nearby location with stronger ${factorName}.`
      : `This ${areaName} site shows low feasibility despite supportive ${factorName} — other factors are outweighing it.`;
  }
  return topFactor.direction === "opposes"
    ? `This ${areaName} site shows moderate feasibility, primarily held back by ${factorName} — worth comparing against nearby alternatives.`
    : `This ${areaName} site shows moderate feasibility, supported mainly by ${factorName} — a reasonable but not exceptional candidate.`;
}
