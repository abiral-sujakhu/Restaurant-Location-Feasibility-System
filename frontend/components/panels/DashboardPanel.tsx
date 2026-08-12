"use client";

import { useState } from "react";
import { type FactorKey, COMPARISON_FACTORS, type PredictionResponse } from "@/components/types";
import FactorGauge from "@/components/charts/FactorGauge";
import {
  generateFactorHeadline,
  generateRecommendation,
  isPrimaryDriver,
  LOCATION_ONLY_DISCLAIMER,
  scoreBand,
  summaryFactor,
} from "@/lib/insights";
import { buildStaticMapUrl } from "@/lib/staticMap";
import { resultAccentColors, resultBadgeClasses } from "@/lib/utils";

const SITE_RADIUS_M = 500;
const THUMBNAIL_WIDTH = 380;
const THUMBNAIL_HEIGHT = 140;

const FACTOR_COLORS: Record<string, string> = {
  Demand: "#2563eb",
  Population: "#7c3aed",
  Accessibility: "#059669",
  Competition: "#ea580c",
};

const RAW_COUNT_UNIT: Record<string, string> = {
  Demand: "POIs",
  Accessibility: "access pts",
  Competition: "competitors",
  Population: "buildings",
};

function rawCountTotal(factorKey: string, rawCounts: PredictionResponse["site_detail"]["raw_counts"]): number {
  switch (factorKey) {
    case "Demand":
      return Object.values(rawCounts.demand).reduce((sum, count) => sum + count, 0);
    case "Accessibility":
      return (
        rawCounts.accessibility.bus_stop +
        rawCounts.accessibility.parking_space +
        rawCounts.accessibility.intersection
      );
    case "Competition":
      return rawCounts.competition.competitor_count;
    case "Population":
      return rawCounts.population.building_count;
    default:
      return 0;
  }
}

function MapThumbnail({ url, alt }: { url: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-28 items-center justify-center px-4 text-center text-xs text-gray-400">
        Map thumbnail unavailable — enable the Maps Static API for this project&apos;s API key.
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external dynamic Static Maps image, not a local asset
    <img alt={alt} className="h-28 w-full object-cover" onError={() => setFailed(true)} src={url} />
  );
}

type DashboardPanelProps = {
  prediction: PredictionResponse | null;
  isSaved: boolean;
  onSave: () => void;
  onNavigateToSuggestion: (position: { lat: number; lng: number }) => void;
};

export default function DashboardPanel({ prediction, isSaved, onSave, onNavigateToSuggestion }: DashboardPanelProps) {
  if (!prediction) {
    return (
      <div>
        <h3 className="text-4xl font-semibold text-gray-900">Dashboard</h3>
        <p className="mt-3 text-sm leading-6 text-gray-500">
          Select a location on the map and analyze it to see its feasibility summary here.
        </p>
      </div>
    );
  }

  const accent = resultAccentColors(prediction.predicted_label);
  const improvementLead = prediction.improvement_lead;
  const thumbnailUrl = buildStaticMapUrl(prediction.latitude, prediction.longitude, {
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    radiusM: SITE_RADIUS_M,
  });

  const topFactor = summaryFactor(prediction.explanation.factors);
  const topFactorHeadline = topFactor
    ? generateFactorHeadline(
        topFactor.feature as FactorKey,
        prediction.benchmark[topFactor.feature as FactorKey]?.percentile ?? 50,
        isPrimaryDriver(prediction.explanation.factors, topFactor.feature as FactorKey),
        prediction.predicted_label,
        prediction.site_detail.raw_counts,
      )
    : null;

  return (
    <div>
      <h3 className="text-4xl font-semibold text-gray-900">Dashboard</h3>
      <div className="mt-3">
        <span
          className={`inline-flex items-center rounded-full px-5 py-2 text-2xl font-semibold ${resultBadgeClasses(prediction.predicted_label)}`}
        >
          {prediction.predicted_label}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-gray-500">
        {prediction.area_information.search_area} · {Math.round(
          prediction.area_information.distance_from_area_center_m,
        )} m from center
      </p>

      <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <p className={`text-base font-normal ${accent.text}`}>{prediction.predicted_label} feasibility</p>
        {topFactorHeadline && (
          <p className="mt-1 text-xs leading-5 text-gray-500">{topFactorHeadline}</p>
        )}
        <p className="mt-2 text-[11px] leading-4 text-gray-400">{LOCATION_ONLY_DISCLAIMER}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {COMPARISON_FACTORS.map((factor) => {
          const rawValue = Number(prediction.collected_features[factor.key]) || 0;
          const value = Math.max(0, Math.min(1, rawValue));
          const count = rawCountTotal(factor.key, prediction.site_detail.raw_counts);
          const benchmark = prediction.benchmark[factor.key];
          const band = scoreBand(benchmark?.percentile ?? 50);
          return (
            <FactorGauge
              band={band}
              color={FACTOR_COLORS[factor.key] ?? "#6b7280"}
              factorKey={factor.key}
              key={factor.key}
              label={factor.label}
              mean={benchmark?.mean ?? null}
              percentile={benchmark?.percentile ?? null}
              rawCountLabel={`${count} ${RAW_COUNT_UNIT[factor.key] ?? ""}`}
              value={value}
            />
          );
        })}
      </div>
      <p className="mt-2 text-[11px] leading-4 text-gray-400">
        These are each factor&apos;s raw score. The summary above names whichever factor mattered
        most to this result relative to typical locations — not simply which score here is highest.
      </p>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
        {thumbnailUrl ? (
          <MapThumbnail
            alt={`Map thumbnail near ${prediction.area_information.search_area}`}
            key={thumbnailUrl}
            url={thumbnailUrl}
          />
        ) : (
          <div className="flex h-28 items-center justify-center text-xs text-gray-400">
            Map thumbnail unavailable
          </div>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-500">Recommendation</p>
        <p className="mt-1 text-sm leading-5 text-blue-900">{generateRecommendation(prediction)}</p>
        {improvementLead && (
          <button
            className="mt-3 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 active:scale-[0.97]"
            onClick={() =>
              onNavigateToSuggestion({
                lat: improvementLead.best_nearby_latitude,
                lng: improvementLead.best_nearby_longitude,
              })
            }
            type="button"
          >
            Go to this location on the map
          </button>
        )}
      </div>

      <button
        className={`mt-4 w-full rounded-xl border px-4 py-2.5 text-sm font-semibold transition active:scale-[0.97] ${
          isSaved
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
        }`}
        onClick={onSave}
        type="button"
      >
        {isSaved ? "Saved ✓" : "Save to prediction history"}
      </button>
    </div>
  );
}
