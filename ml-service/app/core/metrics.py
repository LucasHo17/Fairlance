from prometheus_client import Counter, Gauge

# Counter for price prediction requests
PREDICTION_REQUESTS = Counter(
    "ml_price_predictions_total",
    "Total number of price prediction requests processed",
    ["category", "status"]
)

# Counters for anomaly detection
ANOMALY_DETECTION_REQUESTS = Counter(
    "ml_anomaly_detections_total",
    "Total number of anomaly detection requests processed",
    ["status"]
)

ANOMALIES_FOUND = Counter(
    "ml_anomalies_found_total",
    "Total number of anomalies detected in pricing data"
)

# Counter for service categorization
SERVICE_CATEGORIZATIONS = Counter(
    "ml_service_categorizations_total",
    "Total number of service categorization checks performed",
    ["claimed_category", "match"]
)

# Operational metrics for model retraining
MODEL_TRAINING_RUNS = Counter(
    "ml_model_training_runs_total",
    "Total number of model retraining runs",
    ["status"]
)

MODEL_TRAINING_DURATION = Gauge(
    "ml_model_training_duration_seconds",
    "Duration of the last successful model retraining run in seconds"
)

DATA_SAMPLES_TRAINED = Gauge(
    "ml_data_samples_trained_total",
    "Number of completed transaction data samples the model was last trained on"
)
