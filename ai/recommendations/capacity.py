"""Explainable deterministic capacity-gap rules."""
from math import ceil
def recommend(predicted_demand:float,available_capacity:int,physical_headroom:int,recurring_bottlenecks:int=0)->dict:
 gap=max(0,ceil(predicted_demand-available_capacity))
 if gap==0:return{'type':'monitor','capacity_gap':0,'recommended_capacity':None,'reason':f'Capacity covers forecast demand; {available_capacity} slots for {predicted_demand:.1f} predicted arrivals.'}
 addition=min(gap,max(0,physical_headroom))
 if addition>=gap:kind='add_capacity';reason=f'Forecast exceeds available capacity by {gap}; physical headroom can absorb the full gap.'
 elif addition>0:kind='add_window';reason=f'Forecast gap is {gap}, but only {addition} physical-capacity slots remain; add a bounded window and monitor overflow.'
 else:kind='redistribute';reason=f'Forecast gap is {gap} with no physical headroom; redistribute bookings rather than exceed safe capacity.'
 if recurring_bottlenecks>=3:reason+=f' Historical utilisation exceeded 90% on {recurring_bottlenecks} recent days.'
 return{'type':kind,'capacity_gap':gap,'recommended_capacity':available_capacity+addition if addition else None,'reason':reason}
