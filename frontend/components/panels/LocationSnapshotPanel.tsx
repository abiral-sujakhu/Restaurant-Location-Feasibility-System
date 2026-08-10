"use client";

import type { MapLayerId, PredictionResponse } from "@/components/types";

const LAYER_OPTIONS: Array<{ id: MapLayerId; label: string; description: string; swatch: string }> = [
  {
    id: "demand",
    label: "Demand",
    description: "Pins for nearby anchor, daytime, and commercial destinations.",
    swatch: "bg-blue-500",
  },
  {
    id: "accessibility",
    label: "Accessibility",
    description: "Pins for nearby bus stops, parking spaces, and road intersections.",
    swatch: "bg-emerald-500",
  },
  {
    id: "competition",
    label: "Competition",
    description: "Pins for nearby competitor restaurants.",
    swatch: "bg-orange-500",
  },
  {
    id: "population",
    label: "Population",
    description: "Pins for mapped buildings, used as a population-density proxy.",
    swatch: "bg-purple-500",
  },
];

function layerPointCount(prediction: PredictionResponse, layer: MapLayerId): number {
  const layers = prediction.site_detail.map_layers;
  switch (layer) {
    case "demand":
      return layers.demand_points.length;
    case "accessibility":
      return layers.accessibility_points.length;
    case "competition":
      return layers.competition_points.length;
    case "population":
      return layers.population_points.length;
    default:
      return 0;
  }
}

type LocationSnapshotPanelProps = {
  prediction: PredictionResponse | null;
  activeMapLayer: MapLayerId | null;
  onSelectLayer: (layer: MapLayerId | null) => void;
};

export default function LocationSnapshotPanel({
  prediction,
  activeMapLayer,
  onSelectLayer,
}: LocationSnapshotPanelProps) {
  return (
    <div>
      <h3 className="text-lg font-semibold">Location snapshot</h3>
      <p className="mt-1 text-sm text-gray-500">
        Toggle a layer to see it drawn directly on the map, without losing your spatial context.
      </p>

      {!prediction && (
        <p className="mt-3 text-sm leading-6 text-gray-500">
          Analyze a location to unlock its Demand, Accessibility, Competition, and Population layers.
        </p>
      )}

      <div className="mt-4 space-y-2">
        {LAYER_OPTIONS.map((option) => {
          const isActive = activeMapLayer === option.id;
          const pointCount = prediction ? layerPointCount(prediction, option.id) : 0;
          return (
            <button
              className={`w-full rounded-xl border p-3 text-left transition ${
                isActive ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"
              } ${!prediction ? "cursor-not-allowed opacity-50" : ""}`}
              disabled={!prediction}
              key={option.id}
              onClick={() => onSelectLayer(isActive ? null : option.id)}
              type="button"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <span className={`h-2.5 w-2.5 rounded-full ${option.swatch}`} />
                  {option.label}
                </span>
                {prediction && <span className="text-xs text-gray-400">{pointCount} points</span>}
              </div>
              <p className="mt-1 text-xs leading-5 text-gray-500">{option.description}</p>
            </button>
          );
        })}
      </div>

      {activeMapLayer && (
        <button
          className="mt-3 text-xs font-semibold text-gray-500 hover:text-gray-700"
          onClick={() => onSelectLayer(null)}
          type="button"
        >
          Clear layer
        </button>
      )}
    </div>
  );
}
