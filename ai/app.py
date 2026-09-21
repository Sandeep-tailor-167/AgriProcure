"""Private AgriProcure prediction service."""

from datetime import datetime, timezone

from fastapi import FastAPI
from ai.api.routes import router
from ai.config.settings import settings

app = FastAPI(
    title="AgriProcure ML Service",
    description="Private operational intelligence service foundation",
    version="0.1.0",
)
app.include_router(router)


@app.get("/health")
def health() -> dict[str, object]:
    demand=(settings.model_directory/'demand.joblib').exists();waiting=(settings.model_directory/'waiting.joblib').exists()
    return {
        "status": "ready" if demand and waiting else "degraded",
        "development_step": 12,
        "models_loaded": demand and waiting,
        "artifacts": {"demand":demand,"waiting_time":waiting},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
