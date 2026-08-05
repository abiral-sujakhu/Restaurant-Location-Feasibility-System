# ============================================================
# prediction_service.py
# ============================================================

from pathlib import Path
from typing import Any, Dict

import joblib
import numpy as np
import pandas as pd
import shap

from location_feature_service import FEATURE_DF


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


def _pipeline_parts() -> tuple[Any, Any]:
    """Return the fitted preprocessing and classifier pipeline steps."""
    if not hasattr(model_pipeline, "named_steps"):
        raise ValueError("SHAP explanations require a preprocessing pipeline.")
    preprocessor = model_pipeline.named_steps.get("preprocessor")
    classifier = model_pipeline.named_steps.get("classifier")
    if preprocessor is None or classifier is None:
        raise ValueError("The model pipeline cannot be explained with SHAP.")
    return preprocessor, classifier


def _original_feature_name(transformed_name: str) -> str:
    """Map a transformed column back to the feature a user understands."""
    name = transformed_name.split("__", 1)[-1]
    for feature in MODEL_FEATURES:
        if name == feature or name.startswith(f"{feature}_"):
            return feature
    return name


def _build_shap_explainer() -> tuple[Any, Any, list[str]]:
    """Build one reusable explainer from a representative training background."""
    preprocessor, classifier = _pipeline_parts()
    background_frame = FEATURE_DF[MODEL_FEATURES].sample(
        n=min(100, len(FEATURE_DF)), random_state=42
    )
    background = preprocessor.transform(background_frame)
    if hasattr(background, "toarray"):
        background = background.toarray()
    feature_names = list(preprocessor.get_feature_names_out())
    return shap.LinearExplainer(classifier, background), preprocessor, feature_names


SHAP_EXPLAINER, SHAP_PREPROCESSOR, TRANSFORMED_FEATURE_NAMES = _build_shap_explainer()
EXPLAINED_FEATURES = {
    "Demand",
    "Population",
    "Accessibility",
    "Competition",
}


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
    location_features: Dict[str, Any],
    location_evidence: Dict[str, str] | None = None
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
        "probabilities": probabilities,
        "explanation": explain_prediction(
            model_input, predicted_class, location_evidence or {}
        )
    }


def explain_prediction(
    model_input: pd.DataFrame,
    predicted_class: Any,
    location_evidence: Dict[str, str],
) -> Dict[str, Any]:
    """Explain the predicted class and turn SHAP values into frontend insights."""
    transformed = SHAP_PREPROCESSOR.transform(model_input)
    if hasattr(transformed, "toarray"):
        transformed = transformed.toarray()

    values = np.asarray(SHAP_EXPLAINER(transformed).values)
    classes = [convert_numpy_value(value) for value in get_classifier_classes()]
    class_index = classes.index(predicted_class)
    if values.ndim == 3:
        class_values = values[0, :, class_index]
    elif values.ndim == 2:
        class_values = values[0]
    else:
        raise ValueError(f"Unexpected SHAP output shape: {values.shape}")

    grouped: Dict[str, float] = {}
    for transformed_name, shap_value in zip(TRANSFORMED_FEATURE_NAMES, class_values):
        original_name = _original_feature_name(transformed_name)
        if original_name not in EXPLAINED_FEATURES:
            continue
        grouped[original_name] = grouped.get(original_name, 0.0) + float(shap_value)

    ranked = sorted(grouped.items(), key=lambda item: abs(item[1]), reverse=True)
    max_impact = max((abs(value) for _, value in ranked), default=0.0)
    factors = []
    for feature, shap_value in ranked:
        relative_impact = abs(shap_value) / max_impact if max_impact else 0.0
        strength = (
            "strongly" if relative_impact >= 0.67
            else "moderately" if relative_impact >= 0.33
            else "slightly"
        )
        factors.append({
            "feature": feature,
            "direction": "supports" if shap_value >= 0 else "opposes",
            "strength": strength,
            "impact": round(shap_value, 6),
            "relative_impact": round(relative_impact, 6),
            "description": location_evidence.get(feature, ""),
        })

    leading = factors[:2]
    summary = (
        "; ".join(
            f"{item['feature']} {item['strength']} {item['direction']} this result"
            for item in leading
        ) + "."
        if leading
        else "No model factor had a measurable effect on this result."
    )
    return {
        "explained_label": class_to_label(predicted_class),
        "summary": summary,
        "factors": factors,
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
