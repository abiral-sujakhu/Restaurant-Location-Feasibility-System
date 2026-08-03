"""Build model-ready grouped features for a selected map coordinate.

The current model was trained on ``dataset_final_entropy.csv``.  A map click
does not have an exact row in that dataset, so its four factors are estimated
from the nearest samples in the same study area using inverse-distance
weighting.  Exact dataset coordinates retain their stored feature values.
"""

from pathlib import Path
from typing import Dict, Union

import numpy as np
import pandas as pd


FEATURE_RADIUS_M = 500.0
EARTH_RADIUS_M = 6_371_000.0
NEIGHBOR_COUNT = 8

BASE_DIRECTORY = Path(__file__).resolve().parent
FEATURE_DATASET_PATH = (
    BASE_DIRECTORY.parent / "data" / "processed" / "dataset_final_entropy.csv"
)
FACTOR_COLUMNS = ["Demand", "Accessibility", "Competition", "Population"]

FeatureValue = Union[int, float, str]


def load_feature_dataset() -> pd.DataFrame:
    if not FEATURE_DATASET_PATH.exists():
        raise FileNotFoundError(f"Feature dataset not found: {FEATURE_DATASET_PATH}")

    dataset = pd.read_csv(FEATURE_DATASET_PATH)
    required = {"latitude", "longitude", "search_area", *FACTOR_COLUMNS}
    missing = required - set(dataset.columns)
    if missing:
        raise ValueError(
            "The updated feature dataset is missing columns: "
            + ", ".join(sorted(missing))
        )

    for column in ["latitude", "longitude", *FACTOR_COLUMNS]:
        dataset[column] = pd.to_numeric(dataset[column], errors="coerce")

    dataset["search_area"] = dataset["search_area"].astype(str).str.strip()
    return dataset.dropna(subset=list(required)).reset_index(drop=True)


FEATURE_DF = load_feature_dataset()


def calculate_distances_m(
    latitude: float, longitude: float, samples: pd.DataFrame
) -> np.ndarray:
    selected_latitude = np.radians(latitude)
    selected_longitude = np.radians(longitude)
    sample_latitudes = np.radians(samples["latitude"].to_numpy(dtype=float))
    sample_longitudes = np.radians(samples["longitude"].to_numpy(dtype=float))

    latitude_difference = sample_latitudes - selected_latitude
    longitude_difference = sample_longitudes - selected_longitude
    haversine_value = (
        np.sin(latitude_difference / 2.0) ** 2
        + np.cos(selected_latitude)
        * np.cos(sample_latitudes)
        * np.sin(longitude_difference / 2.0) ** 2
    )
    central_angle = 2.0 * np.arcsin(np.sqrt(np.clip(haversine_value, 0.0, 1.0)))
    return EARTH_RADIUS_M * central_angle


def collect_location_features(
    latitude: float, longitude: float, search_area: str
) -> Dict[str, FeatureValue]:
    """Estimate the model's four factors from nearby updated-dataset rows."""

    area_samples = FEATURE_DF[FEATURE_DF["search_area"] == search_area]
    if area_samples.empty:
        raise ValueError(f"No feature samples are available for {search_area}.")

    distances = calculate_distances_m(latitude, longitude, area_samples)
    neighbor_count = min(NEIGHBOR_COUNT, len(area_samples))
    nearest_indices = np.argpartition(distances, neighbor_count - 1)[:neighbor_count]
    nearest_distances = distances[nearest_indices]
    nearest_samples = area_samples.iloc[nearest_indices]

    # At an existing sample coordinate, use its values without interpolation.
    exact_match = np.flatnonzero(nearest_distances < 0.01)
    if exact_match.size:
        values = nearest_samples.iloc[int(exact_match[0])][FACTOR_COLUMNS]
    else:
        weights = 1.0 / np.maximum(nearest_distances, 1.0) ** 2
        values = nearest_samples[FACTOR_COLUMNS].multiply(weights, axis=0).sum()
        values = values / weights.sum()

    result: Dict[str, FeatureValue] = {
        column: round(float(values[column]), 4) for column in FACTOR_COLUMNS
    }
    result["search_area"] = search_area
    return result
