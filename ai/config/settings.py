"""Validated internal service and artifact settings."""
from pathlib import Path
from pydantic_settings import BaseSettings,SettingsConfigDict
class Settings(BaseSettings):
    api_key:str='';model_directory:Path=Path('ai/models')
    model_config=SettingsConfigDict(env_file='.env',env_prefix='AI_SERVICE_',extra='ignore')
settings=Settings()
