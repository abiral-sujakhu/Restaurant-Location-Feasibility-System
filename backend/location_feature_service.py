"""Build model-ready grouped features for a selected map coordinate.

For every map click, the raw neighborhood criteria are calculated directly
from the same 500 m source-data queries used to prepare candidate/background
training locations.  Those raw values are then transformed into Demand,
Accessibility, Competition, and Population with the frozen candidate-location
normalization ranges from training.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Union

import numpy as np
import pandas as pd
from pyproj import Transformer
from scipy.spatial import cKDTree
from shapely import wkt
from shapely.geometry import LineString, Point
from shapely.strtree import STRtree


FEATURE_RADIUS_M = 500.0
MAX_MAP_POINTS = 600
MAX_POPULATION_MAP_POINTS = 200
COMPETITOR_LIST_CAP = 20
ACCESSIBILITY_POI_TYPES = {"bus_stop", "parking_space"}
MAIN_ROAD_TYPES = {"primary", "trunk", "secondary"}

BASE_DIRECTORY = Path(__file__).resolve().parent
FEATURE_DATASET_PATH = (
    BASE_DIRECTORY.parent / "data" / "processed" / "dataset_final_entropy.csv"
)
BACKGROUND_REFERENCE_PATH = (
    BASE_DIRECTORY.parent / "data" / "processed" / "background_points.csv"
)
BUILDING_COMBINED_PATH = (
    BASE_DIRECTORY.parent / "data" / "processed" / "buildings_combined.csv"
)
ROAD_PATH = (
    BASE_DIRECTORY.parent / "data" / "raw_data" / "roads" / "roads_all_areas.csv"
)
FACTOR_COLUMNS = ["Demand", "Accessibility", "Competition", "Population"]

POI_PATH = BASE_DIRECTORY / "data" / "pois_unique.csv"
INTERSECTION_PATH = BASE_DIRECTORY / "data" / "intersections_all_areas.csv"
RESTAURANT_PATH = BASE_DIRECTORY / "data" / "final_dataset.csv"

DEMAND_ANCHOR_COLUMNS = [
    "cinema_count_500m",
    "museum_count_500m",
    "temple_count_500m",
    "recreation_count_500m",
]
DEMAND_DAYTIME_COLUMNS = [
    "office_count_500m",
    "college_count_500m",
    "school_count_500m",
    "hospital_count_500m",
    "clinic_count_500m",
]
DEMAND_COMMERCIAL_COLUMNS = [
    "retail_count_500m",
    "bank_count_500m",
]
ACCESSIBILITY_BENEFIT_COLUMNS = [
    "bus_stop_count_500m",
    "parking_space_count_500m",
    "intersection_count_500m",
]
ACCESSIBILITY_COST_COLUMNS = ["dist_to_main_road_m"]
COMPETITION_BENEFIT_COLUMNS = ["nearest_restaurant_m"]
COMPETITION_COST_COLUMNS = [
    "competitor_count_500m",
    "avg_restaurant_rating_500m",
    "avg_review_ratings_500m",
]
POPULATION_COLUMN = "building_count_500m"

RAW_FACTOR_COLUMNS = [
    *DEMAND_ANCHOR_COLUMNS,
    *DEMAND_DAYTIME_COLUMNS,
    *DEMAND_COMMERCIAL_COLUMNS,
    *ACCESSIBILITY_BENEFIT_COLUMNS,
    *ACCESSIBILITY_COST_COLUMNS,
    *COMPETITION_BENEFIT_COLUMNS,
    *COMPETITION_COST_COLUMNS,
    POPULATION_COLUMN,
]

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
    if not path.exists():
        raise FileNotFoundError(f"Coordinate dataset not found: {path}")
    data = pd.read_csv(path)
    data["latitude"] = pd.to_numeric(data["latitude"], errors="coerce")
    data["longitude"] = pd.to_numeric(data["longitude"], errors="coerce")
    return data.dropna(subset=["latitude", "longitude"]).reset_index(drop=True)


POI_DF = _load_coordinate_data(POI_PATH).drop_duplicates("place_id").reset_index(drop=True)
INTERSECTION_DF = (
    _load_coordinate_data(INTERSECTION_PATH)
    .drop_duplicates(subset=["latitude", "longitude"])
    .reset_index(drop=True)
)
RESTAURANT_DF = _load_coordinate_data(RESTAURANT_PATH)
BUILDING_DF = (
    _load_coordinate_data(BUILDING_COMBINED_PATH)
    .drop_duplicates(subset=["latitude", "longitude"])
    .reset_index(drop=True)
)


def _load_normalization_bounds() -> Dict[str, tuple[float, float]]:
    """Load the candidate-location min/max values used during model preparation."""
    if not BACKGROUND_REFERENCE_PATH.exists():
        raise FileNotFoundError(
            f"Candidate normalization reference not found: {BACKGROUND_REFERENCE_PATH}"
        )

    reference = pd.read_csv(BACKGROUND_REFERENCE_PATH)
    missing = set(RAW_FACTOR_COLUMNS) - set(reference.columns)
    if missing:
        raise ValueError(
            "The candidate normalization reference is missing columns: "
            + ", ".join(sorted(missing))
        )

    bounds: Dict[str, tuple[float, float]] = {}
    for column in RAW_FACTOR_COLUMNS:
        # The original candidate pipeline treated missing competition averages
        # as zero before fitting its min/max transformation.
        values = pd.to_numeric(reference[column], errors="coerce").fillna(0.0)
        bounds[column] = (float(values.min()), float(values.max()))
    return bounds


NORMALIZATION_BOUNDS = _load_normalization_bounds()

_TO_UTM = Transformer.from_crs("EPSG:4326", "EPSG:32645", always_xy=True)


def _project_coordinates(data: pd.DataFrame) -> np.ndarray:
    x, y = _TO_UTM.transform(
        data["longitude"].to_numpy(dtype=float),
        data["latitude"].to_numpy(dtype=float),
    )
    return np.column_stack((np.asarray(x, dtype=float), np.asarray(y, dtype=float)))


POI_XY = _project_coordinates(POI_DF)
INTERSECTION_XY = _project_coordinates(INTERSECTION_DF)
RESTAURANT_XY = _project_coordinates(RESTAURANT_DF)
BUILDING_XY = _project_coordinates(BUILDING_DF)

POI_TREE = cKDTree(POI_XY)
INTERSECTION_TREE = cKDTree(INTERSECTION_XY)
RESTAURANT_TREE = cKDTree(RESTAURANT_XY)
BUILDING_TREE = cKDTree(BUILDING_XY)


def _load_main_roads() -> list[LineString]:
    if not ROAD_PATH.exists():
        raise FileNotFoundError(f"Road dataset not found: {ROAD_PATH}")

    roads = pd.read_csv(ROAD_PATH)
    required = {"highway", "geometry_wkt"}
    missing = required - set(roads.columns)
    if missing:
        raise ValueError(
            "The road dataset is missing columns: " + ", ".join(sorted(missing))
        )

    main_roads = roads[roads["highway"].isin(MAIN_ROAD_TYPES)]
    projected_lines: list[LineString] = []
    for geometry_text in main_roads["geometry_wkt"].dropna():
        geometry = wkt.loads(geometry_text)
        x, y = _TO_UTM.transform(*geometry.xy)
        projected_lines.append(LineString(zip(x, y)))

    if not projected_lines:
        raise ValueError("No primary, trunk, or secondary roads are available.")
    return projected_lines


MAIN_ROAD_LINES = _load_main_roads()
MAIN_ROAD_TREE = STRtree(MAIN_ROAD_LINES)


@dataclass
class LocationNeighborhood:
    raw_features: Dict[str, float]
    nearby_pois: pd.DataFrame
    nearby_intersections: pd.DataFrame
    nearby_restaurants: pd.DataFrame
    restaurant_distances: np.ndarray
    nearby_buildings: pd.DataFrame


def _selected_point_xy(latitude: float, longitude: float) -> np.ndarray:
    x, y = _TO_UTM.transform(longitude, latitude)
    return np.asarray([float(x), float(y)], dtype=float)


def _query_neighborhood(
    tree: cKDTree,
    coordinates: np.ndarray,
    data: pd.DataFrame,
    selected_xy: np.ndarray,
) -> tuple[pd.DataFrame, np.ndarray]:
    indices = np.asarray(
        tree.query_ball_point(selected_xy, FEATURE_RADIUS_M),
        dtype=int,
    )
    if not indices.size:
        return data.iloc[0:0].copy(), np.asarray([], dtype=float)

    distances = np.linalg.norm(coordinates[indices] - selected_xy, axis=1)
    return data.iloc[indices].copy(), distances


def _nearest_main_road_distance_m(selected_xy: np.ndarray) -> float:
    point = Point(float(selected_xy[0]), float(selected_xy[1]))
    nearest = MAIN_ROAD_TREE.nearest(point)
    line = MAIN_ROAD_LINES[int(nearest)] if isinstance(nearest, (int, np.integer)) else nearest
    return round(float(point.distance(line)), 1)


def _collect_location_neighborhood(
    latitude: float,
    longitude: float,
) -> LocationNeighborhood:
    """Collect the raw criteria for one candidate using the training-time engine."""
    selected_xy = _selected_point_xy(latitude, longitude)

    nearby_pois, _ = _query_neighborhood(
        POI_TREE, POI_XY, POI_DF, selected_xy
    )
    nearby_intersections, _ = _query_neighborhood(
        INTERSECTION_TREE, INTERSECTION_XY, INTERSECTION_DF, selected_xy
    )
    nearby_restaurants, restaurant_distances = _query_neighborhood(
        RESTAURANT_TREE, RESTAURANT_XY, RESTAURANT_DF, selected_xy
    )
    nearby_buildings, _ = _query_neighborhood(
        BUILDING_TREE, BUILDING_XY, BUILDING_DF, selected_xy
    )

    poi_counts = nearby_pois["poi_type"].value_counts().to_dict()
    raw_features: Dict[str, float] = {
        column: float(poi_counts.get(column.removesuffix("_count_500m"), 0))
        for column in [
            *DEMAND_ANCHOR_COLUMNS,
            *DEMAND_DAYTIME_COLUMNS,
            *DEMAND_COMMERCIAL_COLUMNS,
            "bus_stop_count_500m",
            "parking_space_count_500m",
        ]
    }
    raw_features["intersection_count_500m"] = float(len(nearby_intersections))
    raw_features["building_count_500m"] = float(len(nearby_buildings))
    raw_features["competitor_count_500m"] = float(len(nearby_restaurants))

    ratings = pd.to_numeric(
        nearby_restaurants["restaurant_rating"], errors="coerce"
    )
    reviews = pd.to_numeric(
        nearby_restaurants["user_rating_count"], errors="coerce"
    )
    raw_features["avg_restaurant_rating_500m"] = (
        float(ratings.mean()) if ratings.notna().any() else 0.0
    )
    raw_features["avg_review_ratings_500m"] = (
        float(reviews.mean()) if reviews.notna().any() else 0.0
    )

    nearest_restaurant_m, _ = RESTAURANT_TREE.query(selected_xy, k=1)
    raw_features["nearest_restaurant_m"] = float(nearest_restaurant_m)
    raw_features["dist_to_main_road_m"] = _nearest_main_road_distance_m(selected_xy)

    return LocationNeighborhood(
        raw_features=raw_features,
        nearby_pois=nearby_pois,
        nearby_intersections=nearby_intersections,
        nearby_restaurants=nearby_restaurants,
        restaurant_distances=restaurant_distances,
        nearby_buildings=nearby_buildings,
    )


def get_area_samples(search_area: str) -> pd.DataFrame:
    """All analyzed dataset rows for one study area, used for comparisons."""
    area_samples = FEATURE_DF[FEATURE_DF["search_area"] == search_area]
    if area_samples.empty:
        raise ValueError(f"No feature samples are available for {search_area}.")
    return area_samples


def _normalized_value(column: str, value: float, benefit: bool) -> float:
    """Apply the frozen candidate-location min/max transformation.

    Deployment values are clipped to the fitted range so an unusually dense or
    sparse new site cannot produce a factor outside the model's training scale.
    """
    minimum, maximum = NORMALIZATION_BOUNDS[column]
    if maximum == minimum:
        return 0.0 if benefit else 1.0

    normalized = (
        (value - minimum) / (maximum - minimum)
        if benefit
        else (maximum - value) / (maximum - minimum)
    )
    return float(np.clip(normalized, 0.0, 1.0))


def _mean_normalized(
    raw_features: Dict[str, float],
    columns: list[str],
    benefit: bool,
) -> float:
    return float(np.mean([
        _normalized_value(column, raw_features[column], benefit)
        for column in columns
    ]))


def _group_raw_features(
    raw_features: Dict[str, float],
    search_area: str,
) -> Dict[str, FeatureValue]:
    """Recreate the four grouped model factors from direct local criteria."""
    anchor = _mean_normalized(raw_features, DEMAND_ANCHOR_COLUMNS, benefit=True)
    daytime = _mean_normalized(raw_features, DEMAND_DAYTIME_COLUMNS, benefit=True)
    commercial = _mean_normalized(
        raw_features, DEMAND_COMMERCIAL_COLUMNS, benefit=True
    )
    demand = float(np.mean([anchor, daytime, commercial]))

    accessibility_parts = [
        *[
            _normalized_value(column, raw_features[column], benefit=True)
            for column in ACCESSIBILITY_BENEFIT_COLUMNS
        ],
        *[
            _normalized_value(column, raw_features[column], benefit=False)
            for column in ACCESSIBILITY_COST_COLUMNS
        ],
    ]
    accessibility = float(np.mean(accessibility_parts))

    competition_parts = [
        *[
            _normalized_value(column, raw_features[column], benefit=True)
            for column in COMPETITION_BENEFIT_COLUMNS
        ],
        *[
            _normalized_value(column, raw_features[column], benefit=False)
            for column in COMPETITION_COST_COLUMNS
        ],
    ]
    competition = float(np.mean(competition_parts))
    population = _normalized_value(
        POPULATION_COLUMN,
        raw_features[POPULATION_COLUMN],
        benefit=True,
    )

    return {
        "Demand": round(demand, 4),
        "Accessibility": round(accessibility, 4),
        "Competition": round(competition, 4),
        "Population": round(population, 4),
        "search_area": search_area,
    }


def collect_location_features(
    latitude: float, longitude: float, search_area: str
) -> Dict[str, FeatureValue]:
    """Calculate model factors from this coordinate's direct 500 m data."""
    neighborhood = _collect_location_neighborhood(latitude, longitude)
    return _group_raw_features(neighborhood.raw_features, search_area)


