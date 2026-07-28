# ============================================================
# location_feature_service.py
# ============================================================
# This module will eventually calculate all nearby location
# features dynamically within 500 meters.
#
# For the first backend test, it returns fixed sample values.
#
# After the FastAPI-model workflow works correctly, these fixed
# values will be replaced with Google Places and OSM results.

from typing import Dict, Union


# Radius used to calculate nearby model features
FEATURE_RADIUS_M = 500.0


FeatureValue = Union[int, float, str]


def collect_location_features(
    latitude: float,
    longitude: float,
    search_area: str
) -> Dict[str, FeatureValue]:
    """
    Collect model inputs for the selected coordinate.

    Parameters
    ----------
    latitude:
        User-selected latitude.

    longitude:
        User-selected longitude.

    search_area:
        Validated nearest study area.

    Returns
    -------
    dict
        A dictionary containing all raw model features.

    Important
    ---------
    This is a temporary test implementation. The values are
    fixed and do not yet change based on latitude and longitude.
    """

    # Latitude and longitude are currently accepted so the
    # function interface is ready for dynamic collection later.
    _ = latitude
    _ = longitude

    location_features: Dict[str, FeatureValue] = {
        "bank_count_500m": 8,
        "bus_stop_count_500m": 12,
        "cinema_count_500m": 1,
        "clinic_count_500m": 7,
        "college_count_500m": 3,
        "hospital_count_500m": 2,
        "museum_count_500m": 0,
        "office_count_500m": 25,
        "parking_space_count_500m": 5,
        "recreation_count_500m": 4,
        "retail_count_500m": 30,
        "school_count_500m": 6,
        "temple_count_500m": 5,
        "nearest_restaurant_m": 75.5,
        "competitor_count_500m": 18,
        "avg_restaurant_rating_500m": 4.1,
        "avg_review_ratings_500m": 245.0,
        "search_area": search_area
    }

    return location_features