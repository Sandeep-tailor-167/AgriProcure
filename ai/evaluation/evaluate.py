"""Train and report both development models."""
import json,pandas as pd
from ai.training.train_demand import train as train_demand
from ai.training.train_waiting_time import train as train_waiting
def evaluate():return{'dataset':'synthetic-development','demand':train_demand(pd.read_csv('ai/data/synthetic/demand.csv')),'waiting':train_waiting(pd.read_csv('ai/data/synthetic/waiting.csv'))}
if __name__=='__main__':print(json.dumps(evaluate(),indent=2))
