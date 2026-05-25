# ML Service

Python FastAPI microservice providing price prediction, anomaly detection, and service categorization for the marketplace.

## Endpoints

| Method | Path | Class | Purpose |
|---|---|---|---|
| POST | `/predict-price` | `PricePredictor` | Returns a fair price range for a service category, location, and freelancer rating |
| POST | `/detect-anomalies` | `AnomalyDetector` | Flags outlier prices in a dataset using Isolation Forest |
| POST | `/categorize-service` | `ServiceCategorizer` | Validates that a service description matches its selected category |
| POST | `/forecast-demand` | `ForecastingService` | (P2 stub) Demand forecasting using Prophet |

Interactive docs available at `/docs` when running.

## Structure

```
ml-service/
├── app/
│   ├── main.py                  # FastAPI app + router registration
│   ├── models/
│   │   ├── price_predictor.py   # scikit-learn regression
│   │   ├── anomaly_detector.py  # Isolation Forest
│   │   ├── service_categorizer.py  # Hugging Face sentence-transformers
│   │   └── forecasting_service.py  # Prophet (P2 stub)
│   ├── schemas/                 # Pydantic request/response models
│   ├── data/
│   │   ├── db.py                # Supabase read connection
│   │   └── seed_loader.py       # Loads demo pricing data for cold start
│   └── trained_models/          # Serialized .pkl files (gitignored)
├── tests/
├── requirements.txt
├── Dockerfile
└── railway.toml
```

## Setup

### Local development

```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

Copy `.env.example` to `.env` at the repo root and fill in your values. The service loads it automatically on startup — no per-service file needed.

```bash
cp .env.example .env   # repo root — fill in your values
```

Start the server:

```bash
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` for the interactive Swagger UI.

### Environment variables

All read from the root `.env` file. See `.env.example` for where to find each value.

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Bypasses RLS to read aggregate transaction data across all users — **never expose to the browser** |
| `PORT` | no | Server port; Railway sets this automatically in production, defaults to 8000 locally |

## Training the models

On first run (or when enough new transaction data has accumulated), train and serialize the models. 

### Local Training
To train the models locally (which will save serialized `.pkl` files to `app/trained_models/`):

```bash
# Ensure your virtual environment is active
source .venv/bin/activate

# Train the price predictor and anomaly detector
python -m app.models.price_predictor --train
python -m app.models.anomaly_detector --train
```

### Production Training (Direct CLI)
To manually trigger a training run against the live production Supabase database:
1. Ensure your root `.env` contains the production `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (linked to `buubkphmzsrnkslltzxn.supabase.co`).
2. Run the exact training command:
```bash
source .venv/bin/activate
python -m app.models.price_predictor --train
```

### Automatic Production Training on Railway
Because `price_predictor.pkl` is gitignored, the model is trained automatically in production **during the container startup/deployment phase** using Railway's configured environment variables. 

The `Dockerfile` handles this automatically using the following entrypoint command:
```dockerfile
CMD ["sh", "-c", "python -m app.models.price_predictor --train && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

This guarantees that:
1. The model is trained dynamically using your live production database transactions.
2. The `/predict-price/health` health check endpoint will return `{"status": "ok", "model_loaded": true}` in production without requiring manual model file uploads.

## Cold start

At launch the database has no transaction data. The `seed_loader.py` script populates the database with realistic demo pricing for common service categories (graphic design, web development, landscaping, tutoring, photography) so the Market Comparator works from day one.

```bash
python -m app.data.seed_loader
```

## Deployment (Railway)

The service deploys automatically from the `ml-service/` directory on push to `main`.

### Step-by-Step Railway Deployment
1. **Push to GitHub**: Push your local changes to the `main` branch:
   ```bash
   git push origin main
   ```
2. **Environment Variables**: In your Railway dashboard under your service's **Variables**, set:
   - `SUPABASE_URL`: `https://buubkphmzsrnkslltzxn.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY`: `<your-production-service-role-key>`
3. **Automatic Build**: Railway automatically detects the `Dockerfile` and builds the container. During startup, the container trains the model on the production database and spins up the FastAPI app.
4. **Link Supabase Edge Functions**: Once Railway assigns a public domain (e.g., `https://ml-service-production.up.railway.app`), set the `ML_SERVICE_URL` secret in Supabase:
   ```bash
   supabase secrets set ML_SERVICE_URL=https://your-railway-url.railway.app --project-ref buubkphmzsrnkslltzxn
   ```

### Verifying Deployed Health
To verify that the model is successfully loaded in the production environment, make a request to the health endpoint:
```bash
curl https://your-railway-url.railway.app/predict-price/health
```
**Expected Response:**
```json
{
  "status": "ok",
  "model_loaded": true
}
```

## Testing

Tests use [pytest](https://pytest.org). Unit tests exercise classes directly; integration/API tests use FastAPI's `TestClient` against the full app.

### Run all tests

```bash
cd ml-service
source .venv/bin/activate
python -m pytest tests/ -v
```

### Test files

| File | Type | What is tested |
|---|---|---|
| `tests/test_ml_endpoints.py` | API integration | All three HTTP endpoints (`/predict-price`, `/detect-anomalies`, `/categorize-service`), validation, edge cases, happy paths |
| `tests/test_price_predictor.py` | Unit | `PricePredictor` heuristic fallback, rating multiplier math, price-range invariants, singleton, all 15 known categories |
| `tests/test_anomaly_detector.py` | Unit | `AnomalyDetector.detect` — threshold (< 5 prices), extreme outlier detection, response shape, valid index bounds |
| `tests/test_service_categorizer.py` | Unit | `ServiceCategorizer.categorize` — known matches/mismatches, confidence range, all category display names, unknown-slug humanisation |
| `tests/test_schemas.py` | Unit | Pydantic request/response schemas — required fields, boundary validation, type coercion, default values |
| `tests/test_forecasting.py` | Unit | `ForecastingService` P2 stub contract (`NotImplementedError`), `ForecastDemandRequest`/`PriceTrendRequest` schema defaults |

### Notes

- `test_service_categorizer.py` loads the `all-MiniLM-L6-v2` sentence-transformer (~80 MB) on first run; it is cached automatically for subsequent runs.
- The `PricePredictor` singleton is reset between test classes via an `autouse` fixture to prevent state leakage.
- Integration tests (`test_ml_endpoints.py`) do not require a running database — the predictor falls back to its heuristic when no trained model is present.
