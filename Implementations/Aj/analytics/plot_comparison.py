import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("../outputs/real_comparison.csv")

label_map = {
    "avg_wait_time_min": "Average Waiting Time (min)",
    "median_wait_time_min": "Median Waiting Time (min)",
    "lwbs_rate": "Leave Without Being Seen Rate",
    "avg_lov_min": "Average Length of Visit (min)",
    "boarding_mean_min": "Average Boarding Delay (min)"
}

df["metric"] = df["metric"].map(label_map)

plt.figure(figsize=(9,5))
x = range(len(df))

plt.bar(x, df["value_baseline"], width=0.4, label="Baseline ED Workflow")
plt.bar([i+0.4 for i in x], df["value_remote"], width=0.4, label="Remote Triage Workflow")

plt.xticks([i+0.2 for i in x], df["metric"], rotation=25)
plt.title("Baseline vs Remote Triage Emergency Department Performance")
plt.legend()

plt.tight_layout()
plt.savefig("../outputs/real_comparison_chart_clean.png", dpi=300)
plt.show()