MEANINGFUL_LEAD_ABSOLUTE_GAP = 0.15
MEANINGFUL_LEAD_RELATIVE_RATIO = 1.25
NEAR_ZERO_CURRENT_VALUE = 0.02


def compute_benchmark(
    area_samples: pd.DataFrame, current_values: Dict[str, FeatureValue]
) -> Dict[str, Dict[str, float]]:
    """Per-factor mean/median/percentile within this location's own study area.

    Percentile is computed directly on the stored (already cost-inverted for
    Competition) factor columns, so "higher percentile" means "more favorable"
    for all four factors uniformly -- no separate inversion handling needed here.
    """
    benchmark: Dict[str, Dict[str, float]] = {}
    for column in FACTOR_COLUMNS:
        series = area_samples[column]
        value = float(current_values[column])
        percentile = float((series < value).mean() * 100.0)
        benchmark[column] = {
            "mean": round(float(series.mean()), 4),
            "median": round(float(series.median()), 4),
            "percentile": round(percentile, 1),
        }
    return benchmark


def find_improvement_lead(
    area_samples: pd.DataFrame,
    weakest_factor: str,
    current_value: float,
) -> Dict[str, FeatureValue] | None:
    """Best same-area sample for the weakest factor, if meaningfully better.

    Returns None (never a fabricated/marginal lead) unless the best nearby
    sample clears an absolute or relative improvement bar.
    """
    if area_samples.empty:
        return None

    best_row = area_samples.loc[area_samples[weakest_factor].idxmax()]
    best_value = float(best_row[weakest_factor])

    absolute_gap = best_value - current_value
    clears_absolute_bar = absolute_gap >= MEANINGFUL_LEAD_ABSOLUTE_GAP
    clears_relative_bar = (
        current_value >= NEAR_ZERO_CURRENT_VALUE
        and best_value >= current_value * MEANINGFUL_LEAD_RELATIVE_RATIO
    )
    if not (clears_absolute_bar or clears_relative_bar):
        return None

    return {
        "factor": weakest_factor,
        "current_value": round(current_value, 4),
        "best_nearby_value": round(best_value, 4),
        "best_nearby_latitude": float(best_row["latitude"]),
        "best_nearby_longitude": float(best_row["longitude"]),
    }


