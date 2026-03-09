import os
import json
import joblib
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (
    classification_report,
    accuracy_score,
    confusion_matrix,
    ConfusionMatrixDisplay
)

# -----------------------------
# Paths
# -----------------------------
DATA_PATH = "analytics/data/ed2022-stata.dta"
ML_DIR = "analytics/ml"
OUTPUT_DIR = os.path.join(ML_DIR, "outputs")

os.makedirs(ML_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

MODEL_PATH = os.path.join(ML_DIR, "triage_model.pkl")
ENCODER_PATH = os.path.join(ML_DIR, "label_encoder.pkl")
REPORT_PATH = os.path.join(OUTPUT_DIR, "classification_report.txt")
CM_PATH = os.path.join(OUTPUT_DIR, "confusion_matrix.png")
FEATURE_IMPORTANCE_PATH = os.path.join(OUTPUT_DIR, "feature_importance.csv")
METRICS_PATH = os.path.join(OUTPUT_DIR, "model_metrics.json")

# -----------------------------
# Load real NHAMCS dataset
# -----------------------------
df = pd.read_stata(DATA_PATH, convert_categoricals=False)

# -----------------------------
# Keep more useful columns
# -----------------------------
keep_cols = [
    "RFV1", "RFV2", "RFV3", "RFV4", "RFV5",
    "RFV13D",
    "PAINSCALE",
    "AGE",
    "SEX",
    "TEMPF",
    "PULSE",
    "BPSYS",
    "BPDIAS",
    "POPCT",
    "RESPR",
    "IMMEDR"
]

df = df[keep_cols].copy()

# Replace NHAMCS missing codes with NaN
df = df.replace([-7, -8, -9], np.nan)

# Keep only valid triage levels
df = df[df["IMMEDR"].isin([1, 2, 3, 4, 5])].copy()

# -----------------------------
# Feature engineering
# -----------------------------
rfv_cols = ["RFV1", "RFV2", "RFV3", "RFV4", "RFV5"]
df["symptom_count"] = df[rfv_cols].notna().sum(axis=1)

# Use grouped reason-for-visit code as chief complaint
df["chief_complaint"] = df["RFV13D"].fillna(0).astype(int).astype(str)

# Convert pain scale into a 1-5 urgency bucket
def pain_to_urgency(pain):
    if pd.isna(pain):
        return 3
    pain = float(pain)
    if pain >= 8:
        return 1
    elif pain >= 6:
        return 2
    elif pain >= 4:
        return 3
    elif pain >= 1:
        return 4
    else:
        return 5

df["self_reported_urgency"] = df["PAINSCALE"].apply(pain_to_urgency)

# -----------------------------
# Fill missing values
# -----------------------------
numeric_fill_cols = ["AGE", "TEMPF", "PULSE", "BPSYS", "BPDIAS", "POPCT", "RESPR"]
for col in numeric_fill_cols:
    df[col] = pd.to_numeric(df[col], errors="coerce")
    df[col] = df[col].fillna(df[col].median())

df["SEX"] = pd.to_numeric(df["SEX"], errors="coerce").fillna(0)

# -----------------------------
# Final model dataframe
# -----------------------------
df = df[
    [
        "chief_complaint",
        "self_reported_urgency",
        "symptom_count",
        "AGE",
        "SEX",
        "TEMPF",
        "PULSE",
        "BPSYS",
        "BPDIAS",
        "POPCT",
        "RESPR",
        "IMMEDR"
    ]
].dropna()

df = df.rename(columns={"IMMEDR": "triage_level"})

# Encode chief complaint
label_encoder = LabelEncoder()
df["chief_complaint_encoded"] = label_encoder.fit_transform(df["chief_complaint"])

feature_columns = [
    "chief_complaint_encoded",
    "self_reported_urgency",
    "symptom_count",
    "AGE",
    "SEX",
    "TEMPF",
    "PULSE",
    "BPSYS",
    "BPDIAS",
    "POPCT",
    "RESPR"
]

X = df[feature_columns]
y = df["triage_level"].astype(int)

# -----------------------------
# Train/test split
# -----------------------------
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42,
    stratify=y
)

# -----------------------------
# Train stronger model
# -----------------------------
model = RandomForestClassifier(
    n_estimators=400,
    max_depth=12,
    min_samples_split=5,
    min_samples_leaf=2,
    class_weight="balanced",
    random_state=42,
    n_jobs=-1
)

model.fit(X_train, y_train)

# -----------------------------
# Predict
# -----------------------------
pred = model.predict(X_test)

# -----------------------------
# Metrics
# -----------------------------
accuracy = accuracy_score(y_test, pred)
report_text = classification_report(y_test, pred, zero_division=0)

print("Accuracy:", accuracy)
print(report_text)

# -----------------------------
# Save model + encoder
# -----------------------------
joblib.dump(model, MODEL_PATH)
joblib.dump(label_encoder, ENCODER_PATH)

# -----------------------------
# Save classification report
# -----------------------------
with open(REPORT_PATH, "w", encoding="utf-8") as f:
    f.write("Random Forest Triage Model Evaluation\n")
    f.write("=" * 40 + "\n\n")
    f.write(f"Dataset: {DATA_PATH}\n")
    f.write(f"Rows used: {len(df)}\n")
    f.write(f"Train rows: {len(X_train)}\n")
    f.write(f"Test rows: {len(X_test)}\n")
    f.write(f"Accuracy: {accuracy:.4f}\n\n")
    f.write("Features Used\n")
    f.write("-" * 40 + "\n")
    for feature in feature_columns:
        f.write(f"- {feature}\n")
    f.write("\nClassification Report\n")
    f.write("-" * 40 + "\n")
    f.write(report_text)

# -----------------------------
# Save confusion matrix image
# -----------------------------
labels = sorted(y.unique().tolist())
cm = confusion_matrix(y_test, pred, labels=labels)

fig, ax = plt.subplots(figsize=(8, 6))
disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=labels)
disp.plot(ax=ax, colorbar=False)
ax.set_title("Confusion Matrix - Triage Level Prediction")
plt.tight_layout()
plt.savefig(CM_PATH, dpi=200, bbox_inches="tight")
plt.close(fig)

# -----------------------------
# Save feature importance CSV
# -----------------------------
feature_importance_df = pd.DataFrame({
    "feature": feature_columns,
    "importance": model.feature_importances_
}).sort_values("importance", ascending=False)

feature_importance_df.to_csv(FEATURE_IMPORTANCE_PATH, index=False)

# -----------------------------
# Save metrics summary JSON
# -----------------------------
metrics_summary = {
    "dataset_path": DATA_PATH,
    "rows_used": int(len(df)),
    "train_rows": int(len(X_train)),
    "test_rows": int(len(X_test)),
    "accuracy": float(accuracy),
    "features": feature_columns,
    "output_files": {
        "model": MODEL_PATH,
        "label_encoder": ENCODER_PATH,
        "classification_report": REPORT_PATH,
        "confusion_matrix": CM_PATH,
        "feature_importance": FEATURE_IMPORTANCE_PATH
    }
}

with open(METRICS_PATH, "w", encoding="utf-8") as f:
    json.dump(metrics_summary, f, indent=2)

print("Model saved successfully.")
print(f"Classification report saved to: {REPORT_PATH}")
print(f"Confusion matrix saved to: {CM_PATH}")
print(f"Feature importance saved to: {FEATURE_IMPORTANCE_PATH}")
print(f"Metrics summary saved to: {METRICS_PATH}")