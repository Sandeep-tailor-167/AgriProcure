"""Versioned demand prediction and development uncertainty interval."""
from pathlib import Path
from datetime import datetime,timezone
import joblib,pandas as pd
def predict(payload,model_directory:Path):
 bundle=joblib.load(model_directory/'demand.joblib');m=bundle['metadata'];row=payload.model_dump();d=row.pop('target_date');row.update(day_of_week=d.weekday(),month=d.month);value=max(0,float(bundle['model'].predict(pd.DataFrame([row]))[0]));spread=1.64*float(m['test']['rmse']);return{'prediction_type':'demand','value':round(value,3),'lower_bound':round(max(0,value-spread),3),'upper_bound':round(value+spread,3),'method':'model','model_version':m['version'],'generated_at':datetime.now(timezone.utc).isoformat(),'synthetic_model':bool(m.get('synthetic_evaluation'))}
