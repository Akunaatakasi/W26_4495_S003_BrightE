import os
import json
import joblib
import numpy as np
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import LabelEncoder

# -----------------------------
# Paths
# -----------------------------
DATA_PATH = "analytics/data/ed2022-stata.dta"
ML_DIR = "analytics/ml"
OUTPUT_DIR = os.path.join(ML_DIR, "outputs")

os.makedirs(ML_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

MODEL_PATH = os.path.join(ML_DIR, "wait_time_model.pkl")
ENCODER_PATH = os.path.join(ML_DIR, "wait_time_label_encoder.pkl")
METRICS_PATH = os.path.join(OUTPUT_DIR, "wait_time_metrics.json")

# -----------------------------
# Load dataset
# -----------------------------
df = pd.read_stata(DATA_PATH, convert_categoricals=False)

# -----------------------------
# Keep needed columns
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
    "IMMEDR",
    "WAITTIME"
]

df = df[keep_cols].copy()

# -----------------------------
# Replace missing codes
# -----------------------------
for col in df.columns:
    df[col] = df[col].replace([-7, -8, -9], np.nan)

# Extra cleanup for vitals
df["PULSE"] = df["PULSE"].replace([998], np.nan)
df["BPDIAS"] = df["BPDIAS"].replace([998], np.nan)

# Keep valid wait times only
df["WAITTIME"] = pd.to_numeric(df["WAITTIME"], errors="coerce")
df = df[df["WAITTIME"].notna()].copy()
df = df[(df["WAITTIME"] >= 0) & (df["WAITTIME"] <= 600)].copy()

# Keep valid triage levels if available
df["IMMEDR"] = pd.to_numeric(df["IMMEDR"], errors="coerce")
df.loc[~df["IMMEDR"].isin([1, 2, 3, 4, 5]), "IMMEDR"] = np.nan

# -----------------------------
# Feature engineering
# -----------------------------
rfv_cols = ["RFV1", "RFV2", "RFV3", "RFV4", "RFV5"]
df["symptom_count"] = df[rfv_cols].notna().sum(axis=1)

df["chief_complaint"] = df["RFV13D"].fillna(0).astype(int).astype(str)

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
# Fix data formats
# -----------------------------
numeric_fill_cols = ["AGE", "TEMPF", "PULSE", "BPSYS", "BPDIAS", "POPCT", "RESPR", "IMMEDR"]
for col in numeric_fill_cols:
    df[col] = pd.to_numeric(df[col], errors="coerce")

# TEMPF in NHAMCS is often stored like 986 = 98.6 F
df["TEMPF"] = df["TEMPF"] / 10.0

for col in numeric_fill_cols:
    df[col] = df[col].fillna(df[col].median())

df["SEX"] = pd.to_numeric(df["SEX"], errors="coerce").fillna(0)

# -----------------------------
# Encode chief complaint
# -----------------------------
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
    "RESPR",
    "IMMEDR"
]

X = df[feature_columns]
y = df["WAITTIME"]

# -----------------------------
# Train/test split
# -----------------------------
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42
)

# -----------------------------
# Train model
# -----------------------------
model = RandomForestRegressor(
    n_estimators=300,
    max_depth=12,
    min_samples_split=5,
    min_samples_leaf=2,
    random_state=42,
    n_jobs=-1
)

model.fit(X_train, y_train)

# -----------------------------
# Evaluate
# -----------------------------
pred = model.predict(X_test)

mae = mean_absolute_error(y_test, pred)
rmse = np.sqrt(mean_squared_error(y_test, pred))
r2 = r2_score(y_test, pred)

print("MAE:", round(mae, 2))
print("RMSE:", round(rmse, 2))
print("R2:", round(r2, 4))

# -----------------------------
# Save model
# -----------------------------
joblib.dump(model, MODEL_PATH)
joblib.dump(label_encoder, ENCODER_PATH)

metrics_summary = {
    "dataset_path": DATA_PATH,
    "rows_used": int(len(df)),
    "train_rows": int(len(X_train)),
    "test_rows": int(len(X_test)),
    "mae_minutes": float(round(mae, 2)),
    "rmse_minutes": float(round(rmse, 2)),
    "r2": float(round(r2, 4)),
    "features": feature_columns
}

with open(METRICS_PATH, "w", encoding="utf-8") as f:
    json.dump(metrics_summary, f, indent=2)

print("Saved wait time model to:", MODEL_PATH)
print("Saved encoder to:", ENCODER_PATH)
print("Saved metrics to:", METRICS_PATH)