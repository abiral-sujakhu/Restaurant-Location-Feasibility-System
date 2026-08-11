"use client";

import { COMPARISON_FACTORS, type SavedPrediction } from "@/components/types";

type ComparisonInsight = {
  factor: string;
  leader: string;
  difference: number;
};

type ComparisonPanelProps = {
  history: SavedPrediction[];
  compareIds: string[];
  comparedPredictions: SavedPrediction[];
  comparisonInsights: ComparisonInsight[];
  comparisonStrength: (difference: number) => string;
  factorValue: (entry: SavedPrediction, factor: string) => number;
  onToggleComparison: (id: string) => void;
  onClearComparison: () => void;
};

export default function ComparisonPanel({
  history,
  compareIds,
  comparedPredictions,
  comparisonInsights,
  comparisonStrength,
  factorValue,
  onToggleComparison,
  onClearComparison,
}: ComparisonPanelProps) {
  return (
    <div>
      <h3 className="text-lg font-semibold">Comparison</h3>
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
              <label
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border p-2.5 text-sm transition ${
                  isCompared ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
                key={entry.id}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <input
                    checked={isCompared}
                    className="h-4 w-4 shrink-0 accent-blue-600"
                    disabled={!isCompared && compareIds.length >= 3}
                    onChange={() => onToggleComparison(entry.id)}
                    type="checkbox"
                  />
                  <span className="truncate font-medium text-gray-800">{entry.name}</span>
                </span>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                  {entry.prediction.predicted_label}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {comparedPredictions.length > 0 && (
        <div className="mt-5 rounded-xl bg-slate-900 p-4 text-white">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Site comparison</h4>
            <button className="text-xs text-slate-300 hover:text-white" onClick={onClearComparison} type="button">
              Clear
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Site-condition indices use a 0–100 scale. Higher is more favorable; these are not probabilities.
          </p>

          <div className="mt-4 space-y-5">
            {COMPARISON_FACTORS.map((factor) => {
              const highestValue = Math.max(
                ...comparedPredictions.map((entry) => factorValue(entry, factor.key)),
              );
              return (
                <div key={factor.key}>
                  <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-300">{factor.label}</h5>
                  <div className="mt-2 space-y-2">
                    {comparedPredictions.map((entry) => {
                      const value = factorValue(entry, factor.key);
                      const isLeader = value === highestValue;
                      return (
                        <div key={entry.id}>
                          <div className="flex justify-between gap-3 text-xs">
                            <span className={isLeader ? "font-semibold text-white" : "truncate text-slate-300"}>
                              {entry.name}
                              {isLeader && comparedPredictions.length > 1 ? " · best" : ""}
                            </span>
                            <span className={isLeader ? "font-bold text-emerald-300" : "text-slate-300"}>
                              {(value * 100).toFixed(1)} / 100
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-700">
                            <div
                              className={isLeader ? "h-full rounded-full bg-emerald-400" : "h-full rounded-full bg-blue-400"}
                              style={{ width: `${Math.max(3, Math.min(100, value * 100))}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 border-t border-slate-700 pt-4">
            <h5 className="text-sm font-semibold">Comparison insights</h5>
            {comparisonInsights.length < 1 ? (
              <p className="mt-2 text-xs leading-5 text-slate-300">
                Add at least one more site to generate comparative insights.
              </p>
            ) : (
              <ul className="mt-2 space-y-2 text-xs leading-5 text-slate-300">
                {comparisonInsights.map((insight) => (
                  <li key={insight.factor}>
                    <span className="font-semibold text-white">{insight.leader}</span>{" "}
                    {comparisonStrength(insight.difference)} {insight.factor.toLowerCase()}
                    {insight.difference > 0
                      ? ` (+${(insight.difference * 100).toFixed(1)} index points).`
                      : "; the sites have the same index."}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
