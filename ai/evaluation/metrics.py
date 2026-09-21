"""Regression evaluation metrics."""
import numpy as np
from sklearn.metrics import mean_absolute_error,mean_squared_error
def regression_metrics(actual,predicted):
    y=np.asarray(actual,dtype=float);p=np.asarray(predicted,dtype=float);den=np.abs(y).sum();return{'mae':float(mean_absolute_error(y,p)),'rmse':float(np.sqrt(mean_squared_error(y,p))),'wape':float(np.abs(y-p).sum()/den) if den else None}
