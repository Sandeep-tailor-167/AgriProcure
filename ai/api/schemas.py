"""Validated demand and waiting-time request schemas."""
from datetime import date
from pydantic import BaseModel,Field
class DemandRequest(BaseModel):
 centre_id:str;crop_id:str;target_date:date;capacity:int=Field(ge=1,le=100000);lag_1:float=Field(ge=0);lag_7:float=Field(ge=0);rolling_7:float=Field(ge=0);no_show_rate_7:float=Field(ge=0,le=1);quantity_7:float=Field(ge=0)
class WaitingRequest(BaseModel):
 centre_id:str;crop_id:str;target_date:date;farmers_ahead:int=Field(ge=0);active_counters:int=Field(ge=1,le=100);recent_avg_service_minutes:float=Field(gt=0,le=600);hour:float=Field(ge=0,lt=24);interruption_active:int=Field(ge=0,le=1)
