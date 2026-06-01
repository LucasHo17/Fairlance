from app.models.price_predictor import PricePredictor
from app.data.db import fetch_training_data

def train_model_task():
    """
    Background worker task:
    1. Fetches transactional data from Supabase using the service role client.
    2. Retrains the scikit-learn GradientBoostingRegressor.
    3. Saves the model to disk.
    """
    print("Starting background training task...")
    predictor = PricePredictor.get()
    X, y, category_labels, location_labels = fetch_training_data()
    predictor.category_enc.fit(category_labels)
    predictor.location_enc.fit(location_labels)
    predictor.train(X, y)
    print(f"Background training finished successfully on {len(y)} transaction samples.")
    return f"Successfully retrained model on {len(y)} transaction samples."
