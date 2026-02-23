import pandas as pd
import numpy as np

file_path = "../data/ed2022-stata.dta"
df = pd.read_stata(file_path, convert_categoricals=False)

print("Dataset shape:", df.shape)
print("First 30 columns:", df.columns[:30].tolist())
print(df.head())
keywords = ["IMMED", "DISP", "ADMIT", "LEFT", "SEEN", "TRI"]

print("\nPotential key variables:")
for col in df.columns:
    if any(k.lower() in col.lower() for k in keywords):
        print(col)
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

ed = df[keep_cols].copy()

print("\nClean dataset preview:")
print(ed.head())

ed.to_csv("../data/ed_clean.csv", index=False)
print("\nSaved ed_clean.csv")
# Replace NHAMCS negative missing codes
ed = ed.replace([-7, -8, -9], np.nan)

print("\nAfter cleaning missing codes:")
print(ed.describe())
