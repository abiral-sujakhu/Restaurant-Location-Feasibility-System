"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CircleF, GoogleMap, LoadScript, Marker } from "@react-google-maps/api";

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

type SavedPrediction = {
  id: string;
  name: string;
  savedAt: string;
  position: google.maps.LatLngLiteral;
  prediction: PredictionResponse;
};

type StudyArea = {
  name: string;
  latitude: number;
  longitude: number;
};

type StudyAreasResponse = {
  maximum_allowed_distance_m: number;
  study_areas: StudyArea[];
};

function distanceInMeters(
  first: google.maps.LatLngLiteral,
  second: google.maps.LatLngLiteral,
) {
  const earthRadiusM = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDifference = toRadians(second.lat - first.lat);
  const longitudeDifference = toRadians(second.lng - first.lng);
  const firstLatitude = toRadians(first.lat);
  const secondLatitude = toRadians(second.lat);
  const haversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDifference / 2) ** 2;
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function offsetLatLng(
  center: google.maps.LatLngLiteral,
  northM: number,
  eastM: number,
): google.maps.LatLngLiteral {
  const metersPerDegreeLatitude = 111_320;
  const lat = center.lat + northM / metersPerDegreeLatitude;
  const lng =
    center.lng +
    eastM / (metersPerDegreeLatitude * Math.cos((center.lat * Math.PI) / 180));
  return { lat, lng };
}

function readableFeatureName(name: string) {
  return name.replaceAll("_", " ");
}

function resultBadgeClasses(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("high")) return "bg-emerald-100 text-emerald-700";
  if (normalized.includes("low")) return "bg-red-100 text-red-700";
  return "bg-amber-100 text-amber-700";
}

