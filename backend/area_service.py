# ============================================================
# area_service.py
# ============================================================

from math import atan2, cos, radians, sin, sqrt
from typing import Dict, Tuple, Union


MAX_AREA_DISTANCE_M = 1500.0


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
    Calculate distance between two geographic coordinates.
    """

    earth_radius_m = 6_371_000.0

    lat_1 = radians(latitude_1)
    lat_2 = radians(latitude_2)

    lat_difference = radians(
        latitude_2 - latitude_1
    )

    lon_difference = radians(
        longitude_2 - longitude_1
    )

    value = (
        sin(lat_difference / 2.0) ** 2
        + cos(lat_1)
        * cos(lat_2)
        * sin(lon_difference / 2.0) ** 2
    )

    central_angle = 2.0 * atan2(
        sqrt(value),
        sqrt(1.0 - value)
    )

    return earth_radius_m * central_angle


def find_nearest_study_area(
    latitude: float,
    longitude: float
) -> Tuple[str, float]:
    """
    Find the nearest study-area center.
    """

    nearest_area_name = None
    nearest_distance_m = float("inf")

    for area_name, center in STUDY_AREAS.items():

        distance_m = haversine_distance_m(
            latitude_1=latitude,
            longitude_1=longitude,
            latitude_2=center["latitude"],
            longitude_2=center["longitude"]
        )

        if distance_m < nearest_distance_m:
            nearest_area_name = area_name
            nearest_distance_m = distance_m

    if nearest_area_name is None:
        raise ValueError(
            "No study areas are configured."
        )

    return nearest_area_name, nearest_distance_m


def validate_selected_location(
    latitude: float,
    longitude: float
) -> Dict[str, Union[str, float]]:
    """
    Confirm that the selected point lies within 1,500 meters
    of at least one supported study-area center.
    """

    area_name, distance_m = find_nearest_study_area(
        latitude=latitude,
        longitude=longitude
    )

    if distance_m > MAX_AREA_DISTANCE_M:
        raise ValueError(
            "The selected location is outside the supported "
            "study areas. Select a point within 1500 meters "
            "of one of the nine study-area centers."
        )

    return {
        "search_area": area_name,
        "distance_from_area_center_m": round(
            distance_m,
            2
        )
    }


def get_study_areas_for_api() -> list[dict]:
    """
    Return study-area information for the frontend map.
    """

    return [
        {
            "name": area_name,
            "latitude": coordinates["latitude"],
            "longitude": coordinates["longitude"]
        }
        for area_name, coordinates in STUDY_AREAS.items()
    ]