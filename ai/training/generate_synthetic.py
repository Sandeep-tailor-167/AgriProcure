"""Reproducible synthetic development data. Never mix this with operational records."""
from pathlib import Path
import argparse
import numpy as np
import pandas as pd

def generate(seed: int = 42, days: int = 540, centres: int = 4, crops: int = 3) -> tuple[pd.DataFrame,pd.DataFrame]:
    rng=np.random.default_rng(seed);dates=pd.date_range('2024-01-01',periods=days,freq='D');demand=[];waiting=[]
    for centre in range(1,centres+1):
      for crop in range(1,crops+1):
        previous=[]
        for date in dates:
          dow=date.dayofweek;season=1+0.32*np.sin(2*np.pi*date.dayofyear/365);weekly=1.18 if dow in (0,1) else .88 if dow==6 else 1
          latent=max(2,18*season*weekly+centre*2+crop*1.5);arrivals=int(rng.poisson(latent));capacity=30+centre*5+(5 if dow<5 else 0);no_show=float(np.clip(rng.normal(.09,.025),.01,.25));quantity=max(.5,rng.normal(8+crop*1.7,1.6));
          demand.append({'date':date,'centre_id':str(centre),'crop_id':str(crop),'capacity':capacity,'bookings':arrivals,'arrivals':int(round(arrivals*(1-no_show))),'quantity':round(arrivals*quantity,3),'no_show_rate':round(no_show,4)})
          previous.append(arrivals)
          samples=max(1,int(arrivals*(1-no_show)))
          for _ in range(samples):
            ahead=int(rng.integers(0,max(1,arrivals)));counters=int(rng.integers(1,5));service=max(4,rng.normal(14+crop,2));interrupt=int(rng.random()<.08);hour=float(rng.uniform(8,17));wait=max(0,ahead*service/counters+interrupt*rng.uniform(8,30)+rng.normal(0,4))
            waiting.append({'date':date,'centre_id':str(centre),'crop_id':str(crop),'farmers_ahead':ahead,'active_counters':counters,'recent_avg_service_minutes':round(service,2),'hour':round(hour,2),'interruption_active':interrupt,'wait_minutes':round(wait,2)})
    return pd.DataFrame(demand),pd.DataFrame(waiting)

def main() -> None:
    parser=argparse.ArgumentParser();parser.add_argument('--seed',type=int,default=42);parser.add_argument('--days',type=int,default=540);parser.add_argument('--output',type=Path,default=Path('ai/data/synthetic'));args=parser.parse_args();d,w=generate(args.seed,args.days);args.output.mkdir(parents=True,exist_ok=True);d.to_csv(args.output/'demand.csv',index=False);w.to_csv(args.output/'waiting.csv',index=False);print(f'generated synthetic rows: demand={len(d)} waiting={len(w)} seed={args.seed}')
if __name__=='__main__':main()
