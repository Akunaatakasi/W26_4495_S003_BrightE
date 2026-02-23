import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("../outputs/real_comparison.csv")

plt.figure()
plt.bar(df["metric"], df["value_baseline"])
plt.bar(df["metric"], df["value_remote"], bottom=0)

plt.xticks(rotation=45)
plt.title("Baseline vs Remote ED Triage Metrics")

plt.tight_layout()
plt.savefig("../outputs/real_comparison_chart.png")
print("Saved: analytics/outputs/real_comparison_chart.png")
