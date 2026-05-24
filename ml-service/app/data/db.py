"""
db.py — Supabase read connection for the ML service.

The ML service uses the service role key so it can read aggregate
transaction data across all users without being restricted by RLS.
"""
from __future__ import annotations

import os
from supabase import create_client, Client

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        _client = create_client(url, key)
    return _client


def fetch_training_data():
    """
    Fetches completed transactions joined with their category slug, location, 
    and freelancer ratings for model training.

    Returns:
        X (np.ndarray): feature matrix [category_enc, location_enc, rating]
        y (np.ndarray): target prices
        category_labels (list[str]): all category slugs seen
        location_labels (list[str]): all zip codes seen
    """
    import numpy as np
    from sklearn.preprocessing import LabelEncoder

    client = get_client()

    # Pull completed transactions joined with category slug and freelancer's zip code.
    res = (
        client.table("transactions")
        .select("final_price, category_id, freelancer_id, categories(slug), freelancer:users!transactions_freelancer_id_fkey(zip_code)")
        .not_.is_("completed_at", "null")
        .execute()
    )
    rows = res.data or []

    if not rows:
        raise ValueError("No completed transactions found for training.")

    # Pull actual review rating aggregates per freelancer to map them to transactions
    ratings_res = client.table("freelancer_rating_aggregates").select("freelancer_id, avg_overall").execute()
    ratings_map = {r["freelancer_id"]: float(r["avg_overall"]) for r in (ratings_res.data or [])}

    categories = [r["categories"]["slug"] if r.get("categories") else "unknown" for r in rows]
    prices     = [float(r["final_price"]) for r in rows]
    locations  = [r["freelancer"]["zip_code"] if r.get("freelancer") and r["freelancer"].get("zip_code") else "unknown" for r in rows]
    ratings    = [ratings_map.get(r["freelancer_id"], 4.5) for r in rows]

    cat_enc = LabelEncoder().fit(categories)
    loc_enc = LabelEncoder().fit(locations)

    X = np.column_stack([
        cat_enc.transform(categories),
        loc_enc.transform(locations),
        ratings,
    ])
    y = np.array(prices)

    return X, y, categories, locations