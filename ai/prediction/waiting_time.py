"""Versioned wait prediction with validation-selected statistical fallback."""
from pathlib import Path
from datetime import datetime,timezone
import joblib,pandas as pd
def predict(payload,model_directory:Path):
 bundle=joblib.load(model_directory/'waiting.joblib');m=bundle['metadata'];row=payload.model_dump();d=row.pop('target_date');row['day_of_week']=d.weekday();baseline=row['farmers_ahead']*row['recent_avg_service_minutes']/row['active_counters']+row['interruption_active']*15;selected=m.get('selected_method') or ('model' if m['validation']['model']['mae']<m['validation']['baseline']['mae'] else 'statistical_fallback');value=float(bundle['model'].predict(pd.DataFrame([row]))[0]) if selected=='model' else baseline;spread=float(m.get('residual_p90',max(5,value*.2)));return{'prediction_type':'waiting_time','value':round(max(0,value),3),'lower_bound':round(max(0,value-spread),3),'upper_bound':round(value+spread,3),'method':selected,'model_version':m['version'] if selected=='model' else None,'evaluated_model_version':m['version'],'generated_at':datetime.now(timezone.utc).isoformat(),'synthetic_model':bool(m.get('synthetic_evaluation'))}
