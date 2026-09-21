# AI Models

## Data provenance and leakage controls

Operational extraction is read-only and parameterised by historical date range. The development generator uses seed 42 and creates clearly isolated synthetic observations. Demand lags and rolling values are shifted before rolling, so the target day and future dates cannot enter its features. Both datasets are ordered by date and split 70/15/15 without shuffling.

## Development evaluation (synthetic only)

The 2026-09-21 local run trained on 6,396 feature-ready demand rows and 161,405 queue observations. These scores validate implementation, not real-world performance.

| Target | Method | Validation MAE | Validation RMSE | Validation WAPE |
|---|---:|---:|---:|---:|
| Arrivals | 7-day baseline | 5.0651 | 6.4630 | 18.03% |
| Arrivals | HistGradientBoosting | 4.4746 | 5.5659 | 15.93% |
| Wait minutes | transparent service-rate baseline | 3.4514 | 4.4960 | 2.55% |
| Wait minutes | RandomForest | 3.8518 | 5.3215 | 2.85% |

Demand selects the trained model. Waiting-time serving selects the transparent statistical fallback because it outperformed the trained model on chronological validation. The waiting artifact is still versioned for evaluation and future retraining. Its test residual 90th percentile was 7.80 minutes and is suitable as a development uncertainty band only.

Artifacts contain the fitted preprocessing/model pipeline and metadata. Generated CSV, joblib, and metadata outputs are ignored by Git and should be built in the deployment environment from an approved data snapshot.
