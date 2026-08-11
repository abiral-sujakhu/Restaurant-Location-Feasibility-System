import type { FactorKey } from "@/components/types";
import { type ScoreBand, percentileLabel, verdictWord } from "@/lib/insights";

const GAUGE_RADIUS = 38;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

export type FactorGaugeProps = {
  factorKey: FactorKey;
  label: string;
  value: number;
  mean: number | null;
  band: ScoreBand;
  percentile: number | null;
  color: string;
  rawCountLabel?: string;
};

/**
 * Donut gauge with a benchmark tick at the area average, a plain-English verdict word, and the
 * percentile line -- the shared visual used by Dashboard's "at-a-glance" grid and the Report's
 * at-a-glance section, so the two never drift out of sync.
 */
export default function FactorGauge({
  factorKey,
  label,
  value,
  mean,
  band,
  percentile,
  color,
  rawCountLabel,
}: FactorGaugeProps) {
  const clampedValue = Math.max(0, Math.min(1, value));
  const clampedMean = mean !== null ? Math.max(0, Math.min(1, mean)) : null;
  const tickAngle = clampedMean !== null ? clampedMean * 360 : null;
  const tickInner = tickAngle !== null ? polarToCartesian(48, 48, GAUGE_RADIUS - 6, tickAngle) : null;
  const tickOuter = tickAngle !== null ? polarToCartesian(48, 48, GAUGE_RADIUS + 6, tickAngle) : null;
  const scoreOutOf100 = (clampedValue * 100).toFixed(0);

  return (
    <div className="flex flex-col items-center rounded-xl border border-gray-100 bg-white py-4 shadow-sm">
      <svg
        aria-label={`${label} ${scoreOutOf100} out of 100`}
        className="h-28 w-28"
        role="img"
        viewBox="0 0 96 96"
      >
        <title>
          {label}: {scoreOutOf100}/100{mean !== null ? ` (typical for this area: ${(mean * 100).toFixed(0)})` : ""}
        </title>
        <circle cx="48" cy="48" fill="none" r={GAUGE_RADIUS} stroke="#e5e7eb" strokeWidth="9" />
        <circle
          cx="48"
          cy="48"
          fill="none"
          r={GAUGE_RADIUS}
          stroke={color}
          strokeDasharray={GAUGE_CIRCUMFERENCE}
          strokeDashoffset={GAUGE_CIRCUMFERENCE * (1 - clampedValue)}
          strokeLinecap="round"
          strokeWidth="9"
          transform="rotate(-90 48 48)"
        />
        {tickInner && tickOuter && (
          <line
            stroke="#111827"
            strokeLinecap="round"
            strokeWidth="2"
            x1={tickInner.x}
            x2={tickOuter.x}
            y1={tickInner.y}
            y2={tickOuter.y}
          />
        )}
        <text fontSize="16" fontWeight="700" textAnchor="middle" x="48" y="53" fill="#111827">
          {scoreOutOf100}
        </text>
      </svg>
      <span className="text-[11px] font-semibold" style={{ color }}>
        {verdictWord(factorKey, band)}
      </span>
      <span className="mt-1 text-sm font-medium text-gray-500">{label}</span>
      {mean !== null && (
        <span className="mt-1 text-[11px] text-gray-400">
          {scoreOutOf100}/100 — avg {(mean * 100).toFixed(0)}
        </span>
      )}
      {percentile !== null && (
        <span className="mt-0.5 px-1 text-center text-[10px] leading-tight text-gray-400">
          {percentileLabel(percentile)}
        </span>
      )}
      {rawCountLabel && <span className="mt-1 text-[11px] text-gray-400">{rawCountLabel}</span>}
    </div>
  );
}
