# ============================================================
# main.py
# ============================================================
# Main FastAPI application.
#
# Workflow:
#
# Frontend sends latitude and longitude
#               ↓
# Backend validates supported study area
#               ↓
# Backend collects features within 500 meters
#               ↓
# Features are sent to the saved ML pipeline
#               ↓
# API returns Low, Moderate or High prediction

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from area_service import (
    MAX_AREA_DISTANCE_M,
    STUDY_AREAS,
    get_study_areas_for_api,
    validate_selected_location
)

from location_feature_service import (
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


# ------------------------------------------------------------
# FastAPI application
# ------------------------------------------------------------

app = FastAPI(
    title="Restaurant Location Feasibility API",
    description=(
        "Predicts restaurant-location feasibility for selected "
        "coordinates within the nine supported study areas."
    ),
    version="1.0.0"
)


# ------------------------------------------------------------
# CORS configuration
# ------------------------------------------------------------
# Add the correct frontend ports according to your application.
#
# Next.js commonly uses port 3000.
# Vite commonly uses port 5173.

app.add_middleware(
    CORSMiddleware,

    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],

    allow_credentials=True,

    allow_methods=[
        "GET",
        "POST",
        "OPTIONS"
    ],

    allow_headers=["*"]
)


# ------------------------------------------------------------
# Root endpoint
# ------------------------------------------------------------

@app.get("/")
def root() -> dict:
    """
    Confirm that the API server is running.
    """

    return {
        "message": (
            "Restaurant Location Feasibility API is running."
        ),
        "supported_area_count": len(STUDY_AREAS),
        "maximum_selection_distance_m": (
            MAX_AREA_DISTANCE_M
        ),
        "feature_collection_radius_m": FEATURE_RADIUS_M
    }


# ------------------------------------------------------------
# Health endpoint
# ------------------------------------------------------------

@app.get("/health")
def health_check() -> dict:
    """
    Confirm that the API and trained model loaded successfully.
    """

    model_information = get_model_information()

    return {
        "status": "healthy",
        "model_loaded": True,
        **model_information
    }


# ------------------------------------------------------------
# Study-area endpoint
# ------------------------------------------------------------

@app.get(
    "/study-areas",
    response_model=StudyAreasResponse
)
def get_study_areas() -> dict:
    """
    Return all nine study-area centers.

    The frontend can use this endpoint to display:
    - study-area markers
    - 1,500-meter supported circles
    - the 500-meter feature-analysis radius
    """

    return {
        "supported_area_count": len(STUDY_AREAS),

        "maximum_allowed_distance_m": (
            MAX_AREA_DISTANCE_M
        ),

        "feature_radius_m": FEATURE_RADIUS_M,

        "study_areas": get_study_areas_for_api()
    }


# ------------------------------------------------------------
# Prediction endpoint
# ------------------------------------------------------------

@app.post(
    "/predict-location",
    response_model=PredictionResponse
)
def predict_selected_location(
    request: LocationRequest
) -> dict:
    """
    Predict feasibility for a user-selected coordinate.
    """

    try:
        # ----------------------------------------------------
        # Step 1: Validate study-area restriction
        # ----------------------------------------------------

        area_information = validate_selected_location(
            latitude=request.latitude,
            longitude=request.longitude
        )

        search_area = str(
            area_information["search_area"]
        )

        distance_from_area_center_m = float(
            area_information[
                "distance_from_area_center_m"
            ]
        )

        # ----------------------------------------------------
        # Step 2: Collect nearby location features
        # ----------------------------------------------------

        location_features = collect_location_features(
            latitude=request.latitude,
            longitude=request.longitude,
            search_area=search_area
        )

        # ----------------------------------------------------
        # Step 3: Generate model prediction
        # ----------------------------------------------------

        prediction = predict_feasibility(
            location_features
        )

        # ----------------------------------------------------
        # Step 4: Return API response
        # ----------------------------------------------------

        return {
            "latitude": request.latitude,
            "longitude": request.longitude,

            "area_information": {
                "search_area": search_area,

                "distance_from_area_center_m": (
                    distance_from_area_center_m
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