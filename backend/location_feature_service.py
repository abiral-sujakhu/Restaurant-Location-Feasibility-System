# ============================================================
# location_feature_service.py
# ============================================================
# Calculates all model features from locally stored datasets.
#
# No Google Places API call is made.
#
# Data sources:
# - pois_unique.csv for the 13 POI count features
# - final_dataset.csv for restaurant competition features

from pathlib import Path
from typing import Dict, Union

import numpy as np
import pandas as pd


# ============================================================
# CONFIGURATION
# ============================================================

FEATURE_RADIUS_M = 500.0

EARTH_RADIUS_M = 6_371_000.0

BASE_DIRECTORY = Path(__file__).resolve().parent

POI_DATASET_PATH = (
    BASE_DIRECTORY
    / "data"
    / "pois_unique.csv"
)

RESTAURANT_DATASET_PATH = (
    BASE_DIRECTORY
    / "data"
    / "final_dataset.csv"
)


FeatureValue = Union[int, float, str]


# ============================================================
# POI TO MODEL-FEATURE MAPPING
# ============================================================

POI_FEATURE_MAPPING = {
    "bank": "bank_count_500m",
    "bus_stop": "bus_stop_count_500m",
    "cinema": "cinema_count_500m",
    "clinic": "clinic_count_500m",
    "college": "college_count_500m",
    "hospital": "hospital_count_500m",
    "museum": "museum_count_500m",
    "office": "office_count_500m",
    "parking_space": "parking_space_count_500m",
    "recreation": "recreation_count_500m",
    "retail": "retail_count_500m",
    "school": "school_count_500m",
    "temple": "temple_count_500m"
}


# ============================================================
# LOAD AND VALIDATE POI DATASET
# ============================================================

def load_poi_dataset() -> pd.DataFrame:
    """
    Load the unique POI dataset.
    """

    if not POI_DATASET_PATH.exists():
        raise FileNotFoundError(
            f"POI dataset not found: {POI_DATASET_PATH}"
        )

    poi_df = pd.read_csv(
        POI_DATASET_PATH
    )

    required_columns = {
        "place_id",
        "poi_type",
        "latitude",
        "longitude"
    }

    missing_columns = (
        required_columns - set(poi_df.columns)
    )

    if missing_columns:
        raise ValueError(
            "The POI dataset is missing columns: "
            + ", ".join(sorted(missing_columns))
        )

    poi_df["latitude"] = pd.to_numeric(
        poi_df["latitude"],
        errors="coerce"
    )

    poi_df["longitude"] = pd.to_numeric(
        poi_df["longitude"],
        errors="coerce"
    )

    poi_df["poi_type"] = (
        poi_df["poi_type"]
        .astype(str)
        .str.strip()
        .str.lower()
    )

    poi_df = poi_df.dropna(
        subset=[
            "latitude",
            "longitude",
            "poi_type"
        ]
    )

    # Dataset is already unique, but this provides extra safety.
    poi_df = poi_df.drop_duplicates(
        subset=["place_id"],
        keep="first"
    )

    valid_poi_types = set(
        POI_FEATURE_MAPPING.keys()
    )

    poi_df = poi_df[
        poi_df["poi_type"].isin(
            valid_poi_types
        )
    ]

    return poi_df.reset_index(
        drop=True
    )


# ============================================================
# LOAD AND VALIDATE RESTAURANT DATASET
# ============================================================

def load_restaurant_dataset() -> pd.DataFrame:
    """
    Load restaurants from final_dataset.csv.

    The dataset already contains the original restaurant
    coordinates, restaurant ratings and user rating counts.
    The previously calculated 500-meter columns are not reused.
    They are recalculated for the new selected coordinate.
    """

    if not RESTAURANT_DATASET_PATH.exists():
        raise FileNotFoundError(
            "Restaurant dataset not found: "
            f"{RESTAURANT_DATASET_PATH}"
        )

    restaurant_df = pd.read_csv(
        RESTAURANT_DATASET_PATH
    )

    required_columns = {
        "place_id",
        "latitude",
        "longitude",
        "restaurant_rating",
        "user_rating_count"
    }

    missing_columns = (
        required_columns
        - set(restaurant_df.columns)
    )

    if missing_columns:
        raise ValueError(
            "The restaurant dataset is missing columns: "
            + ", ".join(sorted(missing_columns))
        )

    numeric_columns = [
        "latitude",
        "longitude",
        "restaurant_rating",
        "user_rating_count"
    ]

    for column_name in numeric_columns:
        restaurant_df[column_name] = pd.to_numeric(
            restaurant_df[column_name],
            errors="coerce"
        )

    restaurant_df = restaurant_df.dropna(
        subset=[
            "latitude",
            "longitude"
        ]
    )

    restaurant_df = restaurant_df.drop_duplicates(
        subset=["place_id"],
        keep="first"
    )

    return restaurant_df.reset_index(
        drop=True
    )


# ============================================================
# LOAD DATA ONCE WHEN FASTAPI STARTS
# ============================================================

POI_DF = load_poi_dataset()

RESTAURANT_DF = load_restaurant_dataset()


# Convert dataset coordinates to radians once.
# This makes repeated predictions faster.

POI_LATITUDES_RAD = np.radians(
    POI_DF["latitude"].to_numpy(
        dtype=float
    )
)

POI_LONGITUDES_RAD = np.radians(
    POI_DF["longitude"].to_numpy(
        dtype=float
    )
)

RESTAURANT_LATITUDES_RAD = np.radians(
    RESTAURANT_DF["latitude"].to_numpy(
        dtype=float
    )
)

