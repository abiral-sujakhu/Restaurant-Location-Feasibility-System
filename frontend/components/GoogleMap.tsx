"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CircleF, GoogleMap, LoadScript, Marker, MarkerF } from "@react-google-maps/api";
import {
  COMPARISON_FACTORS,
  type MapLayerId,
  type PanelId,
  type PredictionResponse,
  type SavedPrediction,
  type StudyArea,
  type StudyAreasResponse,
} from "@/components/types";
import { downloadPdfReport } from "@/lib/reportGeneration";
import { bearingDegrees, distanceInMeters, offsetLatLng } from "@/lib/utils";
import DashboardPanel from "@/components/panels/DashboardPanel";
import FactorBreakdownPanel from "@/components/panels/FactorBreakdownPanel";
import LocationSnapshotPanel from "@/components/panels/LocationSnapshotPanel";
import ComparisonPanel from "@/components/panels/ComparisonPanel";
import ReportPanel from "@/components/panels/ReportPanel";

const defaultCenter = {
  lat: 27.7172,
  lng: 85.324,
};

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

const FEATURE_RADIUS_M = 500;
const DEFAULT_SUPPORTED_RADIUS_M = 1500;
const HISTORY_KEY = "yogya-site-prediction-history";

// Sub-zones within a selected area's boundary circle -- purely computed
// offsets from the area center, not tied to any named locality data. Lets
// someone narrow in on a corner of the circle instead of scanning the
// whole thing. Offsets are a fraction of the area's own supported radius
// so every zone stays inside the boundary regardless of which area (they
// don't all share the same radius) is selected.
const SUB_ZONE_DIRECTIONS = [
  { label: "Center", northFraction: 0, eastFraction: 0 },
  { label: "North", northFraction: 1, eastFraction: 0 },
  { label: "Northeast", northFraction: 0.71, eastFraction: 0.71 },
  { label: "East", northFraction: 0, eastFraction: 1 },
  { label: "Southeast", northFraction: -0.71, eastFraction: 0.71 },
  { label: "South", northFraction: -1, eastFraction: 0 },
  { label: "Southwest", northFraction: -0.71, eastFraction: -0.71 },
  { label: "West", northFraction: 0, eastFraction: -1 },
  { label: "Northwest", northFraction: 0.71, eastFraction: -0.71 },
] as const;
const SUB_ZONE_RADIUS_FRACTION = 0.6;
const SUB_ZONE_ZOOM = 17;

const featureRadiusOptions: google.maps.CircleOptions = {
  clickable: false,
  fillColor: "#2563eb",
  fillOpacity: 0.12,
  strokeColor: "#2563eb",
  strokeOpacity: 0.8,
  strokeWeight: 2,
};

const supportedAreaOptions: google.maps.CircleOptions = {
  clickable: false,
  fillColor: "#facc15",
  fillOpacity: 0.1,
  strokeColor: "#eab308",
  strokeOpacity: 0.95,
  strokeWeight: 2.5,
};

const areaCenterOptions: google.maps.CircleOptions = {
  clickable: false,
  fillColor: "#047857",
  fillOpacity: 1,
  strokeColor: "#ffffff",
  strokeOpacity: 1,
  strokeWeight: 2,
};

// Google discontinued the Maps JavaScript API's Heatmap Layer (visualization
// library) as of API v3.65, so every map layer -- including Demand and
// Population, which would otherwise be heatmaps -- renders as discrete pins.
const DEMAND_MARKER_ICON = {
  path: 0, // google.maps.SymbolPath.CIRCLE, resolved at runtime once the API is loaded
  scale: 3.5,
  fillColor: "#2563eb",
  fillOpacity: 0.85,
  strokeWeight: 0,
};

const POPULATION_MARKER_ICON = {
  path: 0,
  scale: 3,
  fillColor: "#7c3aed",
  fillOpacity: 0.75,
  strokeWeight: 0,
};

const ACCESSIBILITY_MARKER_ICON = {
  path: 0,
  scale: 4,
  fillColor: "#059669",
  fillOpacity: 0.9,
  strokeWeight: 0,
};

