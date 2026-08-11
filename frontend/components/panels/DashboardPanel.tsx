"use client";

import { useState } from "react";
import { COMPARISON_FACTORS, type PredictionResponse } from "@/components/types";
import { generateRecommendation } from "@/lib/insights";
import { resultAccentColors, resultBadgeClasses } from "@/lib/utils";

const GAUGE_RADIUS = 52;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;
const MINI_GAUGE_RADIUS = 22;
const MINI_GAUGE_CIRCUMFERENCE = 2 * Math.PI * MINI_GAUGE_RADIUS;

const FACTOR_COLORS: Record<string, string> = {
  Demand: "#2563eb",
  Population: "#7c3aed",
  Accessibility: "#059669",
  Competition: "#ea580c",
};

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
  onSave: () => void;
};

export default function DashboardPanel({ prediction, onSave }: DashboardPanelProps) {
  const [justSaved, setJustSaved] = useState(false);

  const handleSave = () => {
    onSave();
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1600);
  };

  if (!prediction) {
    return (
      <div>
        <h3 className="text-lg font-semibold">Dashboard</h3>
        <p className="mt-3 text-sm leading-6 text-gray-500">
          Select a location on the map and analyze it to see its feasibility summary here.
        </p>
      </div>
    );
  }

  const accent = resultAccentColors(prediction.predicted_label);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const thumbnailUrl = apiKey
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${prediction.latitude},${prediction.longitude}&zoom=15&size=380x140&scale=2&maptype=roadmap&markers=color:red%7C${prediction.latitude},${prediction.longitude}&key=${apiKey}`
    : null;

  return (
    <div>
      <h3 className="text-2xl font-extrabold text-gray-900">Dashboard</h3>
      <div className="mt-3">
        <span
          className={`inline-flex items-center rounded-full px-8 py-3 text-5xl font-extrabold ${resultBadgeClasses(prediction.predicted_label)}`}
        >
          {prediction.predicted_label}
        </span>
        <span className="mt-1.5 block text-xs font-semibold text-gray-400">
          {Math.round(prediction.confidence * 100)}% confidence
        </span>
      </div>
      <p className="mt-1.5 text-sm text-gray-500">
        {prediction.area_information.search_area} · {Math.round(
          prediction.area_information.distance_from_area_center_m,
        )} m from center
      </p>

      <div className="mt-4 flex items-center gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <svg
          aria-label={`Confidence ${Math.round(prediction.confidence * 100)} percent`}
          className="h-20 w-20 shrink-0"
          role="img"
          viewBox="0 0 120 120"
        >
          <circle cx="60" cy="60" fill="none" r={GAUGE_RADIUS} stroke="#e5e7eb" strokeWidth="10" />
          <circle
            cx="60"
            cy="60"
            fill="none"
            r={GAUGE_RADIUS}
            stroke={accent.ring}
            strokeDasharray={GAUGE_CIRCUMFERENCE}
            strokeDashoffset={GAUGE_CIRCUMFERENCE * (1 - prediction.confidence)}
            strokeLinecap="round"
            strokeWidth="10"
            transform="rotate(-90 60 60)"
          />
          <text fontSize="20" fontWeight="700" textAnchor="middle" x="60" y="57" fill="#111827">
            {Math.round(prediction.confidence * 100)}%
          </text>
          <text fontSize="9" textAnchor="middle" x="60" y="72" fill="#9ca3af">
            confidence
          </text>
        </svg>
        <div className="min-w-0">
          <p className={`text-base font-bold ${accent.text}`}>{prediction.predicted_label} feasibility</p>
          <p className="mt-1 text-xs leading-5 text-gray-500">{prediction.explanation.summary}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {COMPARISON_FACTORS.map((factor) => {
          const rawValue = Number(prediction.collected_features[factor.key]) || 0;
          const value = Math.max(0, Math.min(1, rawValue));
          const color = FACTOR_COLORS[factor.key] ?? "#6b7280";
          return (
            <div
              className="flex flex-col items-center rounded-xl border border-gray-100 bg-white py-2.5 shadow-sm"
              key={factor.key}
            >
              <svg
                aria-label={`${factor.label} ${(value * 100).toFixed(0)} out of 100`}
                className="h-12 w-12"
                role="img"
                viewBox="0 0 60 60"
              >
                <circle cx="30" cy="30" fill="none" r={MINI_GAUGE_RADIUS} stroke="#e5e7eb" strokeWidth="5" />
                <circle
                  cx="30"
                  cy="30"
                  fill="none"
                  r={MINI_GAUGE_RADIUS}
                  stroke={color}
                  strokeDasharray={MINI_GAUGE_CIRCUMFERENCE}
                  strokeDashoffset={MINI_GAUGE_CIRCUMFERENCE * (1 - value)}
                  strokeLinecap="round"
                  strokeWidth="5"
                  transform="rotate(-90 30 30)"
                />
                <text fontSize="13" fontWeight="700" textAnchor="middle" x="30" y="34" fill="#111827">
                  {(value * 100).toFixed(0)}
                </text>
              </svg>
              <span className="mt-1 text-[10px] font-medium text-gray-500">{factor.label}</span>
            </div>
          );
        })}
      </div>

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
      </div>

      <button
        className={`mt-4 w-full rounded-xl border px-4 py-2.5 text-sm font-semibold transition active:scale-[0.97] ${
          justSaved
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
        }`}
        onClick={handleSave}
        type="button"
      >
        {justSaved ? "Saved ✓" : "Save to prediction history"}
      </button>
    </div>
  );
}
