export type ShapFactor = {
  feature: string;
  direction: "supports" | "opposes";
  strength: string;
  impact: number;
  relative_impact: number;
  description: string;
};

export type DemandRawCounts = {
  cinema: number;
  museum: number;
  temple: number;
  recreation: number;
  office: number;
  college: number;
  school: number;
  hospital: number;
  clinic: number;
  retail: number;
  bank: number;
};

export type AccessibilityRawCounts = {
  bus_stop: number;
  parking_space: number;
  intersection: number;
};

export type CompetitionRawCounts = {
  competitor_count: number;
  nearest_restaurant_m: number | null;
};

export type PopulationRawCounts = {
  building_count: number;
};

export type RawCounts = {
  demand: DemandRawCounts;
  accessibility: AccessibilityRawCounts;
  competition: CompetitionRawCounts;
  population: PopulationRawCounts;
};

export type CompetitorInfo = {
  name: string;
  rating: number | null;
  review_count: number | null;
  distance_m: number;
  latitude: number;
  longitude: number;
};

export type MapPoint = {
  latitude: number;
  longitude: number;
  category?: string | null;
};

export type MapLayers = {
  demand_points: MapPoint[];
  accessibility_points: MapPoint[];
  competition_points: CompetitorInfo[];
  population_points: MapPoint[];
};

export type SiteDetail = {
  raw_counts: RawCounts;
  nearby_competitors: CompetitorInfo[];
  map_layers: MapLayers;
};

export type PredictionResponse = {
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
    factors: ShapFactor[];
  };
  collected_features: Record<string, number | string>;
  site_detail: SiteDetail;
};

export type SavedPrediction = {
  id: string;
  name: string;
  savedAt: string;
  position: google.maps.LatLngLiteral;
  prediction: PredictionResponse;
};

export type StudyArea = {
  name: string;
  latitude: number;
  longitude: number;
};

export type StudyAreasResponse = {
  maximum_allowed_distance_m: number;
  study_areas: StudyArea[];
};

export const COMPARISON_FACTORS = [
  { key: "Demand", label: "Demand" },
  { key: "Population", label: "Population" },
  { key: "Accessibility", label: "Accessibility" },
  { key: "Competition", label: "Competition" },
] as const;

export type FactorKey = (typeof COMPARISON_FACTORS)[number]["key"];

export type PanelId = "dashboard" | "factors" | "snapshot" | "comparison" | "report";

export type MapLayerId = "demand" | "accessibility" | "competition" | "population";
