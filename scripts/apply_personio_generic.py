#!/usr/bin/env python3
"""Generic Personio apply helper.
Usage:
  .venv-apply/bin/python scripts/apply_personio_generic.py \
    --url URL --pack applications/jobs/... [--job-id li_xxx]
"""
import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--pack", required=True)
    ap.add_argument("--job-id", default="")
    args = ap.parse_args()
    pack = Path(args.pack)
    if not pack.is_absolute():
        pack = ROOT / pack
    resume = pack / "resume.pdf"
    cl = pack / "cover_letter.pdf"
    assert resume.exists(), resume

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(args.url, wait_until="domcontentloaded", timeout=90000)
        page.wait_for_timeout(1500)
        for label in ["Accept all", "Alle akzeptieren", "Accept", "OK", "Einverstanden"]:
            b = page.get_by_role("button", name=label)
            if b.count():
                try:
                    b.first.click(timeout=2000)
                except Exception:
                    pass

        for name in ["Apply", "Jetzt bewerben", "Apply now", "Bewerben"]:
            b = page.get_by_role("button", name=name)
            if not b.count():
                b = page.get_by_role("link", name=name)
            if b.count():
                try:
                    b.first.click(timeout=4000, force=True)
                    break
                except Exception:
                    pass
        page.wait_for_timeout(2000)

        def fill(label, value):
            loc = page.get_by_label(label, exact=False)
            if loc.count():
                try:
                    loc.first.fill(value)
                    return True
                except Exception:
                    pass
            return False

        fill("First name", "Sakshi") or fill("Vorname", "Sakshi")
        fill("Last name", "Chaudhary") or fill("Nachname", "Chaudhary")
        fill("Email", "ch.sakshiasb@gmail.com") or fill("E-Mail", "ch.sakshiasb@gmail.com")
        fill("Phone", "+4915510203327") or fill("Telefon", "+4915510203327")
        fill("LinkedIn", "https://linkedin.com/in/fabsakshi")

        files = page.locator('input[type="file"]')
        uploaded = False
        if files.count():
            files.first.set_input_files(str(resume))
            uploaded = True
            page.wait_for_timeout(800)
            if cl.exists() and files.count() >= 2:
                files.nth(1).set_input_files(str(cl))

        for cb in page.locator('input[type="checkbox"]').all():
            try:
                cb.check(force=True)
            except Exception:
                pass

        page.screenshot(path=str(pack / "apply_before_submit.png"), full_page=True)
        print("uploaded", uploaded, "url", page.url)

        for name in ["Submit application", "Submit", "Bewerbung absenden", "Senden", "Apply"]:
            b = page.get_by_role("button", name=name)
            if b.count():
                try:
                    b.first.click(timeout=5000)
                    break
                except Exception:
                    continue
        page.wait_for_timeout(5000)
        page.screenshot(path=str(pack / "apply_result.png"), full_page=True)
        body = page.content().lower()
        success = any(
            s in body
            for s in [
                "thank you",
                "danke",
                "erfolgreich",
                "successfully",
                "application has been",
                "bewerbung eingegangen",
                "we have received",
            ]
        )
        print("success", success, "url", page.url)
        browser.close()
        raise SystemExit(0 if success else 4)


if __name__ == "__main__":
    main()
