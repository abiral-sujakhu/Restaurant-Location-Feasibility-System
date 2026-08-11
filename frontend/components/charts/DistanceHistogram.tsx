import type { DistanceBucket } from "@/components/types";

/** Competitor-distance histogram, 100 m buckets -- shared by Factor breakdown and the Report's
 *  competitor landscape section. */
export default function DistanceHistogram({ buckets, color }: { buckets: DistanceBucket[]; color: string }) {
  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return (
    <div className="space-y-2">
      {buckets.map((bucket) => {
        const pct = (bucket.count / maxCount) * 100;
        return (
          <div key={bucket.start_m}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-gray-600">
                {Math.round(bucket.start_m)}–{Math.round(bucket.end_m)} m
              </span>
              <span className="font-semibold text-gray-900">{bucket.count}</span>
            </div>
            <div
              className="mt-1 h-2.5 w-full rounded-full bg-gray-200"
              title={`${Math.round(bucket.start_m)}-${Math.round(bucket.end_m)} m: ${bucket.count} competitors`}
            >
              <div
                className="h-full rounded-full"
                style={{ backgroundColor: color, width: `${Math.max(bucket.count > 0 ? 3 : 0, pct)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
