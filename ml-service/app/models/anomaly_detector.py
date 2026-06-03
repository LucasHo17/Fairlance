"""
anomaly_detector.py — AnomalyDetector class + FastAPI router.

Uses scikit-learn IsolationForest to flag outlier prices in a
list of completed transaction amounts.
"""
import logging
import numpy as np
from fastapi import APIRouter
from sklearn.ensemble import IsolationForest

from app.schemas.anomaly_schemas import AnomalyDetectRequest, AnomalyDetectResponse

logger = logging.getLogger("app.anomaly_detector")
router = APIRouter(tags=["anomalies"])


class AnomalyDetector:
    """
    Fits a fresh IsolationForest on every request (stateless).
    For large datasets a pre-trained model can be cached similarly
    to PricePredictor.
    """

    def detect(self, prices: list[float]) -> AnomalyDetectResponse:
        if len(prices) < 5:
            # Not enough data to fit the model meaningfully.
            logger.info("Fewer than 5 prices submitted; skipping anomaly detection model fit.")
            return AnomalyDetectResponse(outlierIndices=[], scores=[0.0] * len(prices))

        X = np.array(prices).reshape(-1, 1)
        clf = IsolationForest(contamination=0.1, random_state=42)
        clf.fit(X)

        preds  = clf.predict(X)           # 1 = inlier, -1 = outlier
        scores = clf.score_samples(X).tolist()
        outlier_indices = [i for i, p in enumerate(preds) if p == -1]

        return AnomalyDetectResponse(outlierIndices=outlier_indices, scores=scores)


_detector = AnomalyDetector()


@router.post("/detect-anomalies", response_model=AnomalyDetectResponse)
def detect_anomalies(req: AnomalyDetectRequest) -> AnomalyDetectResponse:
    from app.core.metrics import ANOMALY_DETECTION_REQUESTS, ANOMALIES_FOUND
    try:
        res = _detector.detect(req.prices)
        ANOMALY_DETECTION_REQUESTS.labels(status="success").inc()
        anomalies_count = len(res.outlierIndices)
        if anomalies_count > 0:
            ANOMALIES_FOUND.inc(anomalies_count)
            logger.warning(
                f"Detected {anomalies_count} pricing anomalies in request of size {len(req.prices)}.",
                extra={"total_prices": len(req.prices), "outliers": anomalies_count}
            )
        else:
            logger.info(f"Anomaly detection complete; no outliers found in {len(req.prices)} prices.")
        return res
    except Exception as e:
        ANOMALY_DETECTION_REQUESTS.labels(status="error").inc()
        logger.error(f"Anomaly detection failed: {str(e)}", exc_info=True)
        raise


@router.get("/detect-anomalies/health")
def health() -> dict:
    return {"status": "ok"}