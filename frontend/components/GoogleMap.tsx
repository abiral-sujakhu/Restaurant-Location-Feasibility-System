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

              <h4 className="mt-5 font-semibold">Probabilities</h4>
              <p className="mt-1 text-sm text-gray-600">
                Confidence: {(prediction.confidence * 100).toFixed(1)}%
              </p>
              <div className="mt-2 space-y-2">
                {Object.entries(prediction.probabilities).map(([label, value]) => (
                  <div className="flex justify-between text-sm" key={label}>
                    <span>{label}</span>
                    <span className="font-semibold">{(value * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>

              <details className="mt-5">
                <summary className="cursor-pointer font-semibold">
                  Estimated model factors
                </summary>
                <dl className="mt-3 space-y-2 text-sm">
                  {Object.entries(prediction.collected_features).map(
                    ([name, value]) => (
                      <div className="flex justify-between gap-4" key={name}>
                        <dt className="capitalize text-gray-600">
                          {readableFeatureName(name)}
                        </dt>
                        <dd className="font-medium">{value}</dd>
                      </div>
                    ),
                  )}
                </dl>
              </details>
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