RESTAURANT_LONGITUDES_RAD = np.radians(
    RESTAURANT_DF["longitude"].to_numpy(
        dtype=float
    )
)


# ============================================================
# DISTANCE CALCULATION
# ============================================================

def calculate_distances_m(
    selected_latitude: float,
    selected_longitude: float,
    dataset_latitudes_rad: np.ndarray,
    dataset_longitudes_rad: np.ndarray
) -> np.ndarray:
    """
    Calculate distance from one selected point to every row
    in a dataset using the vectorized Haversine formula.
    """

    selected_latitude_rad = np.radians(
        selected_latitude
    )

    selected_longitude_rad = np.radians(
        selected_longitude
    )

    latitude_difference = (
        dataset_latitudes_rad
        - selected_latitude_rad
    )

    longitude_difference = (
        dataset_longitudes_rad
        - selected_longitude_rad
    )

    haversine_value = (
        np.sin(latitude_difference / 2.0) ** 2
        + np.cos(selected_latitude_rad)
        * np.cos(dataset_latitudes_rad)
        * np.sin(longitude_difference / 2.0) ** 2
    )

    haversine_value = np.clip(
        haversine_value,
        0.0,
        1.0
    )

    central_angle = 2.0 * np.arcsin(
        np.sqrt(haversine_value)
    )

    return EARTH_RADIUS_M * central_angle


# ============================================================
# POI FEATURE CALCULATION
# ============================================================

def calculate_poi_features(
    latitude: float,
    longitude: float
) -> Dict[str, int]:
    """
    Count every POI type within 500 meters of the selected point.
    """

    distances_m = calculate_distances_m(
        selected_latitude=latitude,
        selected_longitude=longitude,
        dataset_latitudes_rad=POI_LATITUDES_RAD,
        dataset_longitudes_rad=POI_LONGITUDES_RAD
    )

    nearby_mask = (
        distances_m <= FEATURE_RADIUS_M
    )

    nearby_pois = POI_DF.loc[
        nearby_mask
    ]

    # Always return every expected feature.
    poi_features = {
        feature_name: 0
        for feature_name
        in POI_FEATURE_MAPPING.values()
    }

    if nearby_pois.empty:
        return poi_features

    category_counts = (
        nearby_pois["poi_type"]
        .value_counts()
        .to_dict()
    )

    for poi_type, feature_name in (
        POI_FEATURE_MAPPING.items()
    ):
        poi_features[feature_name] = int(
            category_counts.get(
                poi_type,
                0
            )
        )

    return poi_features


# ============================================================
# RESTAURANT FEATURE CALCULATION
# ============================================================

def calculate_restaurant_features(
    latitude: float,
    longitude: float
) -> Dict[str, Union[int, float]]:
    """
    Calculate the four restaurant-related model features.

    Features:
    - competitor_count_500m
    - nearest_restaurant_m
    - avg_restaurant_rating_500m
    - avg_review_ratings_500m
    """

    distances_m = calculate_distances_m(
        selected_latitude=latitude,
        selected_longitude=longitude,
        dataset_latitudes_rad=(
            RESTAURANT_LATITUDES_RAD
        ),
        dataset_longitudes_rad=(
            RESTAURANT_LONGITUDES_RAD
        )
    )

    nearby_mask = (
        distances_m <= FEATURE_RADIUS_M
    )

    nearby_restaurants = RESTAURANT_DF.loc[
        nearby_mask
    ].copy()

    nearby_distances = distances_m[
        nearby_mask
    ]

    competitor_count = int(
        len(nearby_restaurants)
    )

    if competitor_count == 0:
        return {
            "competitor_count_500m": 0,

            # No restaurant was found inside the 500 m radius.
            # Use 500 as the maximum in-radius distance.
            "nearest_restaurant_m": FEATURE_RADIUS_M,

            "avg_restaurant_rating_500m": 0.0,

            "avg_review_ratings_500m": 0.0
        }

    nearest_restaurant_m = float(
        nearby_distances.min()
    )

    valid_ratings = (
        nearby_restaurants[
            "restaurant_rating"
        ]
        .dropna()
    )

    valid_review_counts = (
        nearby_restaurants[
            "user_rating_count"
        ]
        .dropna()
    )

    if valid_ratings.empty:
        average_rating = 0.0
    else:
        average_rating = float(
            valid_ratings.mean()
        )

    if valid_review_counts.empty:
        average_review_count = 0.0
    else:
        average_review_count = float(
            valid_review_counts.mean()
        )

    return {
        "competitor_count_500m": competitor_count,

        "nearest_restaurant_m": round(
            nearest_restaurant_m,
            4
        ),

        "avg_restaurant_rating_500m": round(
            average_rating,
            4
        ),

        # This feature name is retained because it was used
        # while training the model. Its value is the average
        # user_rating_count of nearby restaurants.
        "avg_review_ratings_500m": round(
            average_review_count,
            4
        )
    }


# ============================================================
# COMPLETE LOCATION FEATURE COLLECTION
# ============================================================

def collect_location_features(
    latitude: float,
    longitude: float,
    search_area: str
) -> Dict[str, FeatureValue]:
    """
    Calculate all 18 model input features for a new coordinate.
    """

    poi_features = calculate_poi_features(
        latitude=latitude,
        longitude=longitude
    )

    restaurant_features = (
        calculate_restaurant_features(
            latitude=latitude,
            longitude=longitude
        )
    )

    location_features: Dict[
        str,
        FeatureValue
    ] = {
        **poi_features,
        **restaurant_features,
        "search_area": search_area
    }

    return location_features