# Internal category key -> RESTAURANT_DF column already carrying that count near each existing
# restaurant. "_intersection_count_500m" / "_building_count_500m" are not in final_dataset.csv and
# are computed once below with the same helpers used for a live query.
_DEMAND_TYPICAL_COLUMNS = {
    "cinema": "cinema_count_500m",
    "museum": "museum_count_500m",
    "temple": "temple_count_500m",
    "recreation": "recreation_count_500m",
    "office": "office_count_500m",
    "college": "college_count_500m",
    "school": "school_count_500m",
    "hospital": "hospital_count_500m",
    "clinic": "clinic_count_500m",
    "retail": "retail_count_500m",
    "bank": "bank_count_500m",
}
_ACCESSIBILITY_TYPICAL_COLUMNS = {
    "bus_stop": "bus_stop_count_500m",
    "parking_space": "parking_space_count_500m",
    "intersection": "_intersection_count_500m",
}
_COMPETITION_TYPICAL_COLUMN = "competitor_count_500m"
_POPULATION_TYPICAL_COLUMN = "_building_count_500m"


def _compute_typical_reference() -> pd.DataFrame:
    """Augment a RESTAURANT_DF copy with intersection/building counts within 500 m of each
    existing restaurant, using the same global spatial indexes as a live query.
    "Typical" is deliberately anchored to existing restaurant locations (not an unbiased area
    grid): it answers "is my site as good as where restaurants already succeed," and lets 12 of
    14 categories reuse final_dataset.csv's already-precomputed columns instead of a full re-scan.
    """
    reference = RESTAURANT_DF.copy()
    reference["_intersection_count_500m"] = [
        len(INTERSECTION_TREE.query_ball_point(point, FEATURE_RADIUS_M))
        for point in RESTAURANT_XY
    ]
    reference["_building_count_500m"] = [
        len(BUILDING_TREE.query_ball_point(point, FEATURE_RADIUS_M))
        for point in RESTAURANT_XY
    ]

    return reference


