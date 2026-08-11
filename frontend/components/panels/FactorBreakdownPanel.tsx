"use client";

import {
  COMPARISON_FACTORS,
  type FactorKey,
  type PredictionResponse,
  type RawCounts,
} from "@/components/types";
import { factorVerdictDetail, verdictBandLabel } from "@/lib/insights";

const FACTOR_BAR_COLORS: Record<string, string> = {
  Demand: "bg-blue-500",
  Population: "bg-purple-500",
  Accessibility: "bg-emerald-500",
  Competition: "bg-orange-500",
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
  nearest_restaurant_m: "Nearest restaurant (m away)",
  building_count: "Mapped buildings within 500 m",
};

function rawCountEntries(factorKey: FactorKey, rawCounts: RawCounts): Array<[string, number]> {
  switch (factorKey) {
    case "Demand":
      return Object.entries(rawCounts.demand);
    case "Accessibility":
      return Object.entries(rawCounts.accessibility);
    case "Competition": {
      const entries: Array<[string, number]> = [["competitor_count", rawCounts.competition.competitor_count]];
      if (rawCounts.competition.nearest_restaurant_m !== null) {
        entries.push(["nearest_restaurant_m", Math.round(rawCounts.competition.nearest_restaurant_m)]);
      }
      return entries;
    }
    case "Population":
      return Object.entries(rawCounts.population);
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
        <h3 className="text-lg font-semibold">Factor breakdown</h3>
        <p className="mt-3 text-sm leading-6 text-gray-500">
          Analyze a location to see a detailed breakdown of each site-condition factor.
        </p>
      </div>
    );
  }

  const { raw_counts: rawCounts, nearby_competitors: nearbyCompetitors } = prediction.site_detail;

  return (
    <div>
      <h3 className="text-lg font-semibold">Factor breakdown</h3>
      <p className="mt-1 text-sm text-gray-500">A detailed look at what drove each site-condition score.</p>

      <div className="mt-5 space-y-5">
        {COMPARISON_FACTORS.map((factor) => {
          const rawValue = Number(prediction.collected_features[factor.key]) || 0;
          const value = Math.max(0, Math.min(1, rawValue));
          const shapFactor = prediction.explanation.factors.find((item) => item.feature === factor.key);
          const entries = rawCountEntries(factor.key, rawCounts);

          return (
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4" key={factor.key}>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900">{factor.label}</h4>
                <span className="text-sm font-bold text-gray-900">
                  {(value * 100).toFixed(0)}
                  <span className="text-xs font-medium text-gray-400">/100</span>
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
                <div
                  className={`h-full rounded-full ${FACTOR_BAR_COLORS[factor.key] ?? "bg-gray-400"}`}
                  style={{ width: `${Math.max(4, value * 100)}%` }}
                />
              </div>

              {shapFactor && (
                <p className="mt-3 text-sm leading-6 text-gray-600">
                  <span className="font-semibold text-gray-800">{verdictBandLabel(shapFactor)}</span>
                  {" — "}
                  {factorVerdictDetail(shapFactor, rawCounts)}
                </p>
              )}

              {entries.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-gray-500 hover:text-gray-700">
                    Raw count breakdown
                  </summary>
                  <ol className="mt-2 space-y-1 text-xs leading-5 text-gray-600">
                    {entries.map(([key, count], index) => (
                      <li key={key}>
                        {index + 1}. {RAW_COUNT_LABELS[key] ?? key}:{" "}
                        <span className="font-semibold text-gray-900">{count}</span>
                      </li>
                    ))}
                  </ol>
                </details>
              )}

              {factor.key === "Competition" && (
                <div className="mt-4 border-t border-gray-200 pt-3">
                  <p className="text-xs font-semibold text-gray-500">Nearby competitor restaurants</p>
                  {nearbyCompetitors.length === 0 ? (
                    <p className="mt-2 text-xs text-gray-500">No existing competitors were found within 500 m.</p>
                  ) : (
                    <ol className="mt-2 space-y-2">
                      {nearbyCompetitors.slice(0, 8).map((competitor, index) => (
                        <li className="flex items-center justify-between gap-2 text-xs" key={`${competitor.name}-${index}`}>
                          <span className="truncate text-gray-700">
                            {index + 1}. {competitor.name}
                          </span>
                          <span className="shrink-0 text-gray-500">
                            {competitor.rating !== null ? `★ ${competitor.rating.toFixed(1)}` : "no rating"} ·{" "}
                            {Math.round(competitor.distance_m)} m
                          </span>
                        </li>
                      ))}
                    </ol>
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
