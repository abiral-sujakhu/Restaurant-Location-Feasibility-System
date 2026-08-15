# Restaurant Location Feasibility System

A full-stack decision-support application that evaluates potential restaurant locations in selected areas of Kathmandu Valley. Pick a point on the map to receive a **Low**, **Moderate**, or **High** feasibility prediction, inspect the factors behind it, compare saved locations, and export a PDF report.

The application combines a Next.js map interface with a FastAPI prediction service. At runtime, the backend calculates features from locally stored point-of-interest, restaurant, road, and building data; applies a trained machine-learning pipeline; and uses SHAP values to explain the result.

## Features

- Interactive Google Map for selecting candidate locations
- 500 m site analysis around each selected coordinate
- Feasibility classification with class probabilities and confidence
- Four grouped site-condition factors:
  - **Demand** — nearby destinations such as offices, schools, hospitals, retail, and recreation
  - **Accessibility** — bus stops, parking spaces, and road intersections
  - **Competition** — nearby restaurants, ratings, and review activity
  - **Population** — mapped building density as a local proxy
- SHAP-based explanations of the predicted class
- Area benchmarks, percentiles, and a nearby improvement lead
- Demand, accessibility, competition, and population map layers
- Nearby-competitor details and distance histogram
- Save and compare two or three analyzed locations
- Downloadable PDF feasibility report
- Reproducible notebooks for collection, preparation, modeling, deployment, and explanation

## Supported study areas

The current model supports points within **1,500 m** of one of these nine study-area centers:

- Baneshwor
- New Road
- Koteshwor
- Bhaktapur Durbar Square
- Patan Durbar Square
- Boudha Stupa
- Pulchowk
- Durbar Marg
- Kirtipur

Locations outside these areas are rejected because the model and local feature data do not cover them.

## Tech stack

| Layer | Technologies |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS, Google Maps |
| Backend | FastAPI, Pydantic, Uvicorn |
| Data and spatial analysis | pandas, NumPy, SciPy, pyproj, Shapely |
| Machine learning | scikit-learn, joblib, SHAP |
| Research workflow | Jupyter, GeoPandas, OSMnx, Folium, Matplotlib, Seaborn |

## Project structure

```text
.
├── README.md
└── minor_prj/
    ├── backend/
    │   ├── data/                  # Runtime datasets
    │   ├── models/                # Saved ML pipelines
    │   ├── main.py                # FastAPI routes
    │   ├── area_service.py        # Study-area validation
    │   ├── location_feature_service.py
    │   ├── prediction_service.py
    │   └── requirements.txt       # Backend runtime dependencies
    ├── frontend/
    │   ├── app/                   # Next.js App Router pages and styles
    │   ├── components/            # Map, dashboard, charts, and reports
    │   ├── lib/                   # Insights, static maps, and PDF export
    │   └── package.json
    ├── data/
    │   ├── raw_data/
    │   └── processed/
    ├── notebooks/                 # End-to-end research workflow
    ├── outputs/                   # Maps, predictions, metrics, and SHAP plots
    └── requirements.txt           # Full notebook/research environment
```

## Getting started

### Prerequisites

- Python 3.10 or newer
- Node.js 20 or newer
- npm
- A Google Maps API key with the **Maps JavaScript API** enabled
- Optionally, enable the **Maps Static API** to include map images in exported PDF reports

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd grouping_approach
```

Replace `<your-repository-url>` with the URL of your GitHub repository. If you rename the repository, use that directory name in the `cd` command.

### 2. Start the backend

From the repository root:

```bash
cd minor_prj/backend
python -m venv .venv
```

Activate the virtual environment:

```bash
# Windows PowerShell
.venv\Scripts\Activate.ps1

# macOS/Linux
source .venv/bin/activate
```

Install the runtime packages and launch the API:

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The backend will be available at:

- API: http://127.0.0.1:8000
- Interactive API docs: http://127.0.0.1:8000/docs
- Health check: http://127.0.0.1:8000/health

The saved model and runtime datasets are loaded when the API starts, so run the command from `minor_prj/backend` as shown above.

### 3. Configure and start the frontend

Open a second terminal and run:

```bash
cd minor_prj/frontend
npm install
```

Create `minor_prj/frontend/.env.local`:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

Then start the development server:

```bash
npm run dev
```

Open http://localhost:3000 and select a point inside one of the supported study areas.

## API endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/` | Basic service information |
| `GET` | `/health` | Confirms that the model and feature dataset loaded |
| `GET` | `/study-areas` | Returns supported study-area centers and distance limits |
| `POST` | `/predict-location` | Calculates features and predicts feasibility for a coordinate |

Example request:

```bash
curl -X POST "http://127.0.0.1:8000/predict-location" \
  -H "Content-Type: application/json" \
  -d '{"latitude": 27.69396, "longitude": 85.33738}'
```

The prediction response includes the feasibility label, confidence, class probabilities, grouped features, SHAP explanation, nearby-site evidence, area benchmarks, and an improvement lead.

## Research and notebook workflow

To reproduce or explore the data pipeline, create a separate environment from `minor_prj/requirements.txt`, which includes the larger geospatial and notebook toolchain:

```bash
cd minor_prj
python -m venv .venv

# Activate the environment, then:
pip install -r requirements.txt
jupyter lab
```

The numbered notebooks document the intended workflow:

1. Data collection
2. Dataset assembly
3. Feature engineering
4. Random candidate locations
5. Candidate-location features
6. Entropy weighting
7. Data cleaning
8. Exploratory data analysis
9. Model-dataset preparation and training split
10. Model deployment and validation
11. SHAP model explanation

Run data-collection notebooks carefully: they may depend on external services, credentials, or network access. The web application itself performs predictions from the checked-in local datasets and does not call Google Places at runtime.

## Production commands

Check and build the frontend:

```bash
cd minor_prj/frontend
npm run lint
npm run build
npm run start
```

Run the backend without development reload:

```bash
cd minor_prj/backend
uvicorn main:app --host 0.0.0.0 --port 8000
```

For a deployed frontend, set `NEXT_PUBLIC_API_BASE_URL` to the public backend URL and add the frontend origin to the backend CORS configuration in `minor_prj/backend/main.py`.

## Data and model notes

- The model returns three feasibility bands: Low, Moderate, and High.
- Features are calculated within a 500 m radius using the same frozen transforms used for candidate-location training data.
- The deployed artifact is a preprocessing-and-classification pipeline stored with `joblib`.
- SHAP values explain how the four grouped factors support or oppose the predicted class.
- Source datasets were assembled from Google Places and OpenStreetMap-derived data and are stored in the repository for local inference.

## Limitations

- Predictions are valid only for the nine supported study areas and depend on the completeness and age of the stored data.
- Building counts are a proxy for local population, not a direct population measurement.
- Feasibility scores do not account for every business consideration, such as rent, floor area, licensing, operating costs, target cuisine, or real-time foot traffic.
- This project is a decision-support and research tool; its output should not be treated as financial or investment advice.

## Contributing

Issues and pull requests are welcome. When changing feature engineering or training data, regenerate the saved pipeline and verify that its declared input features remain compatible with the backend response schema.

## License

No license has been added yet. Until a license is provided, the repository remains under the copyright of its owner and is not automatically open for reuse or redistribution.
