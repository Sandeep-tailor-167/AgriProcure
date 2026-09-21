"""Reproducibility, leakage, output type, and artifact coverage."""
import joblib
from ai.training.generate_synthetic import generate
from ai.preprocessing.pipeline import demand_features,chronological_split,DEMAND_FEATURES
from ai.training.train_demand import train as train_demand
from ai.training.train_waiting_time import train as train_waiting
from ai.recommendations.capacity import recommend

def test_generator_is_reproducible():
    first=generate(seed=7,days=20,centres=1,crops=1);second=generate(seed=7,days=20,centres=1,crops=1)
    assert first[0].equals(second[0]);assert first[1].equals(second[1])

def test_chronological_features_do_not_use_future_values():
    demand,_=generate(seed=2,days=40,centres=1,crops=1);features=demand_features(demand);train,validation,test=chronological_split(features)
    assert train.date.max()<=validation.date.min()<=test.date.min()
    original=features.iloc[0].bookings;demand.loc[demand.index[-1],'bookings']=99999
    assert demand_features(demand).iloc[0].bookings==original

def test_models_train_save_load_and_predict_numeric(tmp_path):
    demand,waiting=generate(seed=5,days=70,centres=1,crops=1);dm=train_demand(demand,tmp_path);wm=train_waiting(waiting,tmp_path)
    demand_bundle=joblib.load(tmp_path/'demand.joblib');wait_bundle=joblib.load(tmp_path/'waiting.joblib')
    demand_ready=demand_features(demand);prediction=demand_bundle['model'].predict(demand_ready[DEMAND_FEATURES].tail(1))[0]
    assert isinstance(float(prediction),float);assert dm['synthetic_evaluation'] is True;assert wm['synthetic_evaluation'] is True;assert wait_bundle['metadata']['residual_p90']>=0

def test_capacity_rules_never_exceed_physical_headroom():
    full=recommend(80,50,40,4);bounded=recommend(80,50,10);none=recommend(80,50,0)
    assert full['type']=='add_capacity' and full['recommended_capacity']==80
    assert bounded['type']=='add_window' and bounded['recommended_capacity']==60
    assert none['type']=='redistribute' and none['recommended_capacity'] is None
