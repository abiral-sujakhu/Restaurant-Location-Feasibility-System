# ============================================================
# main.py
# ============================================================

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from area_service import (
    MAX_AREA_DISTANCE_M,
    STUDY_AREAS,
    get_study_areas_for_api,
    validate_selected_location
)

from location_feature_service import (
    FEATURE_DF,
    FEATURE_RADIUS_M,
    collect_location_features
)

from prediction_service import (
    get_model_information,
    predict_feasibility
)

from schemas import (
    LocationRequest,
    PredictionResponse,
    StudyAreasResponse
)


app = FastAPI(
    title="Restaurant Location Feasibility API",
    description=(
        "Predicts restaurant-location feasibility using "
        "locally stored POI and restaurant datasets."
    ),
    version="2.0.0"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


@app.get("/")
def root() -> dict:
    """
    Root API endpoint.
    """

    return {
        "message": (
            "Restaurant Location Feasibility API is running."
        ),
        "data_source": "dataset_final_entropy.csv",
        "google_places_api_used": False,
        "supported_area_count": len(STUDY_AREAS),
        "feature_radius_m": FEATURE_RADIUS_M
    }


@app.get("/health")
def health_check() -> dict:
    """
    Confirm successful model and dataset loading.
    """

    return {
        "status": "healthy",
        "model_loaded": True,
        "feature_dataset_loaded": True,
        "feature_sample_count": len(FEATURE_DF),
        **get_model_information()
    }


@app.get(
    "/study-areas",
    response_model=StudyAreasResponse
)
def get_study_areas() -> dict:
    """
    Return the nine valid study areas.
    """

    return {
        "supported_area_count": len(STUDY_AREAS),
        "maximum_allowed_distance_m": (
            MAX_AREA_DISTANCE_M
        ),
        "feature_radius_m": FEATURE_RADIUS_M,
        "study_areas": get_study_areas_for_api()
    }


@app.post(
    "/predict-location",
    response_model=PredictionResponse
)
def predict_selected_location(
    request: LocationRequest
) -> dict:
    """
    Calculate features from local datasets and predict
    feasibility for the selected coordinate.
    """

    try:
        # Step 1: Validate the supported study area.
        area_information = validate_selected_location(
            latitude=request.latitude,
            longitude=request.longitude
        )

        search_area = str(
            area_information["search_area"]
        )

        # Step 2: Calculate all 500 m features from CSV data.
        location_features = collect_location_features(
            latitude=request.latitude,
            longitude=request.longitude,
            search_area=search_area
        )

        # Step 3: Predict using the saved ML pipeline.
        prediction = predict_feasibility(
            location_features
        )

        return {
            "latitude": request.latitude,
            "longitude": request.longitude,

            "area_information": {
                "search_area": search_area,
                "distance_from_area_center_m": float(
                    area_information[
                        "distance_from_area_center_m"
                    ]
                ),
                "maximum_allowed_distance_m": (
                    MAX_AREA_DISTANCE_M
                )
            },

            "predicted_class": prediction[
                "predicted_class"
            ],

            "predicted_label": prediction[
                "predicted_label"
            ],

            "confidence": prediction["confidence"],

            "probabilities": prediction[
                "probabilities"
            ],

            "collected_features": location_features
        }

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        ) from error

    except FileNotFoundError as error:
        raise HTTPException(
            status_code=500,
            detail=str(error)
        ) from error

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=(
                "Prediction failed because of an internal "
                f"server error: {error}"
            )
        ) from error
