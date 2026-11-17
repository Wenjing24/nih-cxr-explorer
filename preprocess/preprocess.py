"""Preprocess NIH ChestX-ray14 metadata (Data_Entry_2017.csv) for the web explorer.

The original CSV is only read, never modified. Outputs:

  public/data/images.json     compact column-oriented table, one entry per image
  tests/reference.json        independent pandas aggregates used to verify the
                              TypeScript calculations in the test suite

Usage:
  python preprocess/preprocess.py [path/to/Data_Entry_2017.csv]
"""
from __future__ import annotations

import json
import sys
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CSV = ROOT.parent / "Data_Entry_2017.csv"

# 14 thoracic findings, ordered by image frequency in the full dataset.
FINDINGS = [
    "Infiltration", "Effusion", "Atelectasis", "Nodule", "Mass", "Pneumothorax",
    "Consolidation", "Pleural_Thickening", "Cardiomegaly", "Emphysema", "Edema",
    "Fibrosis", "Pneumonia", "Hernia",
]
NO_FINDING = "No Finding"
MAX_PLAUSIBLE_AGE = 100  # recorded ages 148-414 are data-entry errors -> missing


def load(csv_path: Path) -> pd.DataFrame:
    raw = pd.read_csv(csv_path)
    # The header has a trailing comma (empty "Unnamed: 11" column) and splits the
    # bracketed size/spacing headers across two columns; keep only what we use.
    df = pd.DataFrame({
        "image": raw["Image Index"].astype(str),
        "labels": raw["Finding Labels"].fillna("").astype(str),
        "followup": pd.to_numeric(raw["Follow-up #"], errors="coerce"),
        "patient": pd.to_numeric(raw["Patient ID"], errors="coerce"),
        "age": pd.to_numeric(raw["Patient Age"], errors="coerce"),
        "sex": raw["Patient Gender"].where(raw["Patient Gender"].isin(["M", "F"])),
        "view": raw["View Position"].where(raw["View Position"].isin(["PA", "AP"])),
    })
    df.loc[(df["age"] < 0) | (df["age"] > MAX_PLAUSIBLE_AGE), "age"] = np.nan

    label_lists = df["labels"].str.split("|")
    unknown = set(label_lists.explode()) - set(FINDINGS) - {NO_FINDING, ""}
    if unknown:
        raise ValueError(f"Unexpected finding labels: {sorted(unknown)}")
    for f in FINDINGS:
        df[f] = label_lists.apply(lambda ls, f=f: f in ls)
    df["n_findings"] = df[FINDINGS].sum(axis=1)
    df["mask"] = sum(df[f].astype(np.int64) * (1 << i) for i, f in enumerate(FINDINGS))
    return df.sort_values(["patient", "followup"]).reset_index(drop=True)


def export_images(df: pd.DataFrame, out: Path, csv_path: Path) -> None:
    patient_codes, patient_ids = pd.factorize(df["patient"], sort=True)
    payload = {
        "source": csv_path.name,
        "findings": FINDINGS,
        "n": int(len(df)),
        "nPatients": int(len(patient_ids)),
        "notes": {
            "age": f"Ages > {MAX_PLAUSIBLE_AGE} years ({int(df['age'].isna().sum())} images) treated as missing (-1).",
            "sex": "0 = M, 1 = F, -1 = missing. Recorded gender as given in the metadata.",
            "view": "0 = PA, 1 = AP, -1 = missing.",
            "mask": "Bit i set = finding i present (order of `findings`); 0 = 'No Finding'.",
        },
        "patientId": [int(x) for x in patient_ids],
        "pid": patient_codes.tolist(),
        "age": df["age"].fillna(-1).astype(int).tolist(),
        "sex": df["sex"].map({"M": 0, "F": 1}).fillna(-1).astype(int).tolist(),
        "view": df["view"].map({"PA": 0, "AP": 1}).fillna(-1).astype(int).tolist(),
        "mask": df["mask"].astype(int).tolist(),
        "fu": df["followup"].fillna(-1).astype(int).tolist(),
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, separators=(",", ":")))
    print(f"wrote {out} ({out.stat().st_size / 1e6:.2f} MB)")


# --------------------------------------------------------------------------
# Reference aggregates (computed with pandas, independently of the TS code)
# --------------------------------------------------------------------------
IPP_BINS = [(1, 1), (2, 2), (3, 3), (4, 4), (5, 5), (6, 10), (11, 20), (21, 50), (51, 10_000)]
AGE_BINS = list(range(0, 100, 10))  # 0-9, 10-19, ..., 90-99 (100 folded in last)


