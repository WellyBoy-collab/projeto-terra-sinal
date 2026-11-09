#!/usr/bin/env python3
"""
TERRA.SINAL — Agente de IA para verificação meteorológica / classificação de stress vegetal.
Treina um classificador (RandomForest) com dados sintéticos baseados nos exemplos do enunciado
e nos padrões de NDVI, precipitação (CHIRPS-like) e humidade do solo.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

RANDOM_STATE = 42
MODEL_DIR = Path(__file__).resolve().parent / "models"
MODEL_DIR.mkdir(exist_ok=True)

# Classes alinhadas com o domínio TERRA.SINAL
CLASSES = ["Saudável", "Ligeiro", "Moderado", "Severo"]
FEATURES = [
    "ndvi",
    "ndviAnomaly",
    "rainfall",
    "rainAnomaly",
    "soilMoisture",
    "rainLag",
    "soilLag",
]


def generate_synthetic_data(n_samples: int = 800) -> pd.DataFrame:
    """Gera dados sintéticos realistas para Búzi/Muanza com base nos exemplos do enunciado."""
    rng = np.random.default_rng(RANDOM_STATE)
    rows = []

    # Centróides aproximados por classe (inspirados no enunciado §4.4)
    centroids = {
        "Saudável": dict(ndvi=0.66, ndviAnomaly=0.02, rainfall=73, rainAnomaly=0.04, soilMoisture=0.34, rainLag=81, soilLag=0.36),
        "Ligeiro": dict(ndvi=0.55, ndviAnomaly=-0.06, rainfall=50, rainAnomaly=-0.10, soilMoisture=0.26, rainLag=55, soilLag=0.28),
        "Moderado": dict(ndvi=0.48, ndviAnomaly=-0.14, rainfall=30, rainAnomaly=-0.22, soilMoisture=0.19, rainLag=35, soilLag=0.20),
        "Severo": dict(ndvi=0.40, ndviAnomaly=-0.22, rainfall=18, rainAnomaly=-0.32, soilMoisture=0.14, rainLag=25, soilLag=0.15),
    }
    spreads = {
        "ndvi": 0.04,
        "ndviAnomaly": 0.03,
        "rainfall": 8.0,
        "rainAnomaly": 0.05,
        "soilMoisture": 0.03,
        "rainLag": 10.0,
        "soilLag": 0.03,
    }

    for cls in CLASSES:
        n = n_samples // 4
        c = centroids[cls]
        for _ in range(n):
            row = {feat: float(rng.normal(c[feat], spreads[feat])) for feat in FEATURES}
            # limites fisicamente razoáveis
            row["ndvi"] = float(np.clip(row["ndvi"], 0.15, 0.90))
            row["ndviAnomaly"] = float(np.clip(row["ndviAnomaly"], -0.45, 0.25))
            row["rainfall"] = float(np.clip(row["rainfall"], 0, 200))
            row["rainAnomaly"] = float(np.clip(row["rainAnomaly"], -0.6, 0.4))
            row["soilMoisture"] = float(np.clip(row["soilMoisture"], 0.05, 0.55))
            row["rainLag"] = float(np.clip(row["rainLag"], 0, 220))
            row["soilLag"] = float(np.clip(row["soilLag"], 0.05, 0.55))
            row["stressClass"] = cls
            rows.append(row)

    # Incluir os 3 registos oficiais do enunciado para ancoragem
    official = [
        {"ndvi": 0.52, "ndviAnomaly": -0.11, "rainfall": 38, "rainAnomaly": -0.18, "soilMoisture": 0.21, "rainLag": 46, "soilLag": 0.24, "stressClass": "Moderado"},
        {"ndvi": 0.41, "ndviAnomaly": -0.20, "rainfall": 19, "rainAnomaly": -0.31, "soilMoisture": 0.15, "rainLag": 38, "soilLag": 0.21, "stressClass": "Severo"},
        {"ndvi": 0.66, "ndviAnomaly": 0.02, "rainfall": 73, "rainAnomaly": 0.04, "soilMoisture": 0.34, "rainLag": 81, "soilLag": 0.36, "stressClass": "Saudável"},
    ]
    rows.extend(official)
    return pd.DataFrame(rows)


def train() -> dict:
    df = generate_synthetic_data(800)
    X = df[FEATURES].values
    y = df["stressClass"].values

    le = LabelEncoder()
    le.fit(CLASSES)  # ordem fixa
    y_enc = le.transform(y)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y_enc, test_size=0.25, random_state=RANDOM_STATE, stratify=y_enc
    )

    clf = RandomForestClassifier(
        n_estimators=120,
        max_depth=8,
        min_samples_leaf=3,
        random_state=RANDOM_STATE,
        class_weight="balanced",
        n_jobs=-1,
    )
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    labels = list(range(len(CLASSES)))

    metrics = {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "precision_macro": float(precision_score(y_test, y_pred, average="macro", zero_division=0)),
        "recall_macro": float(recall_score(y_test, y_pred, average="macro", zero_division=0)),
        "f1_macro": float(f1_score(y_test, y_pred, average="macro", zero_division=0)),
        "confusion_matrix": confusion_matrix(y_test, y_pred, labels=labels).tolist(),
        "classes": CLASSES,
        "feature_importances": dict(zip(FEATURES, [float(x) for x in clf.feature_importances_])),
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "model_type": "RandomForestClassifier",
        "version": "v1.0-python-weather-agent",
    }

    # Persistência
    joblib.dump(clf, MODEL_DIR / "stress_classifier.joblib")
    joblib.dump(le, MODEL_DIR / "label_encoder.joblib")
    with open(MODEL_DIR / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False)

    print("=== TERRA.SINAL AI Agent — Treino concluído ===")
    print(classification_report(y_test, y_pred, target_names=CLASSES, digits=3))
    print("Confusion matrix:")
    print(np.array(metrics["confusion_matrix"]))
    print(f"Accuracy: {metrics['accuracy']:.3f}")
    print(f"Modelos gravados em: {MODEL_DIR}")
    return metrics


if __name__ == "__main__":
    train()
