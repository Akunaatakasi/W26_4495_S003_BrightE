from flask import Flask, request, jsonify
import joblib
import pandas as pd

app = Flask(__name__)

TRIAGE_MODEL_PATH = "analytics/ml/triage_model.pkl"
TRIAGE_ENCODER_PATH = "analytics/ml/label_encoder.pkl"

WAIT_MODEL_PATH = "analytics/ml/wait_time_model.pkl"
WAIT_ENCODER_PATH = "analytics/ml/wait_time_label_encoder.pkl"

triage_model = joblib.load(TRIAGE_MODEL_PATH)
triage_label_encoder = joblib.load(TRIAGE_ENCODER_PATH)

wait_time_model = joblib.load(WAIT_MODEL_PATH)
wait_time_label_encoder = joblib.load(WAIT_ENCODER_PATH)

TRIAGE_FEATURE_COLUMNS = [
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

WAIT_FEATURE_COLUMNS = [
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

def encode_chief_complaint(chief_complaint, encoder):
    known_labels = set(encoder.classes_)
    if chief_complaint in known_labels:
        return encoder.transform([chief_complaint])[0]
    return 0

@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.json or {}

        chief_complaint = str(data.get("chief_complaint", "")).strip().lower()
        symptoms = data.get("symptoms", [])
        if not isinstance(symptoms, list):
            symptoms = []

        symptom_count = len(symptoms)

        self_reported_urgency = int(data.get("self_reported_urgency", 5))

        age = float(data.get("age", 40))
        sex = float(data.get("sex", 0))
        tempf = float(data.get("tempf", 98.6))
        pulse = float(data.get("pulse", 80))
        bpsys = float(data.get("bpsys", 120))
        bpdias = float(data.get("bpdias", 80))
        popct = float(data.get("popct", 98))
        respr = float(data.get("respr", 16))

        triage_chief_encoded = encode_chief_complaint(chief_complaint, triage_label_encoder)

        triage_df = pd.DataFrame([{
            "chief_complaint_encoded": triage_chief_encoded,
            "self_reported_urgency": self_reported_urgency,
            "symptom_count": symptom_count,
            "AGE": age,
            "SEX": sex,
            "TEMPF": tempf,
            "PULSE": pulse,
            "BPSYS": bpsys,
            "BPDIAS": bpdias,
            "POPCT": popct,
            "RESPR": respr
        }], columns=TRIAGE_FEATURE_COLUMNS)

        predicted_triage_level = int(triage_model.predict(triage_df)[0])

        wait_chief_encoded = encode_chief_complaint(chief_complaint, wait_time_label_encoder)

        wait_df = pd.DataFrame([{
            "chief_complaint_encoded": wait_chief_encoded,
            "self_reported_urgency": self_reported_urgency,
            "symptom_count": symptom_count,
            "AGE": age,
            "SEX": sex,
            "TEMPF": tempf,
            "PULSE": pulse,
            "BPSYS": bpsys,
            "BPDIAS": bpdias,
            "POPCT": popct,
            "RESPR": respr,
            "IMMEDR": predicted_triage_level
        }], columns=WAIT_FEATURE_COLUMNS)

        predicted_wait_time = float(wait_time_model.predict(wait_df)[0])
        predicted_wait_time = max(0, round(predicted_wait_time, 1))

        return jsonify({
            "predicted_triage_level": predicted_triage_level,
            "predicted_wait_time_minutes": predicted_wait_time
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    print("Starting ML API on port 5000...")
    app.run(host="127.0.0.1", port=5000)
