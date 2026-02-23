import os
import numpy as np
import pandas as pd

# -----------------------------
# Config (matches proposal intent)
# -----------------------------
SERVICE_RATE_BASELINE_PER_HR = 10   # capacity (patients/hour) baseline
SERVICE_RATE_REMOTE_PER_HR = 12     # capacity remote (slightly higher throughput)
SIM_HOURS = 24

SEED = 42
N_PATIENTS = 150  # proposal mentions ~150 synthetic cases

# Baseline vs Remote assumptions (easy to justify in methodology)
BASELINE_WAIT_MEAN = 75
BASELINE_WAIT_SD = 25

REMOTE_WAIT_MEAN = 55
REMOTE_WAIT_SD = 20

LWBS_THRESHOLD_MIN = 120  # leave-without-being-seen if wait > 120 min

# Nurse override / AI (simple model placeholders)
OVERRIDE_RATE = 0.12      # 12% overridden by nurse
AI_ERROR_RATE = 0.18      # 18% AI acuity misclassification probability

# -----------------------------
# Helpers
# -----------------------------
def clip_nonneg(x):
    return np.clip(x, 0, None)

def ensure_dirs(*paths):
    for p in paths:
        os.makedirs(p, exist_ok=True)

# -----------------------------
# Main simulation
# -----------------------------
def main():
    np.random.seed(SEED)

    # Create synthetic patient arrivals (minutes across a day)
    df = pd.DataFrame({
        "case_id": np.arange(1, N_PATIENTS + 1),
        "arrival_minute": np.random.randint(0, 24 * 60, N_PATIENTS),
        "acuity_true": np.random.choice([1, 2, 3, 4, 5], size=N_PATIENTS,
                                        p=[0.08, 0.17, 0.35, 0.25, 0.15]),
    }).sort_values("arrival_minute").reset_index(drop=True)

    # -----------------------------
    # STEP 5.2: Queue + throughput proxy
    # -----------------------------
    df["arrival_hour"] = (df["arrival_minute"] // 60).astype(int)
    arrivals_per_hour = df.groupby("arrival_hour").size().reindex(range(SIM_HOURS), fill_value=0)

    queue_baseline = []
    queue_remote = []
    q_b = 0
    q_r = 0

    for hr in range(SIM_HOURS):
        q_b = max(0, q_b + int(arrivals_per_hour.loc[hr]) - SERVICE_RATE_BASELINE_PER_HR)
        q_r = max(0, q_r + int(arrivals_per_hour.loc[hr]) - SERVICE_RATE_REMOTE_PER_HR)
        queue_baseline.append(q_b)
        queue_remote.append(q_r)

    avg_queue_baseline = float(np.mean(queue_baseline))
    avg_queue_remote = float(np.mean(queue_remote))
    max_queue_baseline = float(np.max(queue_baseline))
    max_queue_remote = float(np.max(queue_remote))

    throughput_baseline = float(np.mean([
        min(arrivals_per_hour.loc[h], SERVICE_RATE_BASELINE_PER_HR) for h in range(SIM_HOURS)
    ]))
    throughput_remote = float(np.mean([
        min(arrivals_per_hour.loc[h], SERVICE_RATE_REMOTE_PER_HR) for h in range(SIM_HOURS)
    ]))

    # -----------------------------
    # AI predicted acuity (sometimes wrong)
    # -----------------------------
    wrong_mask = np.random.rand(N_PATIENTS) < AI_ERROR_RATE
    ai_acuity = df["acuity_true"].copy()

    # If wrong, shift acuity by +/-1 (bounded 1..5)
    shifts = np.random.choice([-1, 1], size=N_PATIENTS)
    ai_acuity.loc[wrong_mask] = np.clip(ai_acuity.loc[wrong_mask] + shifts[wrong_mask], 1, 5)
    df["ai_acuity"] = ai_acuity

    # Nurse override (some % overrides AI to true acuity)
    df["nurse_override"] = (np.random.rand(N_PATIENTS) < OVERRIDE_RATE)
    df["final_acuity"] = np.where(df["nurse_override"], df["acuity_true"], df["ai_acuity"])

    # Simulated wait times (baseline vs remote)
    df["wait_time_baseline"] = clip_nonneg(np.random.normal(BASELINE_WAIT_MEAN, BASELINE_WAIT_SD, N_PATIENTS))
    df["wait_time_remote"] = clip_nonneg(np.random.normal(REMOTE_WAIT_MEAN, REMOTE_WAIT_SD, N_PATIENTS))

    # LWBS flags
    df["lwbs_baseline"] = (df["wait_time_baseline"] > LWBS_THRESHOLD_MIN).astype(int)
    df["lwbs_remote"] = (df["wait_time_remote"] > LWBS_THRESHOLD_MIN).astype(int)

    # Prioritization accuracy (AI vs final)
    df["ai_correct"] = (df["ai_acuity"] == df["acuity_true"]).astype(int)
    df["final_correct"] = (df["final_acuity"] == df["acuity_true"]).astype(int)

    # -----------------------------
    # Metrics summary
    # -----------------------------
    metrics = []

    def add_metric(name, baseline_val, remote_val):
        metrics.append({
            "metric": name,
            "baseline": float(baseline_val),
            "remote": float(remote_val),
            "difference_baseline_minus_remote": float(baseline_val - remote_val)
        })

    # Queue + throughput proxy metrics
    add_metric("avg_queue_length_proxy", avg_queue_baseline, avg_queue_remote)
    add_metric("max_queue_length_proxy", max_queue_baseline, max_queue_remote)
    add_metric("throughput_patients_per_hr_proxy", throughput_baseline, throughput_remote)

    # Wait + LWBS metrics
    add_metric("avg_wait_time_min", df["wait_time_baseline"].mean(), df["wait_time_remote"].mean())
    add_metric("median_wait_time_min", df["wait_time_baseline"].median(), df["wait_time_remote"].median())
    add_metric("lwbs_rate", df["lwbs_baseline"].mean(), df["lwbs_remote"].mean())

    # Accuracy isn’t baseline-vs-remote; it’s AI vs final (nurse oversight effect)
    accuracy = pd.DataFrame([{
        "metric": "ai_accuracy",
        "value": float(df["ai_correct"].mean())
    }, {
        "metric": "final_accuracy_after_override",
        "value": float(df["final_correct"].mean())
    }, {
        "metric": "override_rate",
        "value": float(df["nurse_override"].mean())
    }])

    metrics_df = pd.DataFrame(metrics)

    # -----------------------------
    # Save outputs
    # -----------------------------
    root = os.path.dirname(os.path.dirname(__file__))  # analytics/
    data_dir = os.path.join(root, "data")
    out_dir = os.path.join(root, "outputs")
    ensure_dirs(data_dir, out_dir)

    df.to_csv(os.path.join(data_dir, "synthetic_cases.csv"), index=False)
    metrics_df.to_csv(os.path.join(out_dir, "metrics_baseline_vs_remote.csv"), index=False)
    accuracy.to_csv(os.path.join(out_dir, "metrics_accuracy_override.csv"), index=False)

    # Print quick checkpoint to terminal
    print("Saved:")
    print(f"- {os.path.join('analytics','data','synthetic_cases.csv')}")
    print(f"- {os.path.join('analytics','outputs','metrics_baseline_vs_remote.csv')}")
    print(f"- {os.path.join('analytics','outputs','metrics_accuracy_override.csv')}")
    print("\n Quick results:")
    print(metrics_df)
    print("\n Accuracy/override:")
    print(accuracy)

if __name__ == "__main__":
    main()

