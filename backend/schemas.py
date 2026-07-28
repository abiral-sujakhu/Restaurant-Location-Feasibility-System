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


class PredictionResponse(BaseModel):
    latitude: float
    longitude: float

    area_information: AreaInformation

    predicted_class: Union[int, str]
    predicted_label: str

    probabilities: Dict[str, float]

    collected_features: Dict[
        str,
        FeatureValue
    ]