"use client";

import {
  COMPARISON_FACTORS,
  type FactorKey,
  type PredictionResponse,
  type RawCounts,
  type TypicalCounts,
} from "@/components/types";
import DistanceHistogram from "@/components/charts/DistanceHistogram";
import FactorBarChart, { type BarDatum } from "@/components/charts/FactorBarChart";
import {
  formatCategorySummary,
  generateFactorHeadline,
  generateFactorInsight,
  histogramSummary,
  isPrimaryDriver,
  summarizeCompetitorCategories,
} from "@/lib/insights";

const FACTOR_HEX: Record<string, string> = {
  Demand: "#2563eb",
  Population: "#7c3aed",
  Accessibility: "#059669",
  Competition: "#ea580c",
};

const RAW_COUNT_LABELS: Record<string, string> = {
  cinema: "Cinemas",
  museum: "Museums",
  temple: "Temples",
  recreation: "Recreation venues",
  office: "Offices",
  college: "Colleges",
  school: "Schools",
  hospital: "Hospitals",
  clinic: "Clinics",
  retail: "Retail places",
  bank: "Banks",
  bus_stop: "Bus stops",
  parking_space: "Parking spaces",
  intersection: "Road intersections",
  competitor_count: "Existing restaurants within 500 m",
  building_count: "Mapped buildings within 500 m",
};

function barDataForFactor(factorKey: FactorKey, rawCounts: RawCounts, typicalCounts: TypicalCounts): BarDatum[] {
  switch (factorKey) {
    case "Demand":
      return (Object.keys(rawCounts.demand) as Array<keyof RawCounts["demand"]>).map((key) => ({
        key,
        label: RAW_COUNT_LABELS[key] ?? key,
        count: rawCounts.demand[key],
        typical: typicalCounts.demand[key] ?? null,
      }));
    case "Accessibility":
      return (Object.keys(rawCounts.accessibility) as Array<keyof RawCounts["accessibility"]>).map((key) => ({
        key,
        label: RAW_COUNT_LABELS[key] ?? key,
        count: rawCounts.accessibility[key],
        typical: typicalCounts.accessibility[key] ?? null,
      }));
    case "Competition":
      return [
        {
          key: "competitor_count",
          label: RAW_COUNT_LABELS.competitor_count,
          count: rawCounts.competition.competitor_count,
          typical: typicalCounts.competition.competitor_count ?? null,
        },
      ];
    case "Population":
      return [
        {
          key: "building_count",
          label: RAW_COUNT_LABELS.building_count,
          count: rawCounts.population.building_count,
          typical: typicalCounts.population.building_count ?? null,
        },
      ];
    default:
      return [];
  }
}

type FactorBreakdownPanelProps = {
  prediction: PredictionResponse | null;
};

export default function FactorBreakdownPanel({ prediction }: FactorBreakdownPanelProps) {
  if (!prediction) {
    return (
      <div>
        <h3 className="text-4xl font-semibold text-gray-900">Factor breakdown</h3>
        <p className="mt-3 text-sm leading-6 text-gray-500">
          Analyze a location to see a detailed breakdown of each site-condition factor.
        </p>
      </div>
    );
  }

  const {
    raw_counts: rawCounts,
    typical_counts: typicalCounts,
    nearby_competitors: nearbyCompetitors,
    competitor_distance_histogram: distanceHistogram,
  } = prediction.site_detail;

  const categorySummary = summarizeCompetitorCategories(nearbyCompetitors);
  const categorySummaryText = formatCategorySummary(categorySummary);
  const histogramNote = histogramSummary(distanceHistogram);

  return (
    <div>
      <h3 className="text-4xl font-semibold text-gray-900">Factor breakdown</h3>
      <p className="mt-1 text-sm text-gray-500">A detailed look at what drove each site-condition score.</p>

      <div className="mt-5 space-y-5">
        {COMPARISON_FACTORS.map((factor) => {
          const percentile = prediction.benchmark[factor.key]?.percentile ?? 50;
          const headline = generateFactorHeadline(
            factor.key,
            percentile,
            isPrimaryDriver(prediction.explanation.factors, factor.key),
            prediction.predicted_label,
            rawCounts,
          );
          const insight = generateFactorInsight(
            factor.key,
            percentile,
            rawCounts,
            typicalCounts,
            factor.key === "Competition" ? categorySummary[0]?.category ?? null : null,
          );

          return (
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4" key={factor.key}>
              <h4 className="text-sm font-semibold text-gray-900">{factor.label}</h4>

              <p className="mt-3 text-sm leading-6 text-gray-600">{headline}</p>

              <div className="mt-3 rounded-lg bg-blue-50 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-500">
                  What this means for you
                </p>
                <p className="mt-0.5 text-xs leading-5 text-blue-900">{insight}</p>
              </div>

              <FactorBarChart
                color={FACTOR_HEX[factor.key] ?? "#6b7280"}
                data={barDataForFactor(factor.key, rawCounts, typicalCounts)}
              />

              {factor.key === "Competition" && (
                <div className="mt-4 border-t border-gray-200 pt-3">
                  {rawCounts.competition.nearest_restaurant_m !== null && (
                    <p className="text-xs text-gray-500">
                      Nearest existing restaurant: {Math.round(rawCounts.competition.nearest_restaurant_m)} m away
                    </p>
                  )}
                  <p className="mt-2 text-xs font-semibold text-gray-500">Competitor distance (0–500 m)</p>
                  <div className="mt-2">
                    <DistanceHistogram buckets={distanceHistogram} color={FACTOR_HEX.Competition} />
                  </div>
                  {histogramNote && <p className="mt-2 text-xs text-gray-500">{histogramNote}</p>}
                </div>
              )}

              {factor.key === "Competition" && (
                <div className="mt-4 border-t border-gray-200 pt-3">
                  <p className="text-xs font-semibold text-gray-500">Nearby competitor restaurants</p>
                  {nearbyCompetitors.length === 0 ? (
                    <p className="mt-2 text-xs text-gray-500">No existing competitors were found within 500 m.</p>
                  ) : (
                    <>
                      {categorySummaryText && (
                        <p className="mt-1 text-xs leading-5 text-gray-600">{categorySummaryText}</p>
                      )}
                      <ol className="mt-2 space-y-2">
                        {nearbyCompetitors.slice(0, 8).map((competitor, index) => (
                          <li
                            className="flex items-center justify-between gap-2 text-xs"
                            key={`${competitor.name}-${index}`}
                          >
                            <span className="min-w-0 truncate text-gray-700">
                              {index + 1}. {competitor.name}
                              {competitor.category && (
                                <span className="text-gray-400"> · {competitor.category}</span>
                              )}
                            </span>
                            <span className="shrink-0 text-gray-500">
                              {competitor.rating !== null ? `★ ${competitor.rating.toFixed(1)}` : "no rating"} ·{" "}
                              {Math.round(competitor.distance_m)} m
                            </span>
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
