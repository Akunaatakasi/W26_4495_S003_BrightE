from flask import Flask, request, jsonify
import joblib
import pandas as pd

app = Flask(__name__)

MODEL_PATH = "analytics/ml/triage_model.pkl"
ENCODER_PATH = "analytics/ml/label_encoder.pkl"

model = joblib.load(MODEL_PATH)
label_encoder = joblib.load(ENCODER_PATH)

FEATURE_COLUMNS = [
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

        # Default values for now if frontend does not send them yet
        age = float(data.get("age", 40))
        sex = float(data.get("sex", 0))
        tempf = float(data.get("tempf", 98.6))
        pulse = float(data.get("pulse", 80))
        bpsys = float(data.get("bpsys", 120))
        bpdias = float(data.get("bpdias", 80))
        popct = float(data.get("popct", 98))
        respr = float(data.get("respr", 16))

        known_labels = set(label_encoder.classes_)
        if chief_complaint in known_labels:
            chief_complaint_encoded = label_encoder.transform([chief_complaint])[0]
        else:
            chief_complaint_encoded = 0

        features_df = pd.DataFrame([{
            "chief_complaint_encoded": chief_complaint_encoded,
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
        }], columns=FEATURE_COLUMNS)

        prediction = int(model.predict(features_df)[0])

        return jsonify({
            "predicted_triage_level": prediction
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    print("Starting ML Triage API on port 5000...")
    app.run(host="127.0.0.1", port=5000)