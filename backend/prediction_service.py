# ============================================================
# prediction_service.py
# ============================================================
# This module:
#
# 1. Loads the saved joblib model package
# 2. Extracts the trained sklearn pipeline
# 3. Validates model features
# 4. Generates the feasibility prediction
# 5. Returns class probabilities

from pathlib import Path
from typing import Any, Dict, Union

import joblib
import numpy as np
import pandas as pd


# ------------------------------------------------------------
# Model path
# ------------------------------------------------------------

BACKEND_DIRECTORY = Path(__file__).resolve().parent

MODEL_PATH = (
    BACKEND_DIRECTORY
    / "models"
    / "restaurant_feasibility_pipeline.joblib"
)


if not MODEL_PATH.exists():
    raise FileNotFoundError(
        "The trained model file was not found.\n"
        f"Expected location: {MODEL_PATH}"
    )


# ------------------------------------------------------------
# Load saved model package
# ------------------------------------------------------------

model_package = joblib.load(MODEL_PATH)


if not isinstance(model_package, dict):
    raise TypeError(
        "The saved joblib file must contain a dictionary with "
        "'pipeline' and 'metadata' entries."
    )


if "pipeline" not in model_package:
    raise KeyError(
        "The saved model package does not contain 'pipeline'."
    )


model_pipeline = model_package["pipeline"]

model_metadata = model_package.get(
    "metadata",
    {}
)


# ------------------------------------------------------------
# Expected model features
# ------------------------------------------------------------

DEFAULT_MODEL_FEATURES = [
    "bank_count_500m",
    "bus_stop_count_500m",
    "cinema_count_500m",
    "clinic_count_500m",
    "college_count_500m",
    "hospital_count_500m",
    "museum_count_500m",
    "office_count_500m",
    "parking_space_count_500m",
    "recreation_count_500m",
    "retail_count_500m",
    "school_count_500m",
    "temple_count_500m",
    "nearest_restaurant_m",
    "competitor_count_500m",
    "avg_restaurant_rating_500m",
    "avg_review_ratings_500m",
    "search_area"
]


MODEL_FEATURES = model_metadata.get(
    "model_features",
    model_metadata.get(
        "feature_names",
        DEFAULT_MODEL_FEATURES
    )
)


# ------------------------------------------------------------
# Label conversion
# ------------------------------------------------------------

DEFAULT_LABEL_MAPPING = {
    0: "High",
    1: "Low",
    2: "Moderate"
}


def normalise_label_mapping(
    raw_mapping: Any
) -> Dict[Any, str]:
    """
    Convert saved label mapping into a consistent dictionary.

    The metadata may store keys as strings or integers.
    """

    if not isinstance(raw_mapping, dict):
        return DEFAULT_LABEL_MAPPING

    cleaned_mapping: Dict[Any, str] = {}

    for key, value in raw_mapping.items():

        try:
            cleaned_key: Any = int(key)
        except (TypeError, ValueError):
            cleaned_key = key

        cleaned_mapping[cleaned_key] = str(value)

    return cleaned_mapping


LABEL_MAPPING = normalise_label_mapping(
    model_metadata.get(
        "label_mapping",
        DEFAULT_LABEL_MAPPING
    )
)


def convert_numpy_value(value: Any) -> Any:
    """
    Convert NumPy scalar values to normal Python values so
    FastAPI can serialize them.
    """

    if isinstance(value, np.generic):
        return value.item()

    return value


def get_label_name(class_value: Any) -> str:
    """
    Convert a predicted class into Low, Moderate or High.
    """

    class_value = convert_numpy_value(class_value)

    if class_value in LABEL_MAPPING:
        return LABEL_MAPPING[class_value]

    class_string = str(class_value)

    if class_string in LABEL_MAPPING:
        return LABEL_MAPPING[class_string]

    # Some models may directly predict text labels.
    if class_string in {"Low", "Moderate", "High"}:
        return class_string

    return class_string


def validate_location_features(
    location_features: Dict[str, Any]
) -> None:
    """
    Confirm that the feature dictionary contains every model
    input expected by the trained pipeline.
    """

    missing_features = [
        feature_name
        for feature_name in MODEL_FEATURES
        if feature_name not in location_features
    ]

    if missing_features:
        raise ValueError(
            "Missing model features: "
            + ", ".join(missing_features)
        )

    if not location_features.get("search_area"):
        raise ValueError(
            "The search_area feature cannot be empty."
        )


def predict_feasibility(
    location_features: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Generate a feasibility prediction from collected location
    features.

    Returns
    -------
    dict
        Contains:
        - predicted_class
        - predicted_label
        - probabilities
    """

    validate_location_features(
        location_features
    )

    # Preserve exactly the feature order expected by the model.
    model_input = pd.DataFrame(
        [location_features],
        columns=MODEL_FEATURES
    )

    predicted_value = model_pipeline.predict(
        model_input
    )[0]

    predicted_value = convert_numpy_value(
        predicted_value
    )

    predicted_label = get_label_name(
        predicted_value
    )

    probabilities: Dict[str, float] = {}

    if hasattr(model_pipeline, "predict_proba"):

        probability_values = model_pipeline.predict_proba(
            model_input
        )[0]

        # Retrieve the final classifier classes.
        classifier = None

        if hasattr(model_pipeline, "named_steps"):
            classifier = model_pipeline.named_steps.get(
                "classifier"
            )

        if classifier is not None and hasattr(
            classifier,
            "classes_"
        ):
            class_values = classifier.classes_
        else:
            class_values = range(
                len(probability_values)
            )

        for class_value, probability in zip(
            class_values,
            probability_values
        ):
            class_value = convert_numpy_value(
                class_value
            )

            class_label = get_label_name(
                class_value
            )

            probabilities[class_label] = round(
                float(probability),
                6
            )

    return {
        "predicted_class": predicted_value,
        "predicted_label": predicted_label,
        "probabilities": probabilities
    }


def get_model_information() -> Dict[str, Any]:
    """
    Return safe model information for the health endpoint.
    """

    return {
        "model_name": model_metadata.get(
            "model_name",
            type(model_pipeline).__name__
        ),

        "test_accuracy": model_metadata.get(
            "test_accuracy"
        ),

        "test_macro_f1": model_metadata.get(
            "test_macro_f1"
        ),

        "model_features": MODEL_FEATURES
    }