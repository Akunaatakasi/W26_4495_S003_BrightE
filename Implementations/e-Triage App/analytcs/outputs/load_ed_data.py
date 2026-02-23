import pandas as pd
import numpy as np
import os

# ---- Config ----
FILE_PATH = "../data/ed2022-stata.dta"
OUT_CLEAN = "../data/ed_clean.csv"
OUT_SAMPLE = "../data/ed_sample_150.csv"
SAMPLE_N = 150
SEED = 42

# ---- Load ----
df = pd.read_stata(FILE_PATH, convert_categoricals=False)

print("Dataset shape:", df.shape)
print("First 30 columns:", df.columns[:30].tolist())
print(df.head())

# ---- Quick variable search (optional) ----
keywords = ["IMMED", "DISP", "ADMIT", "LEFT", "SEEN", "TRI"]
print("\nPotential key variables:")
for col in df.columns:
    if any(k.lower() in col.lower() for k in keywords):
        print(col)

# ---- Keep only workflow columns ----
keep_cols = [
    "ARRTIME",
    "WAITTIME",
    "LOV",
    "IMMEDR",
    "NODISP",
    "LEFTAMA",
    "ADMIT",
    "ADISP",
    "BOARDED"
]

missing = [c for c in keep_cols if c not in df.columns]
if missing:
    raise KeyError(f"Missing columns in dataset: {missing}")

ed = df[keep_cols].copy()

# ---- Replace NHAMCS negative missing codes FIRST ----
ed = ed.replace([-7, -8, -9], np.nan)

print("\nClean dataset preview:")
print(ed.head())

print("\nAfter cleaning missing codes (describe):")
print(ed.describe(include="all"))

# ---- Save cleaned full dataset ----
os.makedirs(os.path.dirname(OUT_CLEAN), exist_ok=True)
ed.to_csv(OUT_CLEAN, index=False)
print(f"\nSaved: {OUT_CLEAN}")

# Drop rows with missing key fields so the sample is usable for metrics
usable = ed.dropna(subset=["WAITTIME", "LOV", "IMMEDR"]).copy()

if len(usable) < SAMPLE_N:
    raise ValueError(f"Not enough usable rows to sample {SAMPLE_N}. Usable rows: {len(usable)}")

sample_150 = usable.sample(n=SAMPLE_N, random_state=SEED).reset_index(drop=True)
sample_150.to_csv(OUT_SAMPLE, index=False)
print(f"Saved: {OUT_SAMPLE} (n={SAMPLE_N})")