TYPICAL_REFERENCE = _compute_typical_reference()


def compute_typical_counts(search_area: str) -> Dict[str, Dict[str, float]]:
    """Average per-category counts near existing restaurants in this area."""
    area_rows = TYPICAL_REFERENCE[
        TYPICAL_REFERENCE["search_area"].astype(str).str.casefold() == search_area.casefold()
    ]
    if area_rows.empty:
        return {"demand": {}, "accessibility": {}, "competition": {}, "population": {}}

    def _mean(column: str) -> float:
        return round(float(area_rows[column].mean()), 1)

    return {
        "demand": {key: _mean(column) for key, column in _DEMAND_TYPICAL_COLUMNS.items()},
        "accessibility": {key: _mean(column) for key, column in _ACCESSIBILITY_TYPICAL_COLUMNS.items()},
        "competition": {"competitor_count": _mean(_COMPETITION_TYPICAL_COLUMN)},
        "population": {"building_count": _mean(_POPULATION_TYPICAL_COLUMN)},
    }


DISTANCE_BUCKET_SIZE_M = 100.0
DISTANCE_BUCKET_COUNT = 5


def _competitor_distance_histogram(distances: np.ndarray) -> list[Dict[str, FeatureValue]]:
    """Fixed 100 m buckets over the full 0-500 m radius, from the uncapped distance array --
    computed before _nearby_competitors() truncates to its top-20-by-distance display list."""
    buckets: list[Dict[str, FeatureValue]] = []
    for index in range(DISTANCE_BUCKET_COUNT):
        start = index * DISTANCE_BUCKET_SIZE_M
        end = start + DISTANCE_BUCKET_SIZE_M
        is_last_bucket = index == DISTANCE_BUCKET_COUNT - 1
        in_bucket = (
            (distances >= start) & (distances <= end)
            if is_last_bucket
            else (distances >= start) & (distances < end)
        )
        buckets.append({
            "start_m": start,
            "end_m": end,
            "count": int(np.sum(in_bucket)),
        })
    return buckets


