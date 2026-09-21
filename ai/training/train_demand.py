"""Train chronological procurement-arrival forecast model."""
from pathlib import Path
from datetime import datetime,timezone
import json,joblib,pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.pipeline import Pipeline
from ai.preprocessing.pipeline import DEMAND_FEATURES,demand_features,chronological_split,transformer
from ai.evaluation.metrics import regression_metrics
def train(data:pd.DataFrame,output=Path('ai/models')):
    df=demand_features(data);train_set,validation,test=chronological_split(df);model=Pipeline([('preprocess',transformer(DEMAND_FEATURES)),('model',HistGradientBoostingRegressor(max_iter=180,max_depth=6,learning_rate=.06,random_state=42))]);model.fit(train_set[DEMAND_FEATURES],train_set.arrivals);baseline=[train_set.arrivals.tail(7).mean()]*len(validation);validation_metrics={'baseline':regression_metrics(validation.arrivals,baseline),'model':regression_metrics(validation.arrivals,model.predict(validation[DEMAND_FEATURES]))};test_metrics=regression_metrics(test.arrivals,model.predict(test[DEMAND_FEATURES]));version=f"demand-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}";metadata={'version':version,'model_type':'HistGradientBoostingRegressor','selected_method':'model' if validation_metrics['model']['mae']<validation_metrics['baseline']['mae'] else 'baseline','target':'arrivals','features':DEMAND_FEATURES,'synthetic_evaluation':True,'rows':len(df),'train_end':str(train_set.date.max().date()),'validation_end':str(validation.date.max().date()),'validation':validation_metrics,'test':test_metrics};output.mkdir(parents=True,exist_ok=True);joblib.dump({'model':model,'metadata':metadata},output/'demand.joblib');(output/'demand.metadata.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8');return metadata
if __name__=='__main__':print(json.dumps(train(pd.read_csv('ai/data/synthetic/demand.csv')),indent=2))
