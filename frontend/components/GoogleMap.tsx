"use client";

import { useState } from "react";
import { GoogleMap, LoadScript, Marker } from "@react-google-maps/api";

const defaultCenter = {
  lat: 27.7172,
  lng: 85.324,
};

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type PredictionResponse = {
  latitude: number;
  longitude: number;
  area_information: {
    search_area: string;
    distance_from_area_center_m: number;
    maximum_allowed_distance_m: number;
  };
  predicted_class: number | string;
  predicted_label: string;
  confidence: number;
  probabilities: Record<string, number>;
  explanation: {
    explained_label: string;
    summary: string;
    factors: Array<{
      feature: string;
      direction: "supports" | "opposes";
      strength: string;
      impact: number;
      relative_impact: number;
      description: string;
    }>;
  };
  collected_features: Record<string, number | string>;
};

function readableFeatureName(name: string) {
  return name.replaceAll("_", " ");
}

export default function GoogleMapComponent() {
  const [markerPosition, setMarkerPosition] =
    useState<google.maps.LatLngLiteral | null>(null);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMapClick = (event: google.maps.MapMouseEvent) => {
    if (!event.latLng) return;

    setMarkerPosition({
      lat: event.latLng.lat(),
      lng: event.latLng.lng(),
    });
    setPrediction(null);
    setError(null);
  };

  const analyzeLocation = async () => {
    if (!markerPosition) return;

    setIsLoading(true);
    setError(null);
    setPrediction(null);

    try {
      const response = await fetch(`${apiBaseUrl}/predict-location`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          latitude: markerPosition.lat,
          longitude: markerPosition.lng,
        }),
      });

      const data: PredictionResponse | { detail?: string } = await response.json();

      if (!response.ok) {
        throw new Error(
          "detail" in data && data.detail
            ? data.detail
            : `Prediction request failed (${response.status}).`,
        );
      }

      setPrediction(data as PredictionResponse);
    } catch (requestError) {
      setError(
        requestError instanceof TypeError
          ? "Could not reach the backend. Make sure it is running on port 8000."
          : requestError instanceof Error
            ? requestError.message
            : "Unable to analyze this location.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <LoadScript googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
      <div className="flex h-full min-h-0 flex-col gap-5 overflow-hidden bg-gray-100 p-5 lg:flex-row">
        <aside className="w-full overflow-y-auto rounded-2xl bg-white p-6 text-black shadow-lg lg:w-96 lg:shrink-0">
          <h2 className="mb-6 text-2xl font-semibold">Selected Location</h2>

          {markerPosition ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-bold text-blue-600">Latitude</p>
                  <p className="font-medium">{markerPosition.lat.toFixed(6)}</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-blue-600">Longitude</p>
                  <p className="font-medium">{markerPosition.lng.toFixed(6)}</p>
                </div>
              </div>

              <button
                className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                disabled={isLoading}
                onClick={analyzeLocation}
                type="button"
              >
                {isLoading ? "Analyzing..." : "Analyze location"}
              </button>
            </>
          ) : (
            <p className="text-gray-500">
              Click anywhere on the map to select a location.
            </p>
          )}

          {error && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {prediction && (
            <section className="mt-6 border-t border-gray-200 pt-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Feasibility result
              </p>
              <h3 className="mt-1 text-3xl font-bold text-blue-700">
                {prediction.predicted_label}
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Area: {prediction.area_information.search_area} · {Math.round(
                  prediction.area_information.distance_from_area_center_m,
                )} m from center
              </p>

              <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
                <h4 className="font-semibold text-blue-950">Why this result?</h4>
                <p className="mt-2 text-sm leading-6 text-blue-900">
                  {prediction.explanation.summary}
                </p>
                <div className="mt-4 space-y-3">
                  {prediction.explanation.factors.slice(0, 4).map((factor) => (
                    <div key={factor.feature}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="capitalize text-gray-700">
                          {readableFeatureName(factor.feature)}
                        </span>
                        <span className={factor.direction === "supports" ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
                          {factor.strength} {factor.direction}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-200">
                        <div
                          className={factor.direction === "supports" ? "h-full rounded-full bg-emerald-500" : "h-full rounded-full bg-amber-500"}
                          style={{ width: `${Math.max(8, factor.relative_impact * 100)}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs leading-5 text-gray-600">
                        {factor.description}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs leading-5 text-gray-500">
                  SHAP shows how each factor moved the model toward or away from
                  the predicted feasibility class.
                </p>
              </div>
            </section>
          )}
        </aside>

        <div className="min-h-80 flex-1 overflow-hidden rounded-2xl shadow-lg">
          <GoogleMap
            center={defaultCenter}
            mapContainerStyle={{ width: "100%", height: "100%" }}
            onClick={handleMapClick}
            zoom={13}
          >
            {markerPosition && <Marker position={markerPosition} />}
          </GoogleMap>
        </div>
      </div>
    </LoadScript>
  );
}
