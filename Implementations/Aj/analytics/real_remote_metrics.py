import os
import numpy as np
import pandas as pd

# Use the 150-patient sample 
df = pd.read_csv("../data/ed_sample_150.csv")
df = df.replace([-7, -8, -9], np.nan)


WAIT_REDUCTION = 0.25     
LWBS_REDUCTION = 0.30     
BOARD_REDUCTION = 0.15   

remote = df.copy()


if "WAITTIME" in remote.columns:
    remote["WAITTIME"] = remote["WAITTIME"] * (1 - WAIT_REDUCTION)

if "BOARDED" in remote.columns:
    remote["BOARDED"] = remote["BOARDED"] * (1 - BOARD_REDUCTION)

metrics = {
    "avg_wait_time_min": float(remote["WAITTIME"].mean()),
    "median_wait_time_min": float(remote["WAITTIME"].median()),
    "lwbs_rate": float((remote["LEFTAMA"] == 1).mean() * (1 - LWBS_REDUCTION)),
    "avg_lov_min": float(remote["LOV"].mean()),
}

if "BOARDED" in remote.columns:
    metrics["boarding_mean_min"] = float(remote["BOARDED"].mean())

print(pd.Series(metrics))

os.makedirs("../outputs", exist_ok=True)
out = pd.Series(metrics, name="value").reset_index().rename(columns={"index": "metric"})
out.to_csv("../outputs/real_remote_metrics.csv", index=False)


print("Saved: analytics/outputs/real_remote_metrics.csv")