const COMPETITION_MARKER_ICON = {
  path: 0,
  scale: 5,
  fillColor: "#ea580c",
  fillOpacity: 0.95,
  strokeWeight: 1,
  strokeColor: "#ffffff",
};

const NAV_ITEMS: Array<{ id: PanelId; label: string; icon: ReactNode }> = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <rect height="8" rx="1.5" width="8" x="3" y="3" />
        <rect height="4" rx="1.5" width="8" x="13" y="3" />
        <rect height="4" rx="1.5" width="8" x="3" y="15" />
        <rect height="8" rx="1.5" width="8" x="13" y="9" />
      </svg>
    ),
  },
  {
    id: "factors",
    label: "Factor breakdown",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <rect height="8" rx="1" width="4" x="4" y="12" />
        <rect height="13" rx="1" width="4" x="10" y="7" />
        <rect height="17" rx="1" width="4" x="16" y="3" />
      </svg>
    ),
  },
  {
    id: "snapshot",
    label: "Location snapshot",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M12 21s7-7.58 7-12a7 7 0 10-14 0c0 4.42 7 12 7 12z" strokeLinejoin="round" />
        <circle cx="12" cy="9" r="2.3" />
      </svg>
    ),
  },
  {
    id: "comparison",
    label: "Comparison",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <rect height="16" rx="1.5" width="7" x="4" y="4" />
        <rect height="16" rx="1.5" width="7" x="13" y="4" />
      </svg>
    ),
  },
  {
    id: "report",
    label: "Report",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M7 3h7l4 4v14H7z" strokeLinejoin="round" />
        <path d="M14 3v4h4" strokeLinejoin="round" />
        <path d="M9.5 12h6M9.5 15.5h6M9.5 8.5h2" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function GoogleMapComponent() {
  const [markerPosition, setMarkerPosition] =
    useState<google.maps.LatLngLiteral | null>(null);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SavedPrediction[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [studyAreas, setStudyAreas] = useState<StudyArea[]>([]);
  const [selectedAreaName, setSelectedAreaName] = useState<string | null>(null);
  const [selectedSubZone, setSelectedSubZone] = useState<string | null>(null);
  const [maximumAreaDistanceM, setMaximumAreaDistanceM] = useState(
    DEFAULT_SUPPORTED_RADIUS_M,
  );
  const [areasError, setAreasError] = useState<string | null>(null);
  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);
  const [activeMapLayer, setActiveMapLayer] = useState<MapLayerId | null>(null);

  useEffect(() => {
    try {
      const storedHistory = localStorage.getItem(HISTORY_KEY);
      // History is browser-only data and must be loaded after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (storedHistory) setHistory(JSON.parse(storedHistory));
    } catch {
      localStorage.removeItem(HISTORY_KEY);
    }
  }, []);

  useEffect(() => {
    fetch(apiBaseUrl + "/study-areas")
      .then((response) => response.json() as Promise<StudyAreasResponse>)
      .then((data) => {
        setStudyAreas(data.study_areas);
        setMaximumAreaDistanceM(data.maximum_allowed_distance_m);
        setAreasError(null);
      })
      .catch(() =>
        setAreasError("Supported-area boundaries could not be loaded."),
      );
  }, []);

  const updateHistory = (nextHistory: SavedPrediction[]) => {
    setHistory(nextHistory);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
  };

  const selectPosition = (selectedPosition: google.maps.LatLngLiteral) => {
    const isSupported = studyAreas.some(
      (area) =>
        distanceInMeters(selectedPosition, {
          lat: area.latitude,
          lng: area.longitude,
        }) <= maximumAreaDistanceM,
    );

    if (studyAreas.length > 0 && !isSupported) {
      setError(
        "That point is outside the supported areas. Select a location inside a yellow boundary.",
      );
      return;
    }

    setMarkerPosition(selectedPosition);
    setPrediction(null);
    setActiveMapLayer(null);
    setError(null);
  };

  const handleMapClick = (event: google.maps.MapMouseEvent) => {
    if (!event.latLng) return;
    selectPosition({ lat: event.latLng.lat(), lng: event.latLng.lng() });
  };

  const focusStudyArea = (areaName: string) => {
    const area = studyAreas.find((candidate) => candidate.name === areaName);
    if (!area || !map) return;
    setSelectedAreaName(areaName);
    setSelectedSubZone(null);
    map.panTo({ lat: area.latitude, lng: area.longitude });
    map.setZoom(15);
  };

  const focusSubZone = (directionLabel: string) => {
    const area = studyAreas.find((candidate) => candidate.name === selectedAreaName);
    const direction = SUB_ZONE_DIRECTIONS.find((candidate) => candidate.label === directionLabel);
    if (!area || !direction || !map) return;

    setSelectedSubZone(directionLabel);
    const offsetDistanceM = maximumAreaDistanceM * SUB_ZONE_RADIUS_FRACTION;
    const target = offsetLatLng(
      { lat: area.latitude, lng: area.longitude },
      direction.northFraction * offsetDistanceM,
      direction.eastFraction * offsetDistanceM,
    );
    map.panTo(target);
    map.setZoom(SUB_ZONE_ZOOM);
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
      setActivePanel("dashboard");
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

  const visitLocationInStreetView = () => {
    if (!markerPosition || !map) return;

    const streetViewService = new google.maps.StreetViewService();
    streetViewService.getPanorama(
      { location: markerPosition, radius: 75 },
      (data, status) => {
        if (status !== google.maps.StreetViewStatus.OK || !data?.location?.latLng) {
          setError("Street View imagery isn't available near this location.");
          return;
        }

        const panoramaPosition = {
          lat: data.location.latLng.lat(),
          lng: data.location.latLng.lng(),
        };
        const panorama = map.getStreetView();
        panorama.setPosition(panoramaPosition);
        panorama.setPov({
          heading: bearingDegrees(panoramaPosition, markerPosition),
          pitch: 0,
        });
        panorama.setVisible(true);
        setError(null);
      },
    );
  };

  const savePrediction = () => {
    if (!markerPosition || !prediction) return;

    const entry: SavedPrediction = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: `${prediction.area_information.search_area} site`,
      savedAt: new Date().toISOString(),
      position: markerPosition,
      prediction,
    };
    updateHistory([entry, ...history]);
  };

  const toggleComparison = (id: string) => {
    setCompareIds((current) => {
      if (current.includes(id)) return current.filter((entryId) => entryId !== id);
      if (current.length >= 3) return current;
      return [...current, id];
    });
  };

  const comparedPredictions = compareIds
    .map((id) => history.find((entry) => entry.id === id))
    .filter((entry): entry is SavedPrediction => Boolean(entry));

  const factorValue = (entry: SavedPrediction, factor: string) => {
    const value = entry.prediction.collected_features[factor];
    return typeof value === "number" ? value : Number(value) || 0;
  };

  const comparisonInsights = comparedPredictions.length < 2
    ? []
    : COMPARISON_FACTORS.map((factor) => {
        const ranked = [...comparedPredictions].sort(
          (a, b) => factorValue(b, factor.key) - factorValue(a, factor.key),
        );
        const difference = factorValue(ranked[0], factor.key) - factorValue(ranked.at(-1)!, factor.key);
        return {
          factor: factor.label,
          leader: ranked[0].name,
          difference,
        };
      });

  const comparisonStrength = (difference: number) => {
    const indexPointDifference = difference * 100;
    if (indexPointDifference < 2) return "is very similar in";
    if (indexPointDifference < 5) return "is slightly stronger in";
    if (indexPointDifference < 10) return "is moderately stronger in";
    return "is notably stronger in";
  };

  const isSidebarOpen = activePanel !== null;
  const mapLayers = prediction?.site_detail.map_layers;

  return (
    <LoadScript googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
      <div className="flex h-full min-h-0 flex-row overflow-hidden bg-gray-100">
        <nav
          className={`flex shrink-0 flex-col border-r border-gray-200 bg-white py-6 transition-[width] duration-200 ${
            isNavExpanded ? "w-56 items-stretch px-3" : "w-16 items-center"
          }`}
        >
          <div
            className={`flex w-full items-center ${
              isNavExpanded ? "justify-between" : "justify-center"
            }`}
          >
            {isNavExpanded && (
              <span className="font-sans text-base font-extrabold tracking-tight text-gray-900">
                YogyaSite
              </span>
            )}

            <button
              aria-expanded={isNavExpanded}
              aria-label={isNavExpanded ? "Collapse sidebar" : "Expand sidebar"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              onClick={() => setIsNavExpanded((current) => !current)}
              title={isNavExpanded ? "Collapse sidebar" : "Expand sidebar"}
              type="button"
            >
              <svg
                aria-hidden="true"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <rect height="16" rx="1" width="9" x="4" y="4" />
                <circle cx="10.3" cy="12" fill="currentColor" r="0.9" stroke="none" />
                <path d="M14 5.5c2.4 1 3.2 2.8 3.2 6.5s-.8 5.5-3.2 6.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <div
            className={`mt-8 flex flex-col gap-5 rounded-2xl bg-gray-50 py-4 ${
              isNavExpanded ? "items-stretch px-3" : "items-center px-2.5"
            }`}
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activePanel === item.id;
              return (
                <button
                  aria-label={item.label}
                  aria-pressed={isActive}
                  className={`flex items-center rounded-xl transition ${
                    isNavExpanded ? "h-10 w-full gap-3 px-3" : "h-10 w-10 justify-center"
                  } ${
                    isActive
                      ? "bg-blue-200 text-blue-900"
                      : "text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                  }`}
                  key={item.id}
                  onClick={() => setActivePanel((current) => (current === item.id ? null : item.id))}
                  title={item.label}
                  type="button"
                >
                  {item.icon}
                  {isNavExpanded && (
                    <span className="whitespace-nowrap text-sm font-medium">{item.label}</span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {isSidebarOpen && (
        <aside className="w-full overflow-y-auto rounded-2xl bg-white p-7 text-black shadow-lg lg:w-1/4 lg:shrink-0">
          {activePanel === "dashboard" && <DashboardPanel onSave={savePrediction} prediction={prediction} />}
          {activePanel === "factors" && <FactorBreakdownPanel prediction={prediction} />}
          {activePanel === "snapshot" && (
            <LocationSnapshotPanel
              activeMapLayer={activeMapLayer}
              onSelectLayer={setActiveMapLayer}
              prediction={prediction}
            />
          )}
          {activePanel === "comparison" && (
            <ComparisonPanel
              compareIds={compareIds}
              comparedPredictions={comparedPredictions}
              comparisonInsights={comparisonInsights}
              comparisonStrength={comparisonStrength}
              factorValue={factorValue}
              history={history}
              onClearComparison={() => setCompareIds([])}
              onToggleComparison={toggleComparison}
            />
          )}
          {activePanel === "report" && <ReportPanel prediction={prediction} />}
        </aside>
        )}

        <div className="relative min-h-80 flex-1 overflow-hidden rounded-2xl shadow-lg">
          <div className="absolute top-4 right-4 z-10 w-[360px] rounded-2xl bg-white p-4 text-black shadow-lg">
            <h2 className="mb-4 text-lg font-semibold text-[#0b1e2b]">Choose Location</h2>

            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-semibold text-gray-700">
                Jump to a supported area
              </span>
              <select
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-100"
                defaultValue=""
                disabled={studyAreas.length === 0}
                onChange={(event) => focusStudyArea(event.target.value)}
              >
                <option disabled value="">
                  {studyAreas.length > 0 ? "Choose an area" : "Loading areas..."}
                </option>
                {studyAreas.map((area) => (
                  <option key={area.name} value={area.name}>
                    {area.name}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs leading-5 text-gray-500">
                Yellow circles show the {Math.round(maximumAreaDistanceM)} m supported boundary.
              </p>
            </label>

            {selectedAreaName && (
              <label className="mb-4 block">
                <span className="mb-2 block text-sm font-semibold text-gray-700">
                  Narrow down within {selectedAreaName}
                </span>
                <select
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-100"
                  onChange={(event) => focusSubZone(event.target.value)}
                  value={selectedSubZone ?? ""}
                >
                  <option disabled value="">
                    Choose a zone
                  </option>
                  {SUB_ZONE_DIRECTIONS.map((direction) => (
                    <option key={direction.label} value={direction.label}>
                      {selectedAreaName} - {direction.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs leading-5 text-gray-500">
                  Zooms into that part of {selectedAreaName} so you don&apos;t have to
                  search the whole boundary yourself.
                </p>
              </label>
            )}

            {areasError && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {areasError} Start the backend to enable selection validation.
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

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
                  className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                  onClick={visitLocationInStreetView}
                  type="button"
                >
                  Visit this location (Street View)
                </button>

                <button
                  className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                  disabled={isLoading}
                  onClick={analyzeLocation}
                  type="button"
                >
                  {isLoading ? "Analyzing..." : "Analyze location"}
                </button>

                {prediction && (
                  <button
                    className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    onClick={() => downloadPdfReport(prediction)}
                    type="button"
                  >
                    Download PDF report
                  </button>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">
                Click anywhere on the yellow circle to select a location.
              </p>
            )}
          </div>

          <GoogleMap
            center={defaultCenter}
            mapContainerStyle={{ width: "100%", height: "100%" }}
            onClick={handleMapClick}
            onLoad={(mapInstance) => {
              setMap(mapInstance);
              mapInstance.setOptions({
                fullscreenControlOptions: {
                  position: google.maps.ControlPosition.LEFT_BOTTOM,
                },
              });
            }}
            onUnmount={() => setMap(null)}
            zoom={13}
          >
            {(selectedAreaName
              ? studyAreas.filter((area) => area.name === selectedAreaName)
              : studyAreas
            ).flatMap((area) => {
              const center = { lat: area.latitude, lng: area.longitude };
              return [
                <CircleF
                  center={center}
                  key={`${area.name}-boundary`}
                  options={supportedAreaOptions}
                  radius={maximumAreaDistanceM}
                />,
                <CircleF
                  center={center}
                  key={`${area.name}-center`}
                  options={areaCenterOptions}
                  radius={35}
                />,
              ];
            })}
            {markerPosition && (
              <>
                <CircleF
                  center={markerPosition}
                  options={featureRadiusOptions}
                  radius={FEATURE_RADIUS_M}
                />
                <Marker position={markerPosition} />
              </>
            )}

            {mapLayers && activeMapLayer === "demand" &&
              mapLayers.demand_points.map((point, index) => (
                <MarkerF
                  icon={{ ...DEMAND_MARKER_ICON, path: google.maps.SymbolPath.CIRCLE }}
                  key={`demand-${index}`}
                  position={{ lat: point.latitude, lng: point.longitude }}
                  title={point.category ?? "Demand feature"}
                />
              ))}
            {mapLayers && activeMapLayer === "population" &&
              mapLayers.population_points.map((point, index) => (
                <MarkerF
                  icon={{ ...POPULATION_MARKER_ICON, path: google.maps.SymbolPath.CIRCLE }}
                  key={`population-${index}`}
                  position={{ lat: point.latitude, lng: point.longitude }}
                  title="Mapped building"
                />
              ))}
            {mapLayers && activeMapLayer === "accessibility" &&
              mapLayers.accessibility_points.map((point, index) => (
                <MarkerF
                  icon={{ ...ACCESSIBILITY_MARKER_ICON, path: google.maps.SymbolPath.CIRCLE }}
                  key={`accessibility-${index}`}
                  position={{ lat: point.latitude, lng: point.longitude }}
                  title={point.category ?? "Accessibility feature"}
                />
              ))}
            {mapLayers && activeMapLayer === "competition" &&
              mapLayers.competition_points.map((point, index) => (
                <MarkerF
                  icon={{ ...COMPETITION_MARKER_ICON, path: google.maps.SymbolPath.CIRCLE }}
                  key={`competition-${index}`}
                  position={{ lat: point.latitude, lng: point.longitude }}
                  title={point.name}
                />
              ))}
          </GoogleMap>
        </div>
      </div>
    </LoadScript>
  );
}
