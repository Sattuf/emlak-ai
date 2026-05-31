# -*- coding: utf-8 -*-
"""FastAPI: eğitilmiş model (model.pkl) ile konut fiyat tahmini."""
from __future__ import annotations

import os
import pickle
from pathlib import Path
from typing import Any, Literal

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL = ROOT / "model" / "model.pkl"

app = FastAPI(title="EmlakAI API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_bundle: dict[str, Any] | None = None


def load_bundle() -> dict[str, Any]:
    global _bundle
    if _bundle is not None:
        return _bundle
    path = Path(os.environ.get("MODEL_PATH", str(DEFAULT_MODEL)))
    if not path.is_file():
        raise RuntimeError(f"Model dosyası yok: {path}. Önce train.py çalıştırın.")
    with open(path, "rb") as f:
        _bundle = pickle.load(f)
    return _bundle


@app.on_event("startup")
def _startup():
    load_bundle()


class PredictBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    islem: Literal["Satılık", "Kiralık"]
    sehir: str = Field(validation_alias="Şehir")
    ilce: str = Field(validation_alias="İlçe")
    konut_tipi: str = Field(validation_alias="Konut Tipi")
    isitma: str = Field(validation_alias="Isıtma Sistemi")
    m2: float
    oda: float
    kat: float
    bina: str


def _row_from_body(b: PredictBody, bina_map: dict[str, int]) -> dict[str, Any]:
    bn = float(bina_map.get(b.bina, 7))
    return {
        "Şehir": b.sehir,
        "İlçe": b.ilce,
        "Konut Tipi": b.konut_tipi,
        "Isıtma Sistemi": b.isitma,
        "m2": b.m2,
        "Oda Sayısı": b.oda,
        "Bulunduğu Kat": b.kat,
        "bina_numeric": bn,
    }


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/meta")
def meta():
    b = load_bundle()
    m = b["meta"]
    return {
        "hier": m["hier"],
        "enc": m["enc"],
        "bina_ui_labels": m["bina_ui_labels"],
        "metrics": m["metrics"],
        "n_rows": b.get("n_rows_used"),
        "excel_path": b.get("excel_path"),
    }


@app.post("/api/predict")
def predict(body: PredictBody):
    b = load_bundle()
    pipe = b["pipelines"].get(body.islem)
    if pipe is None:
        raise HTTPException(400, "Geçersiz işlem türü")
    meta = b["meta"]
    bina_map = meta.get("bina_ui_map", {})
    row = _row_from_body(body, bina_map)
    cols = meta["cat_cols"] + meta["num_cols"]
    frame = pd.DataFrame([{c: row[c] for c in cols}])
    logp = float(pipe.predict(frame)[0])
    price = float(np.expm1(logp))
    low = price * 0.90
    high = price * 1.10
    ex = meta.get("training_extras", {}).get(body.islem, {})
    return {
        "price": price,
        "low": low,
        "high": high,
        "fi": ex.get("fi", {}),
        "stats": ex.get("stats", {}),
    }
