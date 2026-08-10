# ============================================================
# schemas.py
# ============================================================

from typing import Dict, Union

from pydantic import BaseModel, Field


FeatureValue = Union[int, float, str]


class LocationRequest(BaseModel):
    """
    Latitude and longitude sent by the frontend.
    """

    latitude: float = Field(
        ...,
        ge=-90,
        le=90
    )

    longitude: float = Field(
        ...,
        ge=-180,
        le=180
    )


class StudyAreaResponse(BaseModel):
    name: str
    latitude: float
    longitude: float


class StudyAreasResponse(BaseModel):
    supported_area_count: int
    maximum_allowed_distance_m: float
    feature_radius_m: float
    study_areas: list[StudyAreaResponse]


class AreaInformation(BaseModel):
    search_area: str
    distance_from_area_center_m: float
    maximum_allowed_distance_m: float


class ShapFactor(BaseModel):
    feature: str
    direction: str
    strength: str
    impact: float
    relative_impact: float
    description: str


class ShapExplanation(BaseModel):
    explained_label: str
    summary: str
    factors: list[ShapFactor]


class DemandRawCounts(BaseModel):
    cinema: int
    museum: int
    temple: int
    recreation: int
    office: int
    college: int
    school: int
    hospital: int
    clinic: int
    retail: int
    bank: int


class AccessibilityRawCounts(BaseModel):
    bus_stop: int
    parking_space: int
    intersection: int


class CompetitionRawCounts(BaseModel):
    competitor_count: int
    nearest_restaurant_m: Union[float, None] = None


class PopulationRawCounts(BaseModel):
    building_count: int


class RawCounts(BaseModel):
    demand: DemandRawCounts
    accessibility: AccessibilityRawCounts
    competition: CompetitionRawCounts
    population: PopulationRawCounts


class CompetitorInfo(BaseModel):
    name: str
    rating: Union[float, None] = None
    review_count: Union[int, None] = None
    distance_m: float
    latitude: float
    longitude: float


class MapPoint(BaseModel):
    latitude: float
    longitude: float
    category: Union[str, None] = None


class MapLayers(BaseModel):
    demand_points: list[MapPoint]
    accessibility_points: list[MapPoint]
    competition_points: list[CompetitorInfo]
    population_points: list[MapPoint]


class SiteDetail(BaseModel):
    raw_counts: RawCounts
    nearby_competitors: list[CompetitorInfo]
    map_layers: MapLayers


class PredictionResponse(BaseModel):
    latitude: float
    longitude: float

    area_information: AreaInformation

    predicted_class: Union[int, str]
    predicted_label: str
    confidence: float

    probabilities: Dict[str, float]

    explanation: ShapExplanation

    collected_features: Dict[
        str,
        FeatureValue
    ]

    site_detail: SiteDetail