def _readable_category(raw_type: object) -> str | None:
    if not isinstance(raw_type, str) or not raw_type.strip():
        return None
    return raw_type.replace("_", " ").strip().capitalize()


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
            "category": _readable_category(row.get("primary_type")),
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
    neighborhood = _collect_location_neighborhood(latitude, longitude)
    raw_features = neighborhood.raw_features
    nearby_pois = neighborhood.nearby_pois
    nearby_intersections = neighborhood.nearby_intersections
    nearby_restaurants = neighborhood.nearby_restaurants
    restaurant_distances = neighborhood.restaurant_distances
    nearby_buildings = neighborhood.nearby_buildings

    anchor_labels = {
        "cinema": "cinemas", "museum": "museums",
        "temple": "temples", "recreation": "recreation venues",
    }
    daytime_labels = {
        "office": "offices", "college": "colleges", "school": "schools",
        "hospital": "hospitals", "clinic": "clinics",
    }
    commercial_labels = {"retail": "retail places", "bank": "banks"}
    normalized_counts = {
        key: int(raw_features[f"{key}_count_500m"])
        for key in {
            *anchor_labels,
            *daytime_labels,
            *commercial_labels,
            "bus_stop",
            "parking_space",
        }
    }
    nearest_restaurant = int(round(raw_features["nearest_restaurant_m"]))

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
    typical_counts = compute_typical_counts(search_area)
    competitor_distance_histogram = _competitor_distance_histogram(restaurant_distances)

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
        "typical_counts": typical_counts,
        "nearby_competitors": nearby_competitors,
        "competitor_distance_histogram": competitor_distance_histogram,
        "map_layers": map_layers,
    }
