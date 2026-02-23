import os
import numpy as np
import pandas as pd

# Load cleaned ED dataset
df = pd.read_csv("../data/ed_clean.csv")

# NHAMCS missing codes
df = df.replace([-7, -8, -9], np.nan)

# Compute metrics
metrics = {
    "avg_wait_time_min": float(df["WAITTIME"].mean()),
    "median_wait_time_min": float(df["WAITTIME"].median()),
    "lwbs_rate": float((df["LEFTAMA"] == 1).mean()),
    "avg_lov_min": float(df["LOV"].mean()),
}

# BOARDED exists in your dataset (not BOARDER)
if "BOARDED" in df.columns:
    metrics["boarding_mean_min"] = float(df["BOARDED"].mean())

# Print
print(pd.Series(metrics))

# Save to outputs
os.makedirs("../outputs", exist_ok=True)
out_df = pd.Series(metrics, name="value").reset_index().rename(columns={"index": "metric"})
out_df.to_csv("../outputs/real_baseline_metrics.csv", index=False)
print("Saved: analytics/outputs/real_baseline_metrics.csv")
