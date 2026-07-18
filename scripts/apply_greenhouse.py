#!/usr/bin/env python3
"""Apply to a Greenhouse job board form with resume + cover letter uploads."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from playwright.sync_api import TimeoutError as PWTimeout
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PROFILE = {
    "first_name": "Sakshi",
    "last_name": "Chaudhary",
    "email": "ch.sakshiasb@gmail.com",
    "phone": "+4915510203327",
    "location": "Berlin, Germany",
    "linkedin": "https://www.linkedin.com/in/sakshichaudhary",
    "salary": "50000-60000 EUR",
    "visa": "Valid work permit — authorized to work full-time in Germany; no sponsorship required",
    "start": "Immediate",
    "german": "Learning / A2; English fluent",
}


def accept_cookies(page) -> None:
    for label in [
        "Accept all",
        "Accept All",
        "Accept",
        "Alle akzeptieren",
        "Allow all",
        "I agree",
    ]:
        btn = page.get_by_role("button", name=re.compile(label, re.I))
        if btn.count():
            try:
                btn.first.click(timeout=1500)
                return
            except Exception:
                pass


def fill_by_labels(page, mapping: dict[str, str]) -> list[str]:
    filled = []
    for label, value in mapping.items():
        loc = page.get_by_label(re.compile(label, re.I))
        if not loc.count():
            # placeholder / name heuristics
            loc = page.locator(
                f'input[name*="{label}" i], textarea[name*="{label}" i], '
                f'input[placeholder*="{label}" i], textarea[placeholder*="{label}" i]'
            )
        if not loc.count():
            continue
        try:
            el = loc.first
            tag = el.evaluate("e => e.tagName.toLowerCase()")
            typ = (el.get_attribute("type") or "").lower()
            if tag == "select" or typ == "select-one":
                try:
                    el.select_option(label=value)
                except Exception:
                    el.select_option(value=value)
            else:
                el.fill(value)
            filled.append(label)
        except Exception:
            continue
    return filled


def upload_files(page, resume: Path, cover: Path) -> dict:
    result = {"resume": False, "cover": False}
    inputs = page.locator('input[type="file"]')
    n = inputs.count()
    if n == 0:
        return result
    # Greenhouse usually: first resume, second cover letter (optional)
    try:
        inputs.nth(0).set_input_files(str(resume))
        result["resume"] = True
        page.wait_for_timeout(800)
    except Exception as e:
        result["resume_err"] = str(e)
    if n >= 2 and cover.exists():
        try:
            inputs.nth(1).set_input_files(str(cover))
            result["cover"] = True
            page.wait_for_timeout(800)
        except Exception as e:
            result["cover_err"] = str(e)
    return result


def answer_common_selects(page) -> list[str]:
    answered = []
    # Yes/No sponsorship etc.
    pairs = [
        (r"sponsor|visa|work authorization|authorized to work", "No"),
        (r"require.*visa|need.*sponsorship", "No"),
        (r"legally.*work|authorized.*Germany|right to work", "Yes"),
        (r"relocat", "Yes"),
        (r"remote|hybrid|onsite|work mode", "Hybrid"),
    ]
    for pattern, value in pairs:
        labels = page.locator("label, legend, span, div").filter(has_text=re.compile(pattern, re.I))
        for i in range(min(labels.count(), 8)):
            text = labels.nth(i).inner_text().strip()[:120]
            # nearby select
            container = labels.nth(i).locator("xpath=ancestor::*[self::div or self::fieldset][1]")
            sel = container.locator("select")
            if sel.count():
                try:
                    sel.first.select_option(label=re.compile(value, re.I))
                    answered.append(text)
                    continue
                except Exception:
                    try:
                        sel.first.select_option(value=value)
                        answered.append(text)
                    except Exception:
                        pass
            # radio
            radio = container.get_by_role("radio", name=re.compile(rf"^{value}$", re.I))
            if radio.count():
                try:
                    radio.first.check(force=True)
                    answered.append(text)
                except Exception:
                    pass
    return answered


def submit(page) -> tuple[bool, str]:
    for name in [
        r"^Submit$",
        r"^Submit application$",
        r"^Apply$",
        r"^Send application$",
        r"Bewerbung absenden",
        r"Absenden",
    ]:
        btn = page.get_by_role("button", name=re.compile(name, re.I))
        if not btn.count():
            continue
        try:
            btn.first.click(timeout=5000)
            page.wait_for_timeout(3500)
            break
        except Exception:
            continue
    else:
        return False, "no_submit_button"

    html = page.content().lower()
    url = page.url
    success_signals = [
        "thank you",
        "application submitted",
        "successfully submitted",
        "we have received",
        "application has been",
        "thanks for applying",
        "bewerbung eingegangen",
        "vielen dank",
    ]
    if any(s in html for s in success_signals):
        return True, "success_signal"
    # Greenhouse often redirects to confirmation
    if "confirmation" in url.lower() or "thank" in url.lower():
        return True, f"url:{url}"
    # validation errors
    if page.locator(".field-error, .error, [class*='error']").count():
        errs = page.locator(".field-error, .error").all_inner_texts()[:8]
        return False, "validation:" + " | ".join(errs)[:300]
    return False, f"unclear:{url}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--resume", required=True)
    ap.add_argument("--cover", required=True)
    ap.add_argument("--out", default="/tmp/apply_result.json")
    ap.add_argument("--headed", action="store_true")
    args = ap.parse_args()

    resume = Path(args.resume)
    cover = Path(args.cover)
    assert resume.exists(), resume

    result = {"ok": False, "url": args.url, "notes": ""}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        page.goto(args.url, wait_until="domcontentloaded", timeout=90000)
        accept_cookies(page)
        page.wait_for_timeout(1500)

        # Wait for form fields
        try:
            page.wait_for_selector(
                'input[type="file"], input[name*="first" i], #first_name',
                timeout=20000,
            )
        except PWTimeout:
            result["notes"] = "form_not_found"
            Path(args.out).write_text(json.dumps(result, indent=2))
            print(json.dumps(result))
            browser.close()
            return 2

        filled = fill_by_labels(
            page,
            {
                "First Name": PROFILE["first_name"],
                "Last Name": PROFILE["last_name"],
                "Email": PROFILE["email"],
                "Phone": PROFILE["phone"],
                "LinkedIn": PROFILE["linkedin"],
                "Location": PROFILE["location"],
                "City": "Berlin",
                "Country": "Germany",
            },
        )
        uploads = upload_files(page, resume, cover)
        selects = answer_common_selects(page)

        # Fill remaining empty required textareas with short truthful answers
        for ta in page.locator("textarea").all()[:10]:
            try:
                name = (ta.get_attribute("name") or "") + " " + (ta.get_attribute("id") or "")
                val = ta.input_value()
                if val.strip():
                    continue
                low = name.lower()
                if "cover" in low:
                    ta.fill(
                        "Please see attached cover letter PDF for my motivation and fit."
                    )
                elif "salary" in low or "compensation" in low:
                    ta.fill(PROFILE["salary"])
                elif "visa" in low or "sponsor" in low:
                    ta.fill(PROFILE["visa"])
                elif "start" in low or "notice" in low:
                    ta.fill(PROFILE["start"])
                elif "german" in low or "language" in low:
                    ta.fill(PROFILE["german"])
            except Exception:
                pass

        ok, note = submit(page)
        result.update(
            {
                "ok": ok,
                "notes": note,
                "filled": filled,
                "uploads": uploads,
                "selects": selects,
                "final_url": page.url,
            }
        )
        shot = Path(args.out).with_suffix(".png")
        try:
            page.screenshot(path=str(shot), full_page=True)
            result["screenshot"] = str(shot)
        except Exception:
            pass
        browser.close()

    Path(args.out).write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))
    return 0 if ok else 3


if __name__ == "__main__":
    sys.exit(main())