function bearingDegrees(
  from: google.maps.LatLngLiteral,
  to: google.maps.LatLngLiteral,
) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const toDegrees = (radians: number) => (radians * 180) / Math.PI;
  const longitudeDifference = toRadians(to.lng - from.lng);
  const fromLatitude = toRadians(from.lat);
  const toLatitude = toRadians(to.lat);
  const y = Math.sin(longitudeDifference) * Math.cos(toLatitude);
  const x =
    Math.cos(fromLatitude) * Math.sin(toLatitude) -
    Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDifference);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function wrapPdfText(text: string, maximumLength = 88) {
  const words = text.replace(/[^\x20-\x7E]/g, " ").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    if (`${currentLine} ${word}`.trim().length > maximumLength && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = `${currentLine} ${word}`.trim();
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [""];
}

function pdfSafeText(text: string) {
  return text.replace(/[^\x20-\x7E]/g, " ").replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function createVisualPage(prediction: PredictionResponse) {
  const commands: string[] = ["0.97 0.98 1 rg 0 0 595 842 re f"];
  const text = (value: string, x: number, y: number, size = 10, color = "0.12 0.16 0.23") => {
    commands.push(`${color} rg BT /F1 ${size} Tf ${x} ${y} Td (${pdfSafeText(value)}) Tj ET`);
  };
  const rect = (x: number, y: number, width: number, height: number, color: string) => {
    commands.push(`${color} rg ${x} ${y} ${width} ${height} re f`);
  };

  text("YOGYA SITE", 48, 795, 22, "0.04 0.31 0.62");
  text("Restaurant location feasibility report", 48, 772, 11, "0.35 0.42 0.52");
  text(`${prediction.area_information.search_area}  |  ${prediction.latitude.toFixed(5)}, ${prediction.longitude.toFixed(5)}`, 48, 752, 9, "0.35 0.42 0.52");

  const resultColor = prediction.predicted_label.toLowerCase().includes("high")
    ? "0.02 0.55 0.35"
    : prediction.predicted_label.toLowerCase().includes("low")
      ? "0.86 0.25 0.24"
      : "0.91 0.55 0.08";
  rect(48, 682, 499, 52, resultColor);
  text("MODEL RESULT", 65, 714, 9, "1 1 1");
  text(prediction.predicted_label.toUpperCase() + " FEASIBILITY", 65, 692, 18, "1 1 1");

  text("SITE FACTOR PROFILE", 48, 651, 14);
  text("Longer bars indicate stronger conditions in the model.", 48, 634, 9, "0.35 0.42 0.52");
  const factorColors = ["0.15 0.45 0.90", "0.49 0.27 0.89", "0.04 0.65 0.55", "0.93 0.45 0.12"];
  COMPARISON_FACTORS.forEach((factor, index) => {
    const rawValue = Number(prediction.collected_features[factor.key]) || 0;
    const value = Math.max(0, Math.min(1, rawValue));
    const y = 596 - index * 48;
    text(factor.label, 48, y + 8, 10);
    rect(165, y, 330, 14, "0.88 0.90 0.94");
    rect(165, y, Math.max(3, 330 * value), 14, factorColors[index]);
    text(`${(value * 100).toFixed(1)}/100`, 501, y + 3, 8);
  });

  text("WHAT MOVED THE PREDICTION", 48, 405, 14);
  rect(48, 381, 10, 10, "0.02 0.65 0.42");
  text("Supports result", 64, 382, 8, "0.35 0.42 0.52");
  rect(150, 381, 10, 10, "0.96 0.57 0.12");
  text("Opposes result", 166, 382, 8, "0.35 0.42 0.52");
  commands.push("0.70 0.73 0.78 RG 0.8 w 300 190 m 300 364 l S");
  prediction.explanation.factors.slice(0, 4).forEach((factor, index) => {
    const width = Math.max(4, Math.min(165, factor.relative_impact * 165));
    const y = 338 - index * 43;
    text(readableFeatureName(factor.feature), 48, y + 4, 9);
    if (factor.direction === "supports") {
      rect(300, y, width, 13, "0.02 0.65 0.42");
    } else {
      rect(300 - width, y, width, 13, "0.96 0.57 0.12");
    }
    text(`${Math.round(factor.relative_impact * 100)}%`, 480, y + 3, 8, "0.35 0.42 0.52");
  });

  const strongestFactor = COMPARISON_FACTORS.reduce((best, factor) =>
    Number(prediction.collected_features[factor.key]) > Number(prediction.collected_features[best.key]) ? factor : best,
  );
  const strongestOpposition = prediction.explanation.factors.find((factor) => factor.direction === "opposes");
  rect(48, 75, 499, 82, "0.91 0.95 1");
  text("AT A GLANCE", 65, 136, 11, "0.04 0.31 0.62");
  text(`${strongestFactor.label} is the strongest site-condition score.`, 65, 114, 9);
  text(
    strongestOpposition
      ? `${readableFeatureName(strongestOpposition.feature)} is the main factor working against the result.`
      : "The displayed leading factors all support the predicted result.",
    65, 94, 9,
  );
  text("Higher bars are favorable; influence bars show model effect, not raw factor size.", 48, 43, 8, "0.35 0.42 0.52");
  return commands.join("\n");
}

function createTextPdf(lines: string[], prediction: PredictionResponse) {
  const textPages = Array.from(
    { length: Math.ceil(lines.length / 48) },
    (_, index) => lines.slice(index * 48, (index + 1) * 48),
  );
  const pageLines = [[], ...textPages] as string[][];
  const fontObjectId = 3 + pageLines.length * 2;
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageLines.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pageLines.length} >>`,
  ];

  pageLines.forEach((page, index) => {
    const pageObjectId = 3 + index * 2;
    const contentObjectId = pageObjectId + 1;
    const escapedLines = page.map((line) =>
      `(${line.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)")}) Tj T*`,
    );
    const content = index === 0
      ? createVisualPage(prediction)
      : `BT /F1 10 Tf 48 794 Td 14 TL ${escapedLines.join(" ")} ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let pdf = "%PDF-1.4\n%YogyaSite\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const crossReferenceOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${offset.toString().padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${crossReferenceOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

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
const COMPARISON_FACTORS = [
  { key: "Demand", label: "Demand" },
  { key: "Population", label: "Population" },
  { key: "Accessibility", label: "Accessibility" },
  { key: "Competition", label: "Competition" },
] as const;
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

// Sidebar icon rail. Only "Dashboard" is wired up; the rest are kept for
// the visual layout and are not functional yet.
const NAV_ITEMS: Array<{ id: string; label: string; icon: ReactNode }> = [
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
    id: "explainability",
    label: "Explainability",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M4 6h14M4 12h10M4 18h6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "map",
    label: "Map view",
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
    id: "history",
    label: "History",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3.2 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "recommendations",
    label: "Recommendations",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M12 3.5l2.6 5.4 5.9.7-4.3 4.1 1.1 5.9L12 16.8l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.7L12 3.5z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "reports",
    label: "Reports",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M7 3h7l4 4v14H7z" strokeLinejoin="round" />
        <path d="M14 3v4h4" strokeLinejoin="round" />
        <path d="M9.5 12h6M9.5 15.5h6M9.5 8.5h2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "about",
    label: "About",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M9.6 9.3a2.4 2.4 0 114.1 1.7c-.7.7-1.7 1.1-1.7 2.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="16.8" fill="currentColor" r="0.6" stroke="none" />
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [studyAreas, setStudyAreas] = useState<StudyArea[]>([]);
  const [selectedAreaName, setSelectedAreaName] = useState<string | null>(null);
  const [selectedSubZone, setSelectedSubZone] = useState<string | null>(null);
  const [maximumAreaDistanceM, setMaximumAreaDistanceM] = useState(
    DEFAULT_SUPPORTED_RADIUS_M,
  );
  const [areasError, setAreasError] = useState<string | null>(null);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [isNavExpanded, setIsNavExpanded] = useState(false);

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

  const downloadPdfReport = () => {
    if (!prediction) return;
    const reportLines: string[] = [
      "YOGYA SITE - RESTAURANT LOCATION FEASIBILITY REPORT",
      "",
      `Generated: ${new Date().toLocaleString()}`,
      `Coordinates: ${prediction.latitude.toFixed(6)}, ${prediction.longitude.toFixed(6)}`,
      `Study area: ${prediction.area_information.search_area}`,
      `Distance from area center: ${Math.round(prediction.area_information.distance_from_area_center_m)} m`,
      `Feasibility result: ${prediction.predicted_label}`,
      "",
      "MODEL FACTORS",
    ];
    COMPARISON_FACTORS.forEach((factor) => {
      const value = prediction.collected_features[factor.key];
      reportLines.push(
        `${factor.label}: ${typeof value === "number" ? value.toFixed(4) : value}`,
      );
    });
    reportLines.push("", "RESULT EXPLANATION");
    reportLines.push(...wrapPdfText(prediction.explanation.summary));
    reportLines.push("", "INFLUENTIAL FACTORS");
    prediction.explanation.factors.forEach((factor, index) => {
      reportLines.push(
        `${index + 1}. ${readableFeatureName(factor.feature)} - ${factor.strength} ${factor.direction}`,
      );
      reportLines.push(...wrapPdfText(factor.description));
    });
    reportLines.push(
      "",
      "NOTES",
      ...wrapPdfText(
        "Scores are model estimates based on nearby data. This report supports site screening and should not replace field research or financial due diligence.",
      ),
    );

    const downloadUrl = URL.createObjectURL(
      createTextPdf(reportLines, prediction),
    );
    const link = document.createElement("a");
    const areaName = prediction.area_information.search_area
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    link.href = downloadUrl;
    link.download = `yogya-site-${areaName}-${new Date().toISOString().slice(0, 10)}.pdf`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  };

  const revisitPrediction = (entry: SavedPrediction) => {
    setMarkerPosition(entry.position);
    setPrediction(entry.prediction);
    setError(null);
    map?.panTo(entry.position);
    map?.setZoom(15);
  };

  const removePrediction = (id: string) => {
    updateHistory(history.filter((entry) => entry.id !== id));
    setCompareIds((current) => current.filter((entryId) => entryId !== id));
  };

  const startRenaming = (entry: SavedPrediction) => {
    setEditingId(entry.id);
    setEditingName(entry.name);
  };

  const finishRenaming = (id: string) => {
    const name = editingName.trim();
    if (name) {
      updateHistory(
        history.map((entry) => (entry.id === id ? { ...entry, name } : entry)),
      );
    }
    setEditingId(null);
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

  const hasSidebarContent = Boolean(prediction) || history.length > 0 || isDashboardOpen;

  return (
    <LoadScript googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
      <div className="flex h-full min-h-0 flex-row overflow-hidden bg-gray-100">
        <nav
          className={`flex shrink-0 flex-col border-r border-gray-200 bg-white py-6 transition-[width] duration-200 ${
            isNavExpanded ? "w-56 items-stretch px-3" : "w-16 items-center"
          }`}
        >
          <button
            aria-expanded={isNavExpanded}
            aria-label={isNavExpanded ? "Collapse sidebar" : "Expand sidebar"}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 ${
              isNavExpanded ? "ml-4" : ""
            }`}
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
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          </button>

          <div
            className={`mt-8 flex flex-col gap-5 rounded-2xl bg-gray-50 py-4 ${
              isNavExpanded ? "items-stretch px-3" : "items-center px-2.5"
            }`}
          >
            {NAV_ITEMS.map((item) => {
              const isDashboardItem = item.id === "dashboard";
              const isActive = isDashboardItem && isDashboardOpen;
              return (
                <button
                  aria-label={item.label}
                  aria-pressed={isActive}
                  className={`flex items-center rounded-xl transition ${
                    isNavExpanded ? "h-10 w-full gap-3 px-3" : "h-10 w-10 justify-center"
                  } ${
                    isActive
                      ? "bg-lime-300 text-slate-900"
                      : "text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                  }`}
                  key={item.id}
                  onClick={
                    isDashboardItem
                      ? () => setIsDashboardOpen((current) => !current)
                      : undefined
                  }
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

        {hasSidebarContent && (
        <aside className="w-full overflow-y-auto rounded-2xl bg-white p-6 text-black shadow-lg lg:w-96 lg:shrink-0">

          {prediction && (
            <section className="mt-6 border-t border-gray-100 pt-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Feasibility result
              </p>
              <span
                className={`mt-2 inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${resultBadgeClasses(prediction.predicted_label)}`}
              >
                {prediction.predicted_label}
              </span>
              <p className="mt-2 text-sm text-gray-500">
                {prediction.area_information.search_area} · {Math.round(
                  prediction.area_information.distance_from_area_center_m,
                )} m from center
              </p>

              <div className="mt-4 flex flex-col gap-2">
                <button
                  className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                  onClick={visitLocationInStreetView}
                  type="button"
                >
                  Visit this location (Street View)
                </button>

                <button
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                  onClick={savePrediction}
                  type="button"
                >
                  Save to prediction history
                </button>

                <button
                  className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                  onClick={downloadPdfReport}
                  type="button"
                >
                  Download PDF report
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-5">
                <h4 className="text-sm font-semibold text-gray-900">Why this result?</h4>
                <p className="mt-1.5 text-sm leading-6 text-gray-600">
                  {prediction.explanation.summary}
                </p>
                <div className="mt-5 space-y-4">
                  {prediction.explanation.factors.slice(0, 4).map((factor) => (
                    <div className="space-y-1.5" key={factor.feature}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium capitalize text-gray-700">
                          {readableFeatureName(factor.feature)}
                        </span>
                        <span className={factor.direction === "supports" ? "text-xs font-semibold text-emerald-600" : "text-xs font-semibold text-amber-600"}>
                          {factor.strength} {factor.direction}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
                        <div
                          className={factor.direction === "supports" ? "h-full rounded-full bg-emerald-500" : "h-full rounded-full bg-amber-500"}
                          style={{ width: `${Math.max(8, factor.relative_impact * 100)}%` }}
                        />
                      </div>
                      <p className="text-xs leading-5 text-gray-500">
                        {factor.description}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-5 text-xs leading-5 text-gray-400">
                  SHAP shows how each factor moved the model toward or away from
                  the predicted feasibility class.
                </p>
              </div>
            </section>
          )}

          <section className={prediction ? "mt-6 border-t border-gray-200 pt-6" : ""}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">Prediction history</h3>
              <span className="text-xs text-gray-500">{history.length} saved</span>
            </div>

            {history.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-gray-500">
                Analyze a location and save it to revisit or compare it later.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {history.map((entry) => {
                  const isCompared = compareIds.includes(entry.id);
                  return (
                    <article
                      className={`rounded-xl border p-3 ${isCompared ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}
                      key={entry.id}
                    >
                      {editingId === entry.id ? (
                        <form
                          className="flex gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            finishRenaming(entry.id);
                          }}
                        >
                          <input
                            autoFocus
                            className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
                            maxLength={60}
                            onChange={(event) => setEditingName(event.target.value)}
                            value={editingName}
                          />
                          <button className="text-sm font-semibold text-blue-700" type="submit">
                            Save
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-semibold text-gray-900">{entry.name}</h4>
                            <p className="text-xs text-gray-500">
                              {entry.prediction.area_information.search_area} · {new Date(entry.savedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                            {entry.prediction.predicted_label}
                          </span>
                        </div>
                      )}

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <button className="rounded-md bg-blue-600 px-2 py-2 font-semibold text-white hover:bg-blue-700" onClick={() => revisitPrediction(entry)} type="button">Revisit</button>
                        <button
                          className="rounded-md border border-gray-300 px-2 py-2 font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={!isCompared && compareIds.length >= 3}
                          onClick={() => toggleComparison(entry.id)}
                          type="button"
                        >
                          {isCompared ? "Remove comparison" : "Compare"}
                        </button>
                        <button className="rounded-md border border-gray-300 px-2 py-2 text-gray-700 hover:bg-gray-50" onClick={() => startRenaming(entry)} type="button">Rename</button>
                        <button className="rounded-md border border-red-200 px-2 py-2 text-red-700 hover:bg-red-50" onClick={() => removePrediction(entry.id)} type="button">Delete</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {comparedPredictions.length > 0 && (
              <div className="mt-5 rounded-xl bg-slate-900 p-4 text-white">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">Site comparison</h4>
                  <button className="text-xs text-slate-300 hover:text-white" onClick={() => setCompareIds([])} type="button">Clear</button>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Site-condition indices use a 0–100 scale. Higher is more
                  favorable; these are not probabilities.
                </p>

                <div className="mt-4 space-y-5">
                  {COMPARISON_FACTORS.map((factor) => {
                    const highestValue = Math.max(
                      ...comparedPredictions.map((entry) => factorValue(entry, factor.key)),
                    );
                    return (
                      <div key={factor.key}>
                        <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                          {factor.label}
                        </h5>
                        <div className="mt-2 space-y-2">
                          {comparedPredictions.map((entry) => {
                            const value = factorValue(entry, factor.key);
                            const isLeader = value === highestValue;
                            return (
                              <div key={entry.id}>
                                <div className="flex justify-between gap-3 text-xs">
                                  <span className={isLeader ? "font-semibold text-white" : "truncate text-slate-300"}>
                                    {entry.name}{isLeader && comparedPredictions.length > 1 ? " · best" : ""}
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
          </section>
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
                  className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                  disabled={isLoading}
                  onClick={analyzeLocation}
                  type="button"
                >
                  {isLoading ? "Analyzing..." : "Analyze location"}
                </button>
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
          </GoogleMap>
        </div>
      </div>
    </LoadScript>
  );
}
