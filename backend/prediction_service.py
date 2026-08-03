# ============================================================
# prediction_service.py
# ============================================================

from pathlib import Path
from typing import Any, Dict

import joblib
import numpy as np
import pandas as pd


BASE_DIRECTORY = Path(__file__).resolve().parent

MODEL_PATH = (
    BASE_DIRECTORY
    / "models"
    / "restaurant_feasibility_pipeline.joblib"
)


if not MODEL_PATH.exists():
    raise FileNotFoundError(
        f"Model file was not found: {MODEL_PATH}"
    )


model_package = joblib.load(
    MODEL_PATH
)


if isinstance(model_package, dict):
    model_pipeline = model_package.get(
        "pipeline"
    )

    model_metadata = model_package.get(
        "metadata",
        {}
    )
else:
    model_pipeline = model_package
    model_metadata = {}


if model_pipeline is None:
    raise ValueError(
        "The saved model package does not contain a pipeline."
    )


# The saved package is the source of truth when the dataset/model changes.
MODEL_FEATURES = model_metadata.get("model_features")
if not MODEL_FEATURES:
    MODEL_FEATURES = list(getattr(model_pipeline, "feature_names_in_", []))
if not MODEL_FEATURES:
    raise ValueError("The saved model does not declare its input features.")


def convert_numpy_value(
    value: Any
) -> Any:
    """
    Convert NumPy values into normal Python values.
    """

    if isinstance(value, np.generic):
        return value.item()

    return value


def class_to_label(
    class_value: Any
) -> str:
    """
    Convert the model class into its readable label.
    """

    class_value = convert_numpy_value(
        class_value
    )

    metadata_mapping = model_metadata.get(
        "label_mapping"
    )

    if isinstance(metadata_mapping, dict):

        if class_value in metadata_mapping:
            return str(
                metadata_mapping[class_value]
            )

        if str(class_value) in metadata_mapping:
            return str(
                metadata_mapping[str(class_value)]
            )

    # The model may already predict textual labels.
    if str(class_value) in {
        "Low",
        "Moderate",
        "High"
    }:
        return str(class_value)

    # Change this only if your saved model predicts encoded
    # numeric target values and no label mapping was saved.
    fallback_mapping = {
        0: "High",
        1: "Low",
        2: "Moderate"
    }

    return fallback_mapping.get(
        class_value,
        str(class_value)
    )


def validate_features(
    location_features: Dict[str, Any]
) -> None:
    """
    Validate the features before prediction.
    """

    missing_features = [
        feature
        for feature in MODEL_FEATURES
        if feature not in location_features
    ]

    if missing_features:
        raise ValueError(
            "Missing model features: "
            + ", ".join(missing_features)
        )


def get_classifier_classes() -> list:
    """
    Obtain class order used by predict_proba.
    """

    if hasattr(model_pipeline, "classes_"):
        return list(
            model_pipeline.classes_
        )

    if hasattr(model_pipeline, "named_steps"):

        for step in reversed(
            list(
                model_pipeline.named_steps.values()
            )
        ):
            if hasattr(step, "classes_"):
                return list(step.classes_)

    return []


def predict_feasibility(
    location_features: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Predict restaurant-location feasibility.
    """

    validate_features(
        location_features
    )

    model_input = pd.DataFrame(
        [location_features],
        columns=MODEL_FEATURES
    )

    predicted_class = model_pipeline.predict(
        model_input
    )[0]

    predicted_class = convert_numpy_value(
        predicted_class
    )

    predicted_label = class_to_label(
        predicted_class
    )

    probabilities: Dict[str, float] = {}

    if hasattr(model_pipeline, "predict_proba"):

        probability_values = (
            model_pipeline.predict_proba(
                model_input
            )[0]
        )

        class_values = get_classifier_classes()

        if not class_values:
            class_values = list(
                range(len(probability_values))
            )

        for class_value, probability in zip(
            class_values,
            probability_values
        ):
            class_value = convert_numpy_value(
                class_value
            )

            label = class_to_label(
                class_value
            )

            probabilities[label] = round(
                float(probability),
                6
            )

    return {
        "predicted_class": predicted_class,
        "predicted_label": predicted_label,
        "confidence": max(probabilities.values()) if probabilities else 1.0,
        "probabilities": probabilities
    }


def get_model_information() -> Dict[str, Any]:
    """
    Return model information for the health endpoint.
    """

    return {
        "model_name": model_metadata.get(
            "model_name",
            type(model_pipeline).__name__
        ),
        "model_features": MODEL_FEATURES
    }
