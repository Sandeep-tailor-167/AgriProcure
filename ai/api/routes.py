"""Authenticated internal prediction routes."""
import secrets
from fastapi import APIRouter,Depends,Header,HTTPException
from ai.api.schemas import DemandRequest,WaitingRequest
from ai.config.settings import settings
from ai.prediction.demand import predict as demand_predict
from ai.prediction.waiting_time import predict as waiting_predict
router=APIRouter(prefix='/v1')
def authorise(x_internal_api_key:str|None=Header(default=None)):
 if not settings.api_key:raise HTTPException(503,'Internal API key is not configured')
 if not x_internal_api_key or not secrets.compare_digest(x_internal_api_key,settings.api_key):raise HTTPException(401,'Invalid internal API key')
@router.post('/predict/demand',dependencies=[])
def demand(payload:DemandRequest,_=Depends(authorise)):
 try:return demand_predict(payload,settings.model_directory)
 except FileNotFoundError:raise HTTPException(503,'Demand model artifact is unavailable')
@router.post('/predict/waiting-time',dependencies=[])
def waiting(payload:WaitingRequest,_=Depends(authorise)):
 try:return waiting_predict(payload,settings.model_directory)
 except FileNotFoundError:raise HTTPException(503,'Waiting model artifact is unavailable')
