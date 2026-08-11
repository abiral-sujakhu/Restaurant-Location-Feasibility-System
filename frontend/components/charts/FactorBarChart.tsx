export type BarDatum = { key: string; label: string; count: number; typical: number | null };

/** Horizontal bars sorted descending by count, with the raw number printed at the bar's end and
 *  a reference tick at the typical-for-this-area value when one is available. Flex-based layout
 *  (no fixed pixel widths) so it stays readable at mobile widths. Shared by Factor breakdown and
 *  the Report's factor sections. */
export default function FactorBarChart({ data, color }: { data: BarDatum[]; color: string }) {
  const sorted = [...data].sort((a, b) => b.count - a.count);
  const maxScale = Math.max(1, ...sorted.map((datum) => datum.count), ...sorted.map((datum) => datum.typical ?? 0));

  return (
    <div className="mt-3 space-y-2.5">
      {sorted.map((datum) => {
        const barPct = Math.min(100, (datum.count / maxScale) * 100);
        const typicalPct = datum.typical !== null ? Math.min(100, (datum.typical / maxScale) * 100) : null;
        return (
          <div key={datum.key}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-gray-600">{datum.label}</span>
              <span className="shrink-0">
                <span className="font-semibold text-gray-900">{datum.count}</span>
                {datum.typical !== null && (
                  <span className="text-gray-400"> — typical for this area: {datum.typical}</span>
                )}
              </span>
            </div>
            <div
              className="relative mt-1 h-2.5 w-full rounded-full bg-gray-200"
              title={`${datum.label}: ${datum.count}${datum.typical !== null ? ` (typical: ${datum.typical})` : ""}`}
            >
              <div
                className="h-full rounded-full"
                style={{ backgroundColor: color, width: `${Math.max(datum.count > 0 ? 3 : 0, barPct)}%` }}
              />
              {typicalPct !== null && (
                <div
                  aria-hidden="true"
                  className="absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-700"
                  style={{ left: `${typicalPct}%` }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
