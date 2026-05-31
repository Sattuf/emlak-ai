# -*- coding: utf-8 -*-
"""
Eğitim betiği: Veri_Madenciligi_Master_Dataset.xlsx dosyasından
Satılık ve Kiralık için iki ayrı Gradient Boosting modeli üretir.
Çıktı: model/bundle.pkl
"""
from __future__ import annotations

import argparse
import json
import os
import pickle
import re
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_percentage_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

# Arayüz ile uyumlu bina yaşı → sayısal temsil (tahmin için)
BINA_YASI_UI = {
    "Yeni (0)": 0,
    "1 Yaş": 1,
    "2 Yaş": 2,
    "3 Yaş": 3,
    "4 Yaş": 4,
    "5-10 Yıl": 7,
    "11-15 Yıl": 13,
    "16-20 Yıl": 18,
    "21+ Yıl": 25,
}

CAT_COLS = [
    "Şehir",
    "İlçe",
    "Konut Tipi",
    "Isıtma Sistemi",
]
NUM_COLS = [
    "m2",
    "Oda Sayısı",
    "Bulunduğu Kat",
    "bina_numeric",
]


def _excel_path() -> Path:
    return Path(
        os.environ.get(
            "EXCEL_PATH",
            r"C:\Users\sattuf\Desktop\Veri_Madenciligi_Master1.xlsx",
        )
    )


def _normalize_islem(s: str) -> str | None:
    if pd.isna(s):
        return None
    s = str(s).strip().lower()
    # Handle variations of Satılık / Kiralık
    if s in ("satılık", "satilik", "satılık ", " satılık", "satlik"):
        return "Satılık"
    if s in ("kiralık", "kiralik", "kiralık ", " kiralık", "kirlik"):
        return "Kiralık"
    return None


def _excel_bina_to_numeric(val) -> float:
    """Excel 'Bina Yaşı' hücresini sayıya çevirir; anlamsız değerler NaN."""
    if pd.isna(val):
        return np.nan
    s = str(val).strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        return np.nan
    m = {
        "0 (Yeni)": 0,
        "1": 1,
        "2": 2,
        "3": 3,
        "4": 4,
        "11-15": 13,
        "15-nov": 13,
        "16-20": 18,
        "21 ve üzeri": 25,
    }
    key = s.lower()
    if key in m:
        return float(m[key])
    if s.isdigit():
        return float(int(s))
    return np.nan


def load_and_clean(path: Path) -> pd.DataFrame:
    # Read all sheets from the excel file and combine them
    sheets = pd.read_excel(path, sheet_name=None)
    df = pd.concat(sheets.values(), ignore_index=True)
    
    # Sütun isimlerinin başındaki ve sonundaki boşlukları temizle
    df.columns = df.columns.str.strip()
    
    print(f"\n--- DEBUG BİLGİSİ ---")
    print(f"Excel'den okunan TOPLAM satır sayısı: {len(df)}")
    print(f"Excel'deki Sütunlar (Temizlenmiş): {df.columns.tolist()}")
    print(f"---------------------\n")
    
    # Yeni veri seti için sütun isimlerini eşleştir
    rename = {
        "il": "Şehir",
        "İl": "Şehir",
        "ilçe": "İlçe",
        "İlçe": "İlçe",
        "Metrekare": "m2",
        "Metrekare (m2)": "m2",
        "Metrekare(m2)": "m2",
        "Bulunduğu Katı": "Bulunduğu Kat",
        "Isıtma Sist": "Isıtma Sistemi",
        "Isıtma Tipi": "Isıtma Sistemi",
        "Oda Sayisi": "Oda Sayısı",
        "Oda": "Oda Sayısı",
        "Fiyat": "Fiyat (TL)",
        "Bina Yasi": "Bina Yaşı",
    }
    df = df.rename(columns=rename)
    
    # Ensure mandatory columns exist as fallbacks if missing
    if "İşlem Türü" not in df.columns:
        df["İşlem Türü"] = "Satılık"
    if "Fiyat (TL)" not in df.columns:
        df["Fiyat (TL)"] = 0
    if "Bina Yaşı" not in df.columns:
        df["Bina Yaşı"] = "0"
        
    df["İşlem Türü"] = df["İşlem Türü"].map(_normalize_islem)
    df = df.dropna(subset=["İşlem Türü", "Fiyat (TL)"])
    
    df["bina_numeric"] = df["Bina Yaşı"].map(_excel_bina_to_numeric)
    med = df["bina_numeric"].median()
    if pd.isna(med):
        med = 0
    df["bina_numeric"] = df["bina_numeric"].fillna(float(med))
    
    for c in CAT_COLS:
        if c not in df.columns:
            df[c] = "Bilinmiyor"
        df[c] = df[c].fillna("Bilinmiyor").astype(str).str.strip().str.title()
        
    for c in ["m2", "Oda Sayısı", "Bulunduğu Kat"]:
        if c not in df.columns:
            df[c] = 0
        df[c] = pd.to_numeric(df[c], errors="coerce")
        
    df = df.dropna(subset=["m2"])
    
    for c in ["Oda Sayısı", "Bulunduğu Kat"]:
        med_val = df[c].median()
        if pd.isna(med_val):
            med_val = 0
        df[c] = df[c].fillna(med_val)
        
    df["Fiyat (TL)"] = pd.to_numeric(df["Fiyat (TL)"], errors="coerce")
    df = df.dropna(subset=["Fiyat (TL)"])
    df = df[df["Fiyat (TL)"] > 0]
    
    return df


