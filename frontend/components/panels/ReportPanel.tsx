"use client";

import { COMPARISON_FACTORS, type PredictionResponse } from "@/components/types";
import { factorVerdictDetail, generateRecommendation, verdictBandLabel } from "@/lib/insights";
import { downloadPdfReport } from "@/lib/reportGeneration";
import { readableFeatureName, resultAccentColors, resultBadgeClasses } from "@/lib/utils";

type ReportPanelProps = {
  prediction: PredictionResponse | null;
};

export default function ReportPanel({ prediction }: ReportPanelProps) {
  if (!prediction) {
    return (
      <div>
        <h3 className="text-lg font-semibold">Report</h3>
        <p className="mt-3 text-sm leading-6 text-gray-500">
          Analyze a location to generate a full report you can review here or download as a PDF.
        </p>
      </div>
    );
  }

  const accent = resultAccentColors(prediction.predicted_label);
  const { raw_counts: rawCounts, nearby_competitors: nearbyCompetitors } = prediction.site_detail;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">Report</h3>
        <button
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
          onClick={() => downloadPdfReport(prediction)}
          type="button"
        >
          Download PDF
        </button>
      </div>

      <section className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Executive summary</p>
        <div className="mt-2 flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${resultBadgeClasses(prediction.predicted_label)}`}
          >
            {prediction.predicted_label}
          </span>
          <span className="text-xs text-gray-400">{Math.round(prediction.confidence * 100)}% confidence</span>
        </div>
        <p className={`mt-2 text-sm font-semibold ${accent.text}`}>{generateRecommendation(prediction)}</p>
        <p className="mt-1 text-sm leading-6 text-gray-600">{prediction.explanation.summary}</p>
      </section>

      <section className="mt-5 border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Location snapshot</p>
        <p className="mt-2 text-sm text-gray-600">
          {prediction.area_information.search_area} · {Math.round(
            prediction.area_information.distance_from_area_center_m,
          )} m from area center
        </p>
        <p className="mt-1 text-xs text-gray-400">
          {prediction.latitude.toFixed(5)}, {prediction.longitude.toFixed(5)} · 500 m site radius within a 1,500 m
          supported boundary
        </p>
      </section>

      <section className="mt-5 border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Factor breakdown</p>
        <div className="mt-3 space-y-3">
          {COMPARISON_FACTORS.map((factor) => {
            const rawValue = Number(prediction.collected_features[factor.key]) || 0;
            const value = Math.max(0, Math.min(1, rawValue));
            const shapFactor = prediction.explanation.factors.find((item) => item.feature === factor.key);
            return (
              <div key={factor.key}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-gray-800">{factor.label}</span>
                  <span className="text-xs text-gray-500">{(value * 100).toFixed(0)}/100</span>
                </div>
                {shapFactor && (
                  <p className="mt-1 text-xs leading-5 text-gray-600">
                    <span className="font-semibold text-gray-700">{verdictBandLabel(shapFactor)}</span>
                    {" — "}
                    {factorVerdictDetail(shapFactor, rawCounts)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-5 border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Competitor landscape</p>
        {nearbyCompetitors.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No existing competitors were found within 500 m.</p>
        ) : (
          <ol className="mt-2 space-y-1.5">
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
      </section>

      <section className="mt-5 border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Recommendations</p>
        <p className="mt-2 text-sm leading-6 text-gray-700">{generateRecommendation(prediction)}</p>
      </section>

      <details className="mt-5 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-500">
          Methodology appendix — advanced / technical
        </summary>
        <div className="mt-3 space-y-3">
          {prediction.explanation.factors.map((factor, index) => (
            <div key={factor.feature}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-700">
                  {index + 1}. {readableFeatureName(factor.feature)}
                </span>
                <span
                  className={
                    factor.direction === "supports"
                      ? "font-semibold text-emerald-600"
                      : "font-semibold text-amber-600"
                  }
                >
                  {factor.strength} {factor.direction}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-gray-500">{factor.description}</p>
            </div>
          ))}
          <p className="text-[11px] leading-5 text-gray-400">
            SHAP values show how each factor moved the model toward or away from the predicted feasibility class,
            relative to the other factors for this specific prediction.
          </p>
        </div>
      </details>
    </div>
  );
}
