"""Leakage-safe cleaning, feature engineering, and chronological splitting."""
from __future__ import annotations
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder,StandardScaler
from sqlalchemy import create_engine,text

DEMAND_FEATURES=['centre_id','crop_id','capacity','day_of_week','month','lag_1','lag_7','rolling_7','no_show_rate_7','quantity_7']
WAIT_FEATURES=['centre_id','crop_id','farmers_ahead','active_counters','recent_avg_service_minutes','hour','interruption_active','day_of_week']

def demand_features(frame:pd.DataFrame)->pd.DataFrame:
    df=frame.copy();df['date']=pd.to_datetime(df['date'],errors='coerce');df=df.dropna(subset=['date','bookings','arrivals']).sort_values(['centre_id','crop_id','date']);g=df.groupby(['centre_id','crop_id'],sort=False)
    df['day_of_week']=df.date.dt.dayofweek;df['month']=df.date.dt.month;df['lag_1']=g.bookings.shift(1);df['lag_7']=g.bookings.shift(7);df['rolling_7']=g.bookings.transform(lambda x:x.shift(1).rolling(7).mean());df['no_show_rate_7']=g.no_show_rate.transform(lambda x:x.shift(1).rolling(7).mean());df['quantity_7']=g.quantity.transform(lambda x:x.shift(1).rolling(7).mean());return df.dropna(subset=DEMAND_FEATURES+['arrivals']).reset_index(drop=True)

def waiting_features(frame:pd.DataFrame)->pd.DataFrame:
    df=frame.copy();df['date']=pd.to_datetime(df['date'],errors='coerce');df=df.dropna(subset=['date','wait_minutes']);df['day_of_week']=df.date.dt.dayofweek;return df.sort_values('date').reset_index(drop=True)

def chronological_split(df:pd.DataFrame,train=.7,validation=.15):
    ordered=df.sort_values('date').reset_index(drop=True);n=len(ordered);a=int(n*train);b=int(n*(train+validation));return ordered.iloc[:a].copy(),ordered.iloc[a:b].copy(),ordered.iloc[b:].copy()

def transformer(features:list[str]):
    categories=[x for x in ['centre_id','crop_id'] if x in features];numeric=[x for x in features if x not in categories];return ColumnTransformer([('category',OneHotEncoder(handle_unknown='ignore',sparse_output=False),categories),('numeric',StandardScaler(),numeric)])

def extract_daily_demand(database_url:str,date_from:str,date_to:str)->pd.DataFrame:
    """Read-only operational extraction; credentials are supplied only through the URL/environment."""
    query=text("""SELECT s.procurement_date date,s.centre_id,s.crop_id,s.capacity,COUNT(a.appointment_id) bookings,
      SUM(q.check_in_time IS NOT NULL) arrivals,COALESCE(SUM(pt.accepted_quantity),0) quantity,
      COALESCE(SUM(q.queue_status='no_show')/NULLIF(SUM(q.check_in_time IS NOT NULL),0),0) no_show_rate
      FROM procurement_schedules s LEFT JOIN appointments a ON a.schedule_id=s.schedule_id
      LEFT JOIN queue_tokens q ON q.appointment_id=a.appointment_id LEFT JOIN procurement_transactions pt ON pt.appointment_id=a.appointment_id
      WHERE s.procurement_date BETWEEN :date_from AND :date_to GROUP BY s.procurement_date,s.centre_id,s.crop_id,s.capacity ORDER BY s.procurement_date""")
    engine=create_engine(database_url,pool_pre_ping=True)
    try:
      with engine.connect() as connection:return pd.read_sql(query,connection,params={'date_from':date_from,'date_to':date_to})
    finally:engine.dispose()