def build_hierarchy(df: pd.DataFrame) -> dict:
    hier_is = (
        df.groupby("Şehir")["İlçe"]
        .apply(lambda s: sorted(s.unique().tolist()))
        .to_dict()
    )
    return {"is": hier_is}


def encodings(df: pd.DataFrame) -> dict:
    out = {}
    for c in CAT_COLS:
        if c not in df.columns:
            continue
        out[c] = sorted(df[c].astype(str).unique().tolist())
    return out


def make_pipeline() -> Pipeline:
    pre = ColumnTransformer(
        [
            (
                "cat",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                CAT_COLS,
            ),
            ("num", "passthrough", NUM_COLS),
        ]
    )
    model = GradientBoostingRegressor(
        n_estimators=180,
        max_depth=5,
        learning_rate=0.08,
        subsample=0.9,
        random_state=42,
    )
    return Pipeline([("pre", pre), ("model", model)])


def aggregate_importances(pipe: Pipeline, top: int = 8) -> dict[str, float]:
    pre: ColumnTransformer = pipe.named_steps["pre"]
    model: GradientBoostingRegressor = pipe.named_steps["model"]
    names = pre.get_feature_names_out()
    imp = model.feature_importances_
    agg: dict[str, float] = defaultdict(float)
    cat_by_len = sorted(CAT_COLS, key=len, reverse=True)
    for n, w in zip(names, imp):
        w = float(w)
        if n.startswith("num__"):
            col = n.replace("num__", "", 1)
            agg[col] += w
            continue
        if n.startswith("cat__"):
            rest = n[5:]
            for c in cat_by_len:
                if rest.startswith(c + "_"):
                    agg[c] += w
                    break
    keys = CAT_COLS + NUM_COLS
    for k in keys:
        agg[k] += 0.0
    total = sum(agg[k] for k in keys) or 1.0
    rel = {k: round(100.0 * agg[k] / total, 1) for k in keys}
    rel_sorted = dict(sorted(rel.items(), key=lambda x: -x[1])[:top])
    s = sum(rel_sorted.values()) or 1.0
    return {k: round(100.0 * v / s, 1) for k, v in rel_sorted.items()}


def price_stats(y: np.ndarray) -> dict:
    return {
        "min": float(np.min(y)),
        "median": float(np.median(y)),
        "mean": float(np.mean(y)),
        "max": float(np.max(y)),
    }


def train_one(df: pd.DataFrame, islem: str) -> tuple[Pipeline, dict, dict]:
    sub = df[df["İşlem Türü"] == islem].copy()
    X = sub[CAT_COLS + NUM_COLS]
    y = np.log1p(sub["Fiyat (TL)"].values)
    pipe = make_pipeline()
    pipe.fit(X, y)
    pred_log = pipe.predict(X)
    pred = np.expm1(pred_log)
    y_true = sub["Fiyat (TL)"].values
    r2 = float(r2_score(y_true, pred))
    try:
        mape = float(mean_absolute_percentage_error(y_true, pred))
    except Exception:
        mape = float(np.mean(np.abs((y_true - pred) / np.clip(y_true, 1e-9, None))) * 100)
    metrics = {"r2": round(r2, 4), "mape_pct": round(mape * 100, 2) if mape < 1 else round(mape, 2)}
    fi = aggregate_importances(pipe)
    stats = price_stats(y_true)
    return pipe, metrics, {"fi": fi, "stats": stats, "n_samples": int(len(sub))}


def main():
    ap = argparse.ArgumentParser(description="Emlak fiyat modeli eğitimi")
    ap.add_argument(
        "--excel",
        type=str,
        default=str(_excel_path()),
        help="Excel veri dosyası yolu",
    )
    ap.add_argument(
        "--out",
        type=str,
        default=str(Path(__file__).resolve().parent / "model" / "model.pkl"),
        help="Çıktı pickle yolu",
    )
    args = ap.parse_args()
    path = Path(args.excel)
    if not path.is_file():
        raise SystemExit(f"Excel bulunamadı: {path}")

    df = load_and_clean(path)
    hier = build_hierarchy(df)
    enc = encodings(df)

    pipelines = {}
    metrics_all = {}
    extras = {}
    for islem in ("Satılık", "Kiralık"):
        pipe, metrics, ex = train_one(df, islem)
        pipelines[islem] = pipe
        metrics_all[islem] = metrics
        extras[islem] = ex

    bundle = {
        "version": 1,
        "excel_path": str(path.resolve()),
        "n_rows_used": int(len(df)),
        "pipelines": pipelines,
        "meta": {
            "hier": hier,
            "enc": enc,
            "cat_cols": CAT_COLS,
            "num_cols": NUM_COLS,
            "bina_ui_labels": list(BINA_YASI_UI.keys()),
            "bina_ui_map": BINA_YASI_UI,
            "metrics": metrics_all,
            "training_extras": extras,
        },
    }

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "wb") as f:
        pickle.dump(bundle, f)

    summary = {
        "model_file": str(out_path.resolve()),
        "rows": bundle["n_rows_used"],
        "metrics": metrics_all,
    }
    out_json = json.dumps(summary, ensure_ascii=False, indent=2)
    try:
        print(out_json)
    except UnicodeEncodeError:
        sys.stdout.buffer.write((out_json + "\n").encode("utf-8", errors="replace"))
    try:
        print("Tamamlandı:", str(out_path))
    except UnicodeEncodeError:
        sys.stdout.buffer.write(("Tamamlandi: " + str(out_path) + "\n").encode("ascii", errors="replace"))


if __name__ == "__main__":
    main()
