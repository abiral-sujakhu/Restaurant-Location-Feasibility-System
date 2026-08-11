"use client";

import { COMPARISON_FACTORS, type SavedPrediction } from "@/components/types";
import {
  factorComparisonSentence,
  factorValue,
  generateComparisonSummary,
  generateRawCountRows,
} from "@/lib/insights";
import { resultBadgeClasses } from "@/lib/utils";

type ComparisonPanelProps = {
  history: SavedPrediction[];
  compareIds: string[];
  comparedPredictions: SavedPrediction[];
  onToggleComparison: (id: string) => void;
  onClearComparison: () => void;
  onRemove: (id: string) => void;
};

export default function ComparisonPanel({
  history,
  compareIds,
  comparedPredictions,
  onToggleComparison,
  onClearComparison,
  onRemove,
}: ComparisonPanelProps) {
  const summary = comparedPredictions.length > 1 ? generateComparisonSummary(comparedPredictions) : null;
  const rawCountRows = comparedPredictions.length > 0 ? generateRawCountRows(comparedPredictions) : [];

  return (
    <div>
      <h3 className="text-4xl font-semibold text-gray-900">Comparison</h3>
      <p className="mt-1 text-sm text-gray-500">
        Select 2–3 saved locations to compare their site-condition scores side by side.
      </p>

      {history.length === 0 ? (
        <p className="mt-3 text-sm leading-6 text-gray-500">
          Save a location from the Dashboard first, then come back here to compare it against others.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {history.map((entry) => {
            const isCompared = compareIds.includes(entry.id);
            return (
              <div
                className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 text-sm transition ${
                  isCompared ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
                key={entry.id}
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                  <input
                    checked={isCompared}
                    className="h-4 w-4 shrink-0 accent-blue-600"
                    disabled={!isCompared && compareIds.length >= 3}
                    onChange={() => onToggleComparison(entry.id)}
                    type="checkbox"
                  />
                  <span className="truncate font-medium text-gray-800">{entry.name}</span>
                </label>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${resultBadgeClasses(entry.prediction.predicted_label)}`}
                >
                  {entry.prediction.predicted_label}
                </span>
                <button
                  aria-label={`Delete ${entry.name}`}
                  className="shrink-0 rounded-md p-1.5 text-red-500 transition hover:bg-red-50 hover:text-red-700"
                  onClick={() => onRemove(entry.id)}
                  title="Delete"
                  type="button"
                >
                  <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M5 7h14" strokeLinecap="round" />
                    <path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M7 7l1 13a1 1 0 001 1h6a1 1 0 001-1l1-13" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {comparedPredictions.length > 0 && (
        <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-gray-900">Site comparison</h4>
            <button
              className="shrink-0 text-xs font-semibold text-gray-500 hover:text-gray-700"
              onClick={onClearComparison}
              type="button"
            >
              Clear
            </button>
          </div>

          {summary && (
            <p className="mt-3 rounded-lg bg-blue-50 p-2.5 text-xs leading-5 text-blue-900">{summary}</p>
          )}

          <p className="mt-3 text-xs leading-5 text-gray-400">
            Site-condition indices use a 0–100 scale. Higher is more favorable; these are not probabilities.
          </p>

          <div className="mt-4 space-y-5">
            {COMPARISON_FACTORS.map((factor) => {
              const highestValue = Math.max(
                ...comparedPredictions.map((entry) => factorValue(entry, factor.key)),
              );
              const ranked = [...comparedPredictions].sort(
                (a, b) => factorValue(b, factor.key) - factorValue(a, factor.key),
              );
              const pointDifference =
                (factorValue(ranked[0], factor.key) - factorValue(ranked.at(-1)!, factor.key)) * 100;

              return (
                <div key={factor.key}>
                  <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{factor.label}</h5>
                  <div className="mt-2 space-y-2">
                    {comparedPredictions.map((entry) => {
                      const value = factorValue(entry, factor.key);
                      const isLeader = value === highestValue;
                      return (
                        <div key={entry.id}>
                          <div className="flex justify-between gap-3 text-xs">
                            <span className={isLeader ? "font-semibold text-gray-900" : "truncate text-gray-500"}>
                              {entry.name}
                            </span>
                            <span className={isLeader ? "font-bold text-emerald-600" : "text-gray-500"}>
                              {(value * 100).toFixed(0)} / 100
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-200">
                            <div
                              className={isLeader ? "h-full rounded-full bg-emerald-500" : "h-full rounded-full bg-blue-400"}
                              style={{ width: `${Math.max(3, Math.min(100, value * 100))}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {comparedPredictions.length > 1 && (
                    <p className="mt-2 text-xs leading-5 text-gray-500">
                      {factorComparisonSentence(factor.key, ranked[0].name, pointDifference)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {rawCountRows.length > 0 && (
            <div className="mt-5 border-t border-gray-200 pt-4">
              <h5 className="text-sm font-semibold text-gray-900">Raw counts</h5>
              <p className="mt-1 text-xs text-gray-500">
                The underlying numbers behind each score, side by side.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[280px] text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-400">
                      <th className="py-1.5 pr-2 text-left font-medium">Count</th>
                      {comparedPredictions.map((entry) => (
                        <th className="px-2 py-1.5 text-right font-medium" key={entry.id}>
                          <span className="block max-w-[100px] truncate" title={entry.name}>
                            {entry.name}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rawCountRows.map((row) => (
                      <tr className="border-b border-gray-100 last:border-0" key={row.label}>
                        <td className="py-1.5 pr-2 text-gray-600">{row.label}</td>
                        {row.values.map((value, index) => (
                          <td
                            className="px-2 py-1.5 text-right font-semibold text-gray-900"
                            key={comparedPredictions[index].id}
                          >
                            {value}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
