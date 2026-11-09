#!/usr/bin/env python3
"""
TERRA.SINAL — Agente de IA (Python) para verificação meteorológica e classificação de stress.
Expõe REST endpoints consumidos pelo backend ASP.NET Core.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

MODEL_DIR = Path(__file__).resolve().parent / "models"
FEATURES = [
    "ndvi",
    "ndviAnomaly",
    "rainfall",
    "rainAnomaly",
    "soilMoisture",
    "rainLag",
    "soilLag",
]

app = FastAPI(
    title="TERRA.SINAL Weather Verification AI Agent",
    description="Agente de IA treinado em Python para verificação de indicadores meteorológicos e classificação de stress vegetal (Búzi / Muanza).",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Estado global do modelo
_clf = None
_le = None
_metrics: Dict[str, Any] = {}


def load_model() -> None:
    global _clf, _le, _metrics
    clf_path = MODEL_DIR / "stress_classifier.joblib"
    le_path = MODEL_DIR / "label_encoder.joblib"
    metrics_path = MODEL_DIR / "metrics.json"
    if not clf_path.exists() or not le_path.exists():
        # Treino automático se modelos em falta
        from train_model import train
        train()
    _clf = joblib.load(clf_path)
    _le = joblib.load(le_path)
    if metrics_path.exists():
        with open(metrics_path, encoding="utf-8") as f:
            _metrics = json.load(f)


@app.on_event("startup")
def startup() -> None:
    load_model()


class ObservationInput(BaseModel):
    ndvi: float = Field(..., ge=0.0, le=1.0, description="Índice de Vegetação por Diferença Normalizada")
    ndviAnomaly: float = Field(..., ge=-1.0, le=1.0)
    rainfall: float = Field(..., ge=0.0, description="Precipitação (mm) — fonte tipo CHIRPS")
    rainAnomaly: float = Field(..., ge=-1.0, le=1.0)
    soilMoisture: float = Field(..., ge=0.0, le=1.0, description="Humidade do solo (fração)")
    rainLag: float = Field(..., ge=0.0, description="Precipitação no período anterior (T−1)")
    soilLag: float = Field(..., ge=0.0, le=1.0, description="Humidade do solo no período anterior (T−1)")
    region: Optional[str] = None
    period: Optional[str] = None


class BatchObservationInput(BaseModel):
    observations: List[ObservationInput]


class PredictionResult(BaseModel):
    stressClass: str
    confidence: float
    probabilities: Dict[str, float]
    region: Optional[str] = None
    period: Optional[str] = None
    modelVersion: str
    featuresUsed: List[str]
    verificationNotes: List[str]


class MetricsResponse(BaseModel):
    modelVersion: str
    modelType: str
    accuracy: float
    precision_macro: float
    recall_macro: float
    f1_macro: float
    confusion_matrix: List[List[int]]
    classes: List[str]
    feature_importances: Dict[str, float]
    n_train: int
    n_test: int


def _predict_one(obs: ObservationInput) -> PredictionResult:
    if _clf is None or _le is None:
        raise HTTPException(status_code=503, detail="Modelo não carregado")

    x = np.array([[getattr(obs, f) for f in FEATURES]], dtype=float)
    proba = _clf.predict_proba(x)[0]
    pred_idx = int(np.argmax(proba))
    pred_label = _le.inverse_transform([pred_idx])[0]
    confidence = float(proba[pred_idx])

    probs = {cls: float(p) for cls, p in zip(_le.classes_, proba)}

    notes: List[str] = []
    # Regras de verificação meteorológica simples (explicabilidade)
    if obs.rainfall < 25 and obs.rainAnomaly < -0.25:
        notes.append("Precipitação muito baixa e anomalia negativa acentuada (possível défice hídrico).")
    if obs.soilMoisture < 0.18:
        notes.append("Humidade do solo abaixo do limiar de atenção (< 0.18).")
    if obs.ndviAnomaly < -0.15:
        notes.append("Anomalia NDVI negativa significativa — vegetação sob pressão.")
    if obs.rainLag > 0 and obs.rainfall < obs.rainLag * 0.6:
        notes.append("Queda acentuada de precipitação em relação ao período anterior (T−1).")
    if not notes:
        notes.append("Indicadores meteorológicos dentro de padrões esperados para a classe prevista.")

    if pred_label == "Severo":
        notes.append("ALERTA: classe Severo — recomenda-se validação humana e monitorização reforçada.")

    return PredictionResult(
        stressClass=pred_label,
        confidence=round(confidence, 4),
        probabilities={k: round(v, 4) for k, v in probs.items()},
        region=obs.region,
        period=obs.period,
        modelVersion=_metrics.get("version", "v1.0-python-weather-agent"),
        featuresUsed=FEATURES,
        verificationNotes=notes,
    )


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "service": "TERRA.SINAL Weather Verification AI Agent",
        "modelLoaded": _clf is not None,
        "version": _metrics.get("version", "unknown"),
    }


@app.get("/metrics", response_model=MetricsResponse)
def metrics() -> MetricsResponse:
    if not _metrics:
        raise HTTPException(status_code=503, detail="Métricas não disponíveis")
    return MetricsResponse(
        modelVersion=_metrics.get("version", "v1.0"),
        modelType=_metrics.get("model_type", "RandomForestClassifier"),
        accuracy=_metrics["accuracy"],
        precision_macro=_metrics["precision_macro"],
        recall_macro=_metrics["recall_macro"],
        f1_macro=_metrics["f1_macro"],
        confusion_matrix=_metrics["confusion_matrix"],
        classes=_metrics["classes"],
        feature_importances=_metrics["feature_importances"],
        n_train=_metrics["n_train"],
        n_test=_metrics["n_test"],
    )


@app.post("/verify", response_model=PredictionResult)
def verify(obs: ObservationInput) -> PredictionResult:
    """Verificação meteorológica + classificação de stress para uma observação."""
    return _predict_one(obs)


@app.post("/verify/batch")
def verify_batch(payload: BatchObservationInput) -> Dict[str, Any]:
    results = [_predict_one(o) for o in payload.observations]
    return {"count": len(results), "results": [r.model_dump() for r in results]}


@app.get("/features")
def features() -> Dict[str, Any]:
    return {
        "features": FEATURES,
        "description": {
            "ndvi": "Normalized Difference Vegetation Index",
            "ndviAnomaly": "Anomalia do NDVI em relação à média histórica",
            "rainfall": "Precipitação acumulada (mm) — fonte tipo CHIRPS",
            "rainAnomaly": "Anomalia de precipitação",
            "soilMoisture": "Humidade do solo (fração 0-1)",
            "rainLag": "Precipitação do período anterior (T−1)",
            "soilLag": "Humidade do solo do período anterior (T−1)",
        },
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8001"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
