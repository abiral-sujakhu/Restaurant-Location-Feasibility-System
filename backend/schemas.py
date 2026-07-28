# ============================================================
# schemas.py
# ============================================================
# Pydantic models used to validate FastAPI request and response
# data.

from typing import Dict, Union

from pydantic import BaseModel, Field


# A collected model feature can be numeric or categorical.
FeatureValue = Union[int, float, str]


class LocationRequest(BaseModel):
    """
    Request sent by the frontend after the user selects a
    coordinate on the map.
    """

    latitude: float = Field(
        ...,
        ge=-90,
        le=90,
        description="Selected location latitude"
    )

    longitude: float = Field(
        ...,
        ge=-180,
        le=180,
        description="Selected location longitude"
    )


class StudyAreaResponse(BaseModel):
    """
    Information about one supported study area.
    """

    name: str
    latitude: float
    longitude: float


class StudyAreasResponse(BaseModel):
    """
    Response returned by GET /study-areas.
    """

    supported_area_count: int
    maximum_allowed_distance_m: float
    feature_radius_m: float
    study_areas: list[StudyAreaResponse]


class AreaInformation(BaseModel):
    """
    Information about the validated selected location.
    """

    search_area: str
    distance_from_area_center_m: float
    maximum_allowed_distance_m: float


class PredictionResponse(BaseModel):
    """
    Response returned after feasibility prediction.
    """

    latitude: float
    longitude: float

    area_information: AreaInformation

    predicted_class: Union[int, str]
    predicted_label: str

    probabilities: Dict[str, float]

    collected_features: Dict[str, FeatureValue]