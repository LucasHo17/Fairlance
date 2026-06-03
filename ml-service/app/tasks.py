import logging
from app.models.price_predictor import PricePredictor
from app.data.db import fetch_training_data

logger = logging.getLogger("app.tasks")

def train_model_task():
    """
    Background worker task:
    1. Fetches transactional data from Supabase using the service role client.
    2. Retrains the scikit-learn GradientBoostingRegressor.
    3. Saves the model to disk.
    """
    logger.info("Starting background training task...")
    try:
        predictor = PricePredictor.get()
        X, y, category_labels, location_labels = fetch_training_data()
        predictor.category_enc.fit(category_labels)
        predictor.location_enc.fit(location_labels)
        predictor.train(X, y)
        logger.info(f"Background training finished successfully on {len(y)} transaction samples.")
        return f"Successfully retrained model on {len(y)} transaction samples."
    except Exception as e:
        logger.error(f"Background training task failed: {str(e)}", exc_info=True)
        raise
