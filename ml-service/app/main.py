"""
main.py — FastAPI application entry point.

Registers all three ML routers and configures CORS so the React
frontend (Vercel) and Supabase Edge Functions can call the service.
"""
import os
from pathlib import Path
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from prometheus_fastapi_instrumentator import Instrumentator

from app.models.price_predictor import router as price_router
from app.models.anomaly_detector import router as anomaly_router
from app.models.service_categorizer import router as category_router
from app.models.forecasting_service import router as forecasting_router

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

# Initialize Sentry if configured
sentry_dsn = os.getenv("SENTRY_DSN")
if sentry_dsn:
    sentry_sdk.init(
        dsn=sentry_dsn,
        integrations=[FastApiIntegration()],
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
        environment=os.getenv("ENV", "production"),
    )

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Setup structured logging on startup
    from app.core.logging import setup_logging
    setup_logging()
    yield

app = FastAPI(
    title="Fairlance ML Service",
    description=(
        "Price prediction, anomaly detection, and service categorization "
        "for the Fairlance freelance marketplace."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# Expose Prometheus metrics
Instrumentator().instrument(app).expose(app)

# Allow the Vercel frontend and Supabase Edge Functions to call this service.
# In production, tighten allowed_origins to your exact domains.
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://localhost:3000",
    ).split(",")
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

app.include_router(price_router)
app.include_router(anomaly_router)
app.include_router(category_router)
app.include_router(forecasting_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "fairlance-ml"}