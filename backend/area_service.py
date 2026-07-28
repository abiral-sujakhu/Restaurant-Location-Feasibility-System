# ============================================================
# area_service.py
# ============================================================
# This module:
#
# 1. Stores the nine study-area centers
# 2. Calculates geographic distance
# 3. Finds the nearest study area
# 4. Rejects coordinates outside the supported regions
#
# A user-selected location must be within 1,500 meters of one
# of the nine study-area centers.

from math import atan2, cos, radians, sin, sqrt
from typing import Dict, Tuple, Union


# Maximum distance allowed from a study-area center
MAX_AREA_DISTANCE_M = 1500.0


# Exact study-area centers used during data collection
STUDY_AREAS: Dict[str, Dict[str, float]] = {
    "Baneshwor": {
        "latitude": 27.69396,
        "longitude": 85.33738
    },

    "New Road": {
        "latitude": 27.70200,
        "longitude": 85.30743
    },

    "Koteshwor": {
        "latitude": 27.68333,
        "longitude": 85.35000
    },

    "Bhaktapur durbar square": {
        "latitude": 27.67203,
        "longitude": 85.42811
    },

    "Patan durbar square": {
        "latitude": 27.67340,
        "longitude": 85.32500
    },

    "Boudha stupa": {
        "latitude": 27.72139,
        "longitude": 85.36194
    },

    "Pulchowk": {
        "latitude": 27.67870,
        "longitude": 85.31750
    },

    "Durbar Marg": {
        "latitude": 27.71261,
        "longitude": 85.31797
    },

    "Kirtipur": {
        "latitude": 27.67806,
        "longitude": 85.27694
    }
}


def haversine_distance_m(
    latitude_1: float,
    longitude_1: float,
    latitude_2: float,
    longitude_2: float
) -> float:
    """
    Calculate the distance between two geographic coordinates.

    Parameters
    ----------
    latitude_1:
        Latitude of the first coordinate.

    longitude_1:
        Longitude of the first coordinate.

    latitude_2:
        Latitude of the second coordinate.

    longitude_2:
        Longitude of the second coordinate.

    Returns
    -------
    float
        Distance between the coordinates in meters.
    """

    earth_radius_m = 6_371_000.0

    latitude_1_rad = radians(latitude_1)
    latitude_2_rad = radians(latitude_2)

    latitude_difference = radians(
        latitude_2 - latitude_1
    )

    longitude_difference = radians(
        longitude_2 - longitude_1
    )

    haversine_value = (
        sin(latitude_difference / 2.0) ** 2
        + cos(latitude_1_rad)
        * cos(latitude_2_rad)
        * sin(longitude_difference / 2.0) ** 2
    )

    central_angle = 2.0 * atan2(
        sqrt(haversine_value),
        sqrt(1.0 - haversine_value)
    )

    return earth_radius_m * central_angle


def find_nearest_study_area(
    latitude: float,
    longitude: float
) -> Tuple[str, float]:
    """
    Find the nearest study area to the selected coordinate.

    Returns
    -------
    tuple
        A tuple containing:
        - nearest study-area name
        - distance from the study-area center in meters
    """

    nearest_area_name: str | None = None
    nearest_distance_m = float("inf")

    for area_name, area_coordinates in STUDY_AREAS.items():

        distance_m = haversine_distance_m(
            latitude_1=latitude,
            longitude_1=longitude,
            latitude_2=area_coordinates["latitude"],
            longitude_2=area_coordinates["longitude"]
        )

        if distance_m < nearest_distance_m:
            nearest_area_name = area_name
            nearest_distance_m = distance_m

    if nearest_area_name is None:
        raise ValueError(
            "No study areas have been configured."
        )

    return nearest_area_name, nearest_distance_m


def validate_selected_location(
    latitude: float,
    longitude: float
) -> Dict[str, Union[str, float]]:
    """
    Validate that the selected coordinate is located within
    1,500 meters of at least one study-area center.

    Returns
    -------
    dict
        Contains:
        - search_area
        - distance_from_area_center_m

    Raises
    ------
    ValueError
        If the selected location is outside all supported areas.
    """

    nearest_area_name, nearest_distance_m = (
        find_nearest_study_area(
            latitude=latitude,
            longitude=longitude
        )
    )

    if nearest_distance_m > MAX_AREA_DISTANCE_M:
        raise ValueError(
            "The selected location is outside the supported "
            "study areas. Select a point within "
            f"{int(MAX_AREA_DISTANCE_M)} meters of one of the "
            "nine study-area centers."
        )

    return {
        "search_area": nearest_area_name,
        "distance_from_area_center_m": round(
            nearest_distance_m,
            2
        )
    }


def get_study_areas_for_api() -> list[dict]:
    """
    Convert the study-area dictionary into a list suitable
    for the FastAPI response.
    """

    return [
        {
            "name": area_name,
            "latitude": coordinates["latitude"],
            "longitude": coordinates["longitude"]
        }
        for area_name, coordinates in STUDY_AREAS.items()
    ]