def age_bin(age: pd.Series) -> pd.Series:
    return (np.minimum(age, 99) // 10 * 10).astype("Int64")


def finding_stats(d: pd.DataFrame) -> dict:
    out = {}
    for f in FINDINGS:
        sub = d[d[f]]
        out[f] = {
            "images": int(len(sub)),
            "patients": int(sub["patient"].nunique()),
            "PA": int((sub["view"] == "PA").sum()),
            "AP": int((sub["view"] == "AP").sum()),
        }
    return out


def venn_regions(d: pd.DataFrame, sel: list[str], unit: str) -> dict:
    """Exclusive region counts keyed by sorted '+'-joined finding names."""
    if unit == "patients":
        d = d.groupby("patient")[sel].any()
    res = {}
    for k in range(1, len(sel) + 1):
        for combo in combinations(sel, k):
            inside = np.logical_and.reduce([d[f] for f in combo])
            outside = [f for f in sel if f not in combo]
            if outside:
                inside &= ~np.logical_or.reduce([d[f] for f in outside])
            res["+".join(sorted(combo))] = int(inside.sum())
    none = ~np.logical_or.reduce([d[f] for f in sel])
    res["__none__"] = int(none.sum())
    return res


def ipp_hist(d: pd.DataFrame, finding: str | None) -> list[int]:
    per_patient = d.groupby("patient").agg(n=("image", "size"), **({"has": (finding, "any")} if finding else {}))
    if finding:
        per_patient = per_patient[per_patient["has"]]
    return [int(((per_patient["n"] >= lo) & (per_patient["n"] <= hi)).sum()) for lo, hi in IPP_BINS]


def build_reference(df: pd.DataFrame) -> dict:
    ref: dict = {}
    first = df.groupby("patient").first()
    ref["totals"] = {
        "images": int(len(df)),
        "patients": int(df["patient"].nunique()),
        "patientsBySex": {k: int(v) for k, v in first["sex"].value_counts().items()},
        "imagesByView": {k: int(v) for k, v in df["view"].value_counts().items()},
        "missingAgeImages": int(df["age"].isna().sum()),
        "noFindingImages": int((df["n_findings"] == 0).sum()),
    }
    ref["findings"] = finding_stats(df)
    ref["complexity"] = {
        v: {int(k): int(c) for k, c in df.loc[df["view"] == v, "n_findings"].value_counts().items()}
        for v in ["PA", "AP"]
    }
    ref["imagesPerPatientAll"] = ipp_hist(df, None)
    ref["imagesPerPatient"] = {f: ipp_hist(df, f) for f in ["Hernia", "Pneumonia", "Infiltration"]}

    sel = ["Atelectasis", "Effusion", "Infiltration"]
    ref["venn"] = {
        "selection": sel,
        "images": venn_regions(df, sel, "images"),
        "patients": venn_regions(df, sel, "patients"),
        "pairImages": venn_regions(df, ["Cardiomegaly", "Edema"], "images"),
    }

    # Prevalence of Effusion by 10-year age bin and sex (images)
    d = df.dropna(subset=["age"]).assign(bin=lambda x: age_bin(x["age"]))
    prev = {}
    for s in ["M", "F"]:
        g = d[d["sex"] == s].groupby("bin")
        prev[s] = {int(b): {"n": int(len(x)), "k": int(x["Effusion"].sum())} for b, x in g}
    ref["prevalenceEffusionImages"] = prev
    # Patient unit: distinct patients with >=1 image in the bin, and those with Effusion there
    prevp = {}
    for s in ["M", "F"]:
        g = d[d["sex"] == s].groupby("bin")
        prevp[s] = {int(b): {"n": int(x["patient"].nunique()), "k": int(x.loc[x["Effusion"], "patient"].nunique())} for b, x in g}
    ref["prevalenceEffusionPatients"] = prevp

    # A filtered scenario: female, AP view, age 20-39 inclusive
    filt = df[(df["sex"] == "F") & (df["view"] == "AP") & df["age"].between(20, 39)]
    ref["filtered_F_AP_20_39"] = {
        "images": int(len(filt)),
        "patients": int(filt["patient"].nunique()),
        "findings": finding_stats(filt),
        "venn": venn_regions(filt, sel, "images"),
        "ipp_Effusion": ipp_hist(filt, "Effusion"),
    }
    return ref


def main() -> None:
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    df = load(csv_path)
    print(f"loaded {len(df):,} images from {df['patient'].nunique():,} patients")
    export_images(df, ROOT / "public" / "data" / "images.json", csv_path)
    ref = build_reference(df)
    (ROOT / "tests").mkdir(exist_ok=True)
    (ROOT / "tests" / "reference.json").write_text(json.dumps(ref, indent=1))
    print("wrote tests/reference.json")


if __name__ == "__main__":
    main()
