import pandas as pd

baseline = pd.read_csv("../outputs/real_baseline_metrics.csv")
remote = pd.read_csv("../outputs/real_remote_metrics.csv")

merged = baseline.merge(remote, on="metric", suffixes=("_baseline", "_remote"))
merged["improvement"] = merged["value_baseline"] - merged["value_remote"]

print("\nReal ED vs Remote triage comparison:\n")
print(merged)

merged.to_csv("../outputs/real_comparison.csv", index=False)
print("\nSaved: analytics/outputs/real_comparison.csv")
