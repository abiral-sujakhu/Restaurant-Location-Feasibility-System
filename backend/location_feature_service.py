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

POI_PATH = BASE_DIRECTORY / "data" / "pois_unique.csv"
INTERSECTION_PATH = BASE_DIRECTORY / "data" / "intersections_all_areas.csv"
RESTAURANT_PATH = BASE_DIRECTORY / "data" / "final_dataset.csv"
BUILDING_PATHS = {
    "Baneshwor": BASE_DIRECTORY / "data" / "buildings_baneshwor.csv",
    "New Road": BASE_DIRECTORY / "data" / "buildings_new_road.csv",
    "Koteshwor": BASE_DIRECTORY / "data" / "buildings_koteshwor.csv",
    "Bhaktapur durbar square": BASE_DIRECTORY / "data" / "buildings_bhaktapur durbar square.csv",
    "Patan durbar square": BASE_DIRECTORY / "data" / "buildings_patan.csv",
    "Boudha stupa": BASE_DIRECTORY / "data" / "buildings_bouddha.csv",
    "Pulchowk": BASE_DIRECTORY / "data" / "buildings_pulchowk.csv",
    "Durbar Marg": BASE_DIRECTORY / "data" / "buildings_durbarmarg.csv",
    "Kirtipur": BASE_DIRECTORY / "data" / "buildings_kirtipur.csv",
}

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


def _load_coordinate_data(path: Path) -> pd.DataFrame:
    data = pd.read_csv(path)
    data["latitude"] = pd.to_numeric(data["latitude"], errors="coerce")
    data["longitude"] = pd.to_numeric(data["longitude"], errors="coerce")
    return data.dropna(subset=["latitude", "longitude"]).reset_index(drop=True)


POI_DF = _load_coordinate_data(POI_PATH)
INTERSECTION_DF = _load_coordinate_data(INTERSECTION_PATH)
RESTAURANT_DF = _load_coordinate_data(RESTAURANT_PATH)
BUILDING_DATA = {
    area: _load_coordinate_data(path) for area, path in BUILDING_PATHS.items()
}


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


def _within_radius(
    latitude: float, longitude: float, samples: pd.DataFrame
) -> tuple[pd.DataFrame, np.ndarray]:
    distances = calculate_distances_m(latitude, longitude, samples)
    mask = distances <= FEATURE_RADIUS_M
    return samples.loc[mask], distances[mask]


def _count_text(counts: dict[str, int], labels: dict[str, str]) -> str:
    parts = [_quantity(counts[key], labels[key]) for key in labels]
    return ", ".join(parts)


def _quantity(count: int, plural_label: str) -> str:
    if count != 1:
        return f"{count} {plural_label}"
    if plural_label.endswith("ies"):
        singular_label = plural_label[:-3] + "y"
    elif plural_label.endswith("s"):
        singular_label = plural_label[:-1]
    else:
        singular_label = plural_label
    return f"1 {singular_label}"


def collect_location_evidence(
    latitude: float, longitude: float, search_area: str
) -> Dict[str, str]:
    """Describe the real local counts underlying each grouped model factor."""
    area_pois = POI_DF[POI_DF["areas_found_in"].astype(str).str.contains(
        search_area, case=False, regex=False, na=False
    )]
    nearby_pois, _ = _within_radius(latitude, longitude, area_pois)
    counts = nearby_pois["poi_type"].value_counts().to_dict()

    anchor_labels = {
        "cinema": "cinemas", "museum": "museums",
        "temple": "temples", "recreation": "recreation venues",
    }
    daytime_labels = {
        "office": "offices", "college": "colleges", "school": "schools",
        "hospital": "hospitals", "clinic": "clinics",
    }
    commercial_labels = {"retail": "retail places", "bank": "banks"}
    normalized_counts = {key: int(counts.get(key, 0)) for key in {
        *anchor_labels, *daytime_labels, *commercial_labels,
        "bus_stop", "parking_space",
    }}

    area_intersections = INTERSECTION_DF[
        INTERSECTION_DF["area"].astype(str).str.casefold() == search_area.casefold()
    ]
    nearby_intersections, _ = _within_radius(
        latitude, longitude, area_intersections
    )

    area_restaurants = RESTAURANT_DF[
        RESTAURANT_DF["search_area"].astype(str).str.casefold() == search_area.casefold()
    ]
    nearby_restaurants, restaurant_distances = _within_radius(
        latitude, longitude, area_restaurants
    )
    nearest_restaurant = (
        int(round(float(restaurant_distances.min())))
        if restaurant_distances.size else None
    )

    nearby_buildings, _ = _within_radius(
        latitude, longitude, BUILDING_DATA[search_area]
    )

    nearest_text = (
        f"; the nearest is about {nearest_restaurant} m away"
        if nearest_restaurant is not None else ""
    )
    return {
        "Demand": (
            "Within 500 m, anchor destinations include "
            f"{_count_text(normalized_counts, anchor_labels)}. Daytime activity includes "
            f"{_count_text(normalized_counts, daytime_labels)}, while commercial activity includes "
            f"{_count_text(normalized_counts, commercial_labels)}."
        ),
        "Accessibility": (
            f"The location has {_quantity(normalized_counts['bus_stop'], 'bus stops')}, "
            f"{_quantity(normalized_counts['parking_space'], 'parking spaces')} and "
            f"{_quantity(len(nearby_intersections), 'road intersections')} within 500 m."
        ),
        "Competition": (
            f"There are {_quantity(len(nearby_restaurants), 'existing restaurants')} within 500 m"
            f"{nearest_text}."
        ),
        "Population": (
            f"There are {_quantity(len(nearby_buildings), 'mapped buildings')} within 500 m, "
            "which the model uses as a proxy for surrounding population density."
        ),
    }
