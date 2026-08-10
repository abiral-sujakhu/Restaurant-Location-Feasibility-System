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
MAX_MAP_POINTS = 600
MAX_POPULATION_MAP_POINTS = 200
COMPETITOR_LIST_CAP = 20
ACCESSIBILITY_POI_TYPES = {"bus_stop", "parking_space"}

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


def _map_points(
    samples: pd.DataFrame,
    category_column: str | None = None,
    category_value: str | None = None,
    cap: int = MAX_MAP_POINTS,
) -> list[Dict[str, FeatureValue]]:
    """Convert a coordinate dataframe into capped, JSON-ready map points."""
    if len(samples) > cap:
        samples = samples.sample(n=cap, random_state=42)

    points: list[Dict[str, FeatureValue]] = []
    for _, row in samples.iterrows():
        point: Dict[str, FeatureValue] = {
            "latitude": float(row["latitude"]),
            "longitude": float(row["longitude"]),
        }
        if category_column is not None:
            point["category"] = str(row[category_column])
        elif category_value is not None:
            point["category"] = category_value
        points.append(point)
    return points


def _nearby_competitors(
    nearby_restaurants: pd.DataFrame, restaurant_distances: np.ndarray
) -> list[Dict[str, FeatureValue]]:
    """Rank nearby restaurants by distance and return their public details."""
    if nearby_restaurants.empty:
        return []

    ordered = nearby_restaurants.copy()
    ordered["_distance_m"] = restaurant_distances
    ordered = ordered.sort_values("_distance_m").head(COMPETITOR_LIST_CAP)

    competitors: list[Dict[str, FeatureValue]] = []
    for _, row in ordered.iterrows():
        rating = row.get("restaurant_rating")
        review_count = row.get("user_rating_count")
        competitors.append({
            "name": str(row.get("restaurant_name") or "Unnamed restaurant"),
            "rating": float(rating) if pd.notna(rating) else None,
            "review_count": int(review_count) if pd.notna(review_count) else None,
            "distance_m": round(float(row["_distance_m"]), 1),
            "latitude": float(row["latitude"]),
            "longitude": float(row["longitude"]),
        })
    return competitors


def collect_site_detail(
    latitude: float, longitude: float, search_area: str
) -> Dict[str, object]:
    """Describe the real local counts underlying each grouped model factor.

    Returns both the prose ``evidence`` shown per SHAP factor (unchanged from
    before) and the structured data needed by the frontend's Factor
    Breakdown, Competition list, and Location Snapshot map layers -- all
    derived from the same radius queries, computed once.
    """
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
    evidence = {
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

    raw_counts = {
        "demand": {
            key: normalized_counts[key]
            for key in {*anchor_labels, *daytime_labels, *commercial_labels}
        },
        "accessibility": {
            "bus_stop": normalized_counts["bus_stop"],
            "parking_space": normalized_counts["parking_space"],
            "intersection": len(nearby_intersections),
        },
        "competition": {
            "competitor_count": len(nearby_restaurants),
            "nearest_restaurant_m": nearest_restaurant,
        },
        "population": {
            "building_count": len(nearby_buildings),
        },
    }

    nearby_competitors = _nearby_competitors(nearby_restaurants, restaurant_distances)

    demand_pois = nearby_pois[~nearby_pois["poi_type"].isin(ACCESSIBILITY_POI_TYPES)]
    accessibility_pois = nearby_pois[nearby_pois["poi_type"].isin(ACCESSIBILITY_POI_TYPES)]
    map_layers = {
        "demand_points": _map_points(demand_pois, category_column="poi_type"),
        "accessibility_points": (
            _map_points(accessibility_pois, category_column="poi_type")
            + _map_points(nearby_intersections, category_value="intersection")
        ),
        "competition_points": nearby_competitors,
        # Rendered as discrete pins on the frontend (Google discontinued the
        # Maps JS API's heatmap layer), so this stays well under
        # MAX_MAP_POINTS -- building counts within radius can run into the
        # thousands, which would be an unreadable cluster of individual pins.
        "population_points": _map_points(nearby_buildings, cap=MAX_POPULATION_MAP_POINTS),
    }

    return {
        "evidence": evidence,
        "raw_counts": raw_counts,
        "nearby_competitors": nearby_competitors,
        "map_layers": map_layers,
    }
