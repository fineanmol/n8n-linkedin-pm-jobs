#!/usr/bin/env python3
"""Side-by-side PDF metrics: golden vs export. Exit 0 if within tolerances."""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.stderr.write("Need PyMuPDF: pip install pymupdf\n")
    sys.exit(2)


def text_bbox(page):
    r = None
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        bb = fitz.Rect(b["bbox"])
        r = bb if r is None else r | bb
    return r


def metrics(path: str) -> dict:
    d = fitz.open(path)
    page = d[0]
    mb = page.mediabox
    bb = text_bbox(page)
    sizes = []
    name_size = None
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        for line in b.get("lines", []):
            for s in line.get("spans", []):
                t = s["text"].strip()
                if not t:
                    continue
                sizes.append(round(s["size"], 1))
                if "SAKSHI CHAUDHARY" in t.upper().replace("  ", " "):
                    sz = round(s["size"], 1)
                    if name_size is None or sz > name_size:
                        name_size = sz
    hist = Counter(sizes)
    body = hist.most_common(1)[0][0] if hist else None
    return {
        "pages": len(d),
        "name_pt": name_size,
        "body_pt": body,
        "margin_L": round(bb.x0, 1) if bb else None,
        "margin_R": round(mb.width - bb.x1, 1) if bb else None,
        "margin_T": round(bb.y0, 1) if bb else None,
        "margin_B": round(mb.height - bb.y1, 1) if bb else None,
        "top_sizes": hist.most_common(6),
    }


def ok_pair(ref: dict, exp: dict, label: str, tol: dict) -> list[str]:
    errs = []
    if exp["pages"] != ref["pages"]:
        errs.append(f"{label}: pages {exp['pages']} != {ref['pages']}")
    for k, t in tol.items():
        if ref.get(k) is None or exp.get(k) is None:
            continue
        if abs(exp[k] - ref[k]) > t:
            errs.append(f"{label}: {k} {exp[k]} vs ref {ref[k]} (tol {t})")
    return errs


def main():
    root = Path(__file__).resolve().parents[1] / "applications" / "uploads"
    pairs = [
        (
            "resume",
            root / "Sakshi Product Resume.pdf",
            root / "compare" / "export_master_resume.pdf",
            {"name_pt": 1.2, "body_pt": 0.6, "margin_L": 8, "margin_R": 12, "margin_T": 10},
        ),
        (
            "cover",
            root / "Sakshi Chaudhary - Cover Letter.pdf",
            root / "compare" / "export_master_cl.pdf",
            {"name_pt": 1.5, "body_pt": 0.8, "margin_L": 10, "margin_R": 12, "margin_T": 12},
        ),
    ]
    report = {}
    all_errs = []
    for label, ref_p, exp_p, tol in pairs:
        if not exp_p.exists():
            all_errs.append(f"{label}: missing {exp_p}")
            continue
        ref, exp = metrics(str(ref_p)), metrics(str(exp_p))
        report[label] = {"ref": ref, "exp": exp}
        all_errs.extend(ok_pair(ref, exp, label, tol))
        print(f"\n=== {label} ===")
        print(f"  pages  ref={ref['pages']} exp={exp['pages']}")
        print(f"  name   ref={ref['name_pt']} exp={exp['name_pt']}")
        print(f"  body   ref={ref['body_pt']} exp={exp['body_pt']}")
        print(
            f"  margins L/R/T/B  ref={ref['margin_L']}/{ref['margin_R']}/{ref['margin_T']}/{ref['margin_B']}"
            f"  exp={exp['margin_L']}/{exp['margin_R']}/{exp['margin_T']}/{exp['margin_B']}"
        )

    out = root / "compare" / "compare_report.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n")
    print("\nreport:", out)
    if all_errs:
        print("\nFAIL:")
        for e in all_errs:
            print(" -", e)
        sys.exit(1)
    print("\nPASS: within tolerances")
    sys.exit(0)


if __name__ == "__main__":
    main()
