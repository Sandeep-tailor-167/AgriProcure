"""Train chronological waiting-time model."""
from pathlib import Path
from datetime import datetime,timezone
import json,joblib,pandas as pd,numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.pipeline import Pipeline
from ai.preprocessing.pipeline import WAIT_FEATURES,waiting_features,chronological_split,transformer
from ai.evaluation.metrics import regression_metrics
def fallback(frame):return frame.farmers_ahead*frame.recent_avg_service_minutes/frame.active_counters.clip(lower=1)+frame.interruption_active*15
def train(data:pd.DataFrame,output=Path('ai/models')):
    df=waiting_features(data);train_set,validation,test=chronological_split(df);model=Pipeline([('preprocess',transformer(WAIT_FEATURES)),('model',RandomForestRegressor(n_estimators=120,min_samples_leaf=3,n_jobs=1,random_state=42))]);model.fit(train_set[WAIT_FEATURES],train_set.wait_minutes);validation_metrics={'baseline':regression_metrics(validation.wait_minutes,fallback(validation)),'model':regression_metrics(validation.wait_minutes,model.predict(validation[WAIT_FEATURES]))};prediction=model.predict(test[WAIT_FEATURES]);residual=np.abs(test.wait_minutes-prediction);version=f"waiting-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}";metadata={'version':version,'model_type':'RandomForestRegressor','selected_method':'model' if validation_metrics['model']['mae']<validation_metrics['baseline']['mae'] else 'statistical_fallback','target':'wait_minutes','features':WAIT_FEATURES,'synthetic_evaluation':True,'rows':len(df),'train_end':str(train_set.date.max().date()),'validation_end':str(validation.date.max().date()),'validation':validation_metrics,'test':regression_metrics(test.wait_minutes,prediction),'residual_p90':float(np.quantile(residual,.9))};output.mkdir(parents=True,exist_ok=True);joblib.dump({'model':model,'metadata':metadata},output/'waiting.joblib');(output/'waiting.metadata.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8');return metadata
if __name__=='__main__':print(json.dumps(train(pd.read_csv('ai/data/synthetic/waiting.csv')),indent=2))
