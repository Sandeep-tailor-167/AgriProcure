"""Step 1 ML service foundation validation."""

from fastapi.testclient import TestClient

from ai.app import app


def test_health_reports_artifact_readiness_truthfully() -> None:
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["development_step"] == 12
    assert payload["models_loaded"] == all(payload["artifacts"].values())

def test_prediction_endpoint_requires_internal_key() -> None:
    response=TestClient(app).post('/v1/predict/demand',json={})
    assert response.status_code in (401,503)

def test_demand_prediction_returns_version_and_interval(monkeypatch) -> None:
    from ai.config.settings import settings
    monkeypatch.setattr(settings,'api_key','test-internal-key')
    response=TestClient(app).post('/v1/predict/demand',headers={'x-internal-api-key':'test-internal-key'},json={'centre_id':'1','crop_id':'1','target_date':'2026-10-01','capacity':50,'lag_1':20,'lag_7':21,'rolling_7':20.5,'no_show_rate_7':.1,'quantity_7':150})
    assert response.status_code==200
    data=response.json();assert data['method']=='model';assert data['lower_bound']<=data['value']<=data['upper_bound'];assert data['model_version']
