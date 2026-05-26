"""
tests/test_price_predictor.py — Unit tests for the PricePredictor class.

These tests exercise the class directly (bypassing HTTP) so they run fast
without spinning up the full FastAPI server.
"""
import pytest
from app.models.price_predictor import PricePredictor


@pytest.fixture(autouse=True)
def reset_singleton():
    """Reset the singleton before each test so state doesn't bleed across tests."""
    PricePredictor._instance = None
    yield
    PricePredictor._instance = None


class TestHeuristic:
    """Tests for the no-model heuristic fallback."""

    def test_known_category_returns_positive_prices(self):
        p = PricePredictor()
        r = p._heuristic("web-development", 4.5)
        assert r.suggestedPrice > 0
        assert r.minPrice > 0
        assert r.maxPrice > 0

    def test_price_range_ordering(self):
        p = PricePredictor()
        r = p._heuristic("graphic-design", 4.0)
        assert r.minPrice < r.suggestedPrice < r.maxPrice

    def test_unknown_category_falls_back_to_base_50(self):
        p = PricePredictor()
        r = p._heuristic("underwater-basket-weaving", 4.5)
        # base = 50, rating 4.5 multiplier ≈ 0.8 + (3.5/4)*0.5 = 1.2375
        expected = round(50 * (0.8 + (4.5 - 1) / 4 * 0.5), 2)
        assert r.suggestedPrice == pytest.approx(expected, abs=0.01)

    def test_minimum_rating_applies_lowest_multiplier(self):
        p = PricePredictor()
        # rating=1.0 → multiplier = 0.8 + 0/4 * 0.5 = 0.8
        r_min = p._heuristic("cleaning", 1.0)
        r_max = p._heuristic("cleaning", 5.0)
        assert r_min.suggestedPrice < r_max.suggestedPrice

    def test_maximum_rating_applies_highest_multiplier(self):
        p = PricePredictor()
        r = p._heuristic("tutoring", 5.0)
        # multiplier = 0.8 + (4.0/4)*0.5 = 1.3, base = 40
        expected = round(40 * 1.3, 2)
        assert r.suggestedPrice == pytest.approx(expected, abs=0.01)

    def test_min_price_is_75_percent_of_suggested(self):
        p = PricePredictor()
        r = p._heuristic("photography", 4.0)
        assert r.minPrice == pytest.approx(r.suggestedPrice * 0.75, abs=0.01)

    def test_max_price_is_135_percent_of_suggested(self):
        p = PricePredictor()
        r = p._heuristic("photography", 4.0)
        assert r.maxPrice == pytest.approx(r.suggestedPrice * 1.35, abs=0.01)

    @pytest.mark.parametrize("category", [
        "web-development", "graphic-design", "photography", "video-editing",
        "tutoring", "writing-editing", "music-audio", "landscaping",
        "cleaning", "moving-help", "handyman-services", "data-entry",
        "social-media", "translation", "event-planning",
    ])
    def test_all_known_categories_return_valid_prices(self, category: str):
        p = PricePredictor()
        r = p._heuristic(category, 4.0)
        assert r.minPrice < r.suggestedPrice < r.maxPrice


class TestPredict:
    """Tests for the public predict() method which falls back to heuristic when no model is trained."""

    def test_predict_without_model_uses_heuristic(self, monkeypatch):
        from pathlib import Path
        monkeypatch.setattr("app.models.price_predictor.MODEL_PATH", Path("nonexistent_test_model.pkl"))
        p = PricePredictor()
        assert p.model is None
        r = p.predict("web-development", "01003", 4.5)
        assert r.suggestedPrice > 0
        assert r.minPrice < r.suggestedPrice < r.maxPrice

    def test_predict_unknown_category_returns_fallback_price(self):
        p = PricePredictor()
        r = p.predict("nonexistent-category", "", 3.0)
        assert r.suggestedPrice > 0

    def test_predict_returns_price_predict_response_shape(self):
        from app.schemas.price_schemas import PricePredictResponse
        p = PricePredictor()
        r = p.predict("tutoring", "02116", 4.2)
        assert isinstance(r, PricePredictResponse)
        assert hasattr(r, "minPrice")
        assert hasattr(r, "maxPrice")
        assert hasattr(r, "suggestedPrice")


class TestSingleton:
    def test_get_returns_same_instance(self):
        a = PricePredictor.get()
        b = PricePredictor.get()
        assert a is b

    def test_get_creates_instance_on_first_call(self):
        assert PricePredictor._instance is None
        instance = PricePredictor.get()
        assert instance is not None
        assert PricePredictor._instance is instance


class TestCaching:
    def test_caching_hit_miss(self):
        from app.models.price_predictor import _cached_predict
        p = PricePredictor.get()
        _cached_predict.cache_clear()

        # Initial call should be a cache miss
        info_before = _cached_predict.cache_info()
        p.predict("web-development", "01003", 4.5)
        info_after_miss = _cached_predict.cache_info()
        assert info_after_miss.misses == info_before.misses + 1
        assert info_after_miss.hits == info_before.hits

        # Second call with identical arguments should be a cache hit
        p.predict("web-development", "01003", 4.5)
        info_after_hit = _cached_predict.cache_info()
        assert info_after_hit.hits == info_after_miss.hits + 1
        assert info_after_hit.misses == info_after_miss.misses

    def test_cache_invalidation_on_train(self, monkeypatch):
        from app.models.price_predictor import _cached_predict
        import numpy as np
        
        # Mock joblib.dump and MODEL_PATH to avoid mutating disk/file system in test
        monkeypatch.setattr("app.models.price_predictor.joblib.dump", lambda *args, **kwargs: None)
        
        p = PricePredictor.get()
        _cached_predict.cache_clear()
        
        # Populate the cache
        p.predict("web-development", "01003", 4.5)
        assert _cached_predict.cache_info().currsize == 1
        
        # Train model with dummy inputs, which should trigger cache invalidation
        X = np.array([[0, 0, 4.5], [0, 0, 3.5]])
        y = np.array([100.0, 80.0])
        p.category_enc.fit(["web-development"])
        p.location_enc.fit(["01003"])
        p.train(X, y)
        
        # Cache should be cleared/empty after retraining
        assert _cached_predict.cache_info().currsize == 0

