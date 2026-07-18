#!/usr/bin/env python3
"""Apply to HELM AG SAP SuccessFactors posting with resume + cover letter."""
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "applications/jobs/li_4392855779_helm_ag"
RESUME = PACK / "resume.pdf"
CL = PACK / "cover_letter.pdf"
APPLY_URL = (
    "https://jobs.helmag.com/job/Hamburg-%28Senior%29-Product-Manager-"
    "Vinyl-Acetate-Monomer-%28VAM%29-%28mfd%29-20097/1347500155/"
)
EMAIL = "ch.sakshiasb@gmail.com"
PASSWORD = "SakshiApply1!"


def accept_cookies(page) -> None:
    for label in ["Accept All Cookies", "Accept all", "Accept", "Alle akzeptieren"]:
        btn = page.get_by_role("button", name=label)
        if btn.count():
            try:
                btn.first.click(timeout=2500)
                return
            except Exception:
                pass


def upload_via_hidden_input(page, label_substr: str, file_path: Path) -> bool:
    inputs = page.locator('input[type="file"]')
    if inputs.count():
        idx = 0 if "resume" in label_substr.lower() or "cv" in label_substr.lower() else min(1, inputs.count() - 1)
        inputs.nth(idx).set_input_files(str(file_path))
        page.wait_for_timeout(1200)
        return True

    for role_name in [
        "Resume / CV",
        "Upload a Resume",
        "Cover Letter",
        "Attach a Cover Letter",
    ]:
        if label_substr.lower() not in role_name.lower() and not (
            ("resume" in label_substr.lower() and "resume" in role_name.lower())
            or ("cover" in label_substr.lower() and "cover" in role_name.lower())
        ):
            continue
        btn = page.get_by_role("button", name=role_name)
        if not btn.count():
            continue
        try:
            with page.expect_file_chooser(timeout=8000) as fc:
                btn.first.click()
            fc.value.set_files(str(file_path))
            page.wait_for_timeout(1200)
            return True
        except PWTimeout:
            page.wait_for_timeout(800)
            inputs = page.locator('input[type="file"]')
            if inputs.count():
                inputs.last.set_input_files(str(file_path))
                page.wait_for_timeout(1200)
                return True
    return False


def fill_by_label(page, substr: str, value: str) -> None:
    loc = page.get_by_label(substr, exact=False)
    if loc.count():
        loc.first.fill(value)
        return
    alt = page.locator(
        f'input[aria-label*="{substr}" i], input[placeholder*="{substr}" i]'
    )
    if alt.count():
        alt.first.fill(value)


def select_custom_dropdown(page, label_text: str, option_text: str) -> bool:
    """SAP SF often uses button/combobox + listbox, not native <select>."""
    # Try native select first
    native = page.locator(
        f'select:near(:text("{label_text}"))'
    )
    if native.count():
        try:
            native.first.select_option(label=option_text)
            return True
        except Exception:
            try:
                native.first.select_option(value="DE" if option_text == "Germany" else option_text)
                return True
            except Exception:
                pass

    # Click the control near the label
    triggers = [
        page.get_by_label(label_text, exact=False),
        page.locator(f'[aria-label*="{label_text}" i]'),
        page.locator(f'text={label_text}').locator("xpath=following::*[self::button or self::a or self::div[@role='combobox'] or self::select][1]"),
    ]
    for trig in triggers:
        if not trig.count():
            continue
        try:
            trig.first.click(timeout=3000)
            page.wait_for_timeout(500)
            # Type to filter (country lists are long)
            try:
                page.keyboard.type(option_text[:12], delay=40)
                page.wait_for_timeout(400)
            except Exception:
                pass
            for opt in [
                page.get_by_role("option", name=option_text, exact=True),
                page.get_by_role("option", name=option_text, exact=False),
                page.locator(f'[role="option"]:has-text("{option_text}")'),
                page.get_by_text(option_text, exact=True),
            ]:
                if opt.count():
                    opt.first.click(timeout=3000)
                    page.wait_for_timeout(400)
                    return True
        except Exception as e:
            print(f"dropdown try warn ({label_text}): {e}")
    return False


def accept_privacy_terms(page) -> bool:
    """Open data privacy dialog and accept Terms of Use."""
    link_names = [
        "Read and accept the data privacy statement",
        "Terms of Use",
        "data privacy",
        "privacy statement",
    ]
    opened = False
    for name in link_names:
        loc = page.get_by_role("link", name=name)
        if not loc.count():
            loc = page.get_by_role("button", name=name)
        if not loc.count():
            loc = page.get_by_text(name, exact=False)
        if not loc.count():
            continue
        try:
            loc.first.click(timeout=4000)
            page.wait_for_timeout(1200)
            opened = True
            break
        except Exception:
            continue

    if not opened:
        print("terms: could not open privacy dialog")
        return False

    # Accept in dialog / iframe
    accepted = False
    for frame in [page, *page.frames]:
        for name in ["I Accept", "I Agree", "Accept", "Agree", "OK", "Confirm"]:
            try:
                b = frame.get_by_role("button", name=name)
                if b.count():
                    b.first.click(timeout=3000)
                    accepted = True
                    page.wait_for_timeout(800)
                    break
            except Exception:
                pass
        if accepted:
            break
        # checkbox + accept
        try:
            cbs = frame.locator('input[type="checkbox"]')
            for i in range(min(cbs.count(), 5)):
                try:
                    cbs.nth(i).check(force=True)
                except Exception:
                    pass
        except Exception:
            pass

    if not accepted:
        # last resort: any visible Accept in modal
        try:
            page.locator('.ui-dialog button, [role="dialog"] button, .modal button').filter(
                has_text="Accept"
            ).first.click(timeout=3000)
            accepted = True
        except Exception as e:
            print("terms accept warn:", e)

    print("terms opened:", opened, "accepted:", accepted)
    return opened and accepted


def fill_required_sap_fields(page) -> None:
    # Prior company work
    ok_prior = select_custom_dropdown(
        page, "Have you ever worked prior with this company?", "No"
    )
    if not ok_prior:
        try:
            page.locator("text=Have you ever worked prior with this company?").first.click()
            page.wait_for_timeout(400)
            page.get_by_text("No", exact=True).first.click()
            ok_prior = True
        except Exception as e:
            print("prior-work select warn:", e)
    print("prior_work:", ok_prior)

    # Country Germany
    ok_country = select_custom_dropdown(page, "Country/Region of Residence", "Germany")
    if not ok_country:
        # SAP often has #fbclc_country or similar
        for sel in [
            "#fbclc_country",
            "select[id*='country' i]",
            "select[name*='country' i]",
            "[id*='country' i][role='combobox']",
            "button[id*='country' i]",
        ]:
            el = page.locator(sel)
            if not el.count():
                continue
            try:
                tag = el.first.evaluate("e => e.tagName.toLowerCase()")
                if tag == "select":
                    el.first.select_option(label="Germany")
                else:
                    el.first.click()
                    page.wait_for_timeout(400)
                    page.keyboard.type("Germany", delay=40)
                    page.wait_for_timeout(400)
                    page.get_by_role("option", name="Germany").first.click()
                ok_country = True
                break
            except Exception as e:
                print("country sel warn:", sel, e)
    print("country:", ok_country)

    # Profile visibility radio — prefer most private option
    ok_vis = False
    for label in [
        "Only recruiters managing jobs I apply to",
        "Any company recruiter in my country/region of residence",
        "Any company recruiter worldwide",
    ]:
        try:
            radio = page.get_by_label(label, exact=False)
            if radio.count():
                radio.first.check(force=True)
                ok_vis = True
                break
            txt = page.get_by_text(label, exact=False)
            if txt.count():
                txt.first.click()
                ok_vis = True
                break
        except Exception:
            continue
    if not ok_vis:
        try:
            radios = page.locator('input[type="radio"]')
            if radios.count():
                radios.last.check(force=True)
                ok_vis = True
        except Exception as e:
            print("visibility warn:", e)
    print("visibility:", ok_vis)

    ok_terms = accept_privacy_terms(page)
    print("terms:", ok_terms)


def main() -> None:
    assert RESUME.exists() and CL.exists(), "Missing PDFs in pack folder"
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        page.goto(APPLY_URL, wait_until="domcontentloaded", timeout=90000)
        accept_cookies(page)

        page.get_by_role("button", name="Apply now").first.click()
        page.wait_for_timeout(800)
        clicked_apply = False
        for sel in [
            page.get_by_role("menuitem", name="Apply Now"),
            page.locator("#applyOption-top-manual"),
            page.locator('a[aria-label="Apply Now"]'),
            page.get_by_text("Apply Now", exact=True),
        ]:
            if not sel.count():
                continue
            try:
                sel.first.click(timeout=5000, force=True)
                clicked_apply = True
                break
            except Exception:
                try:
                    sel.first.evaluate("el => el.click()")
                    clicked_apply = True
                    break
                except Exception:
                    continue
        if not clicked_apply:
            # Direct career site apply URL fallback
            page.goto(
                "https://jobs.helmag.com/talentcommunity/apply/"
                "1347500155/?locale=en_US",
                wait_until="domcontentloaded",
                timeout=90000,
            )

        page.wait_for_timeout(4000)
        page.wait_for_selector("text=Email Address", timeout=60000)
        accept_cookies(page)

        ok_resume = upload_via_hidden_input(page, "resume", RESUME)
        ok_cl = upload_via_hidden_input(page, "cover", CL)
        print("upload resume:", ok_resume, "cover:", ok_cl)

        # Email — prefer stable #fbclc_email with retries (known flake)
        for attempt in range(4):
            try:
                email = page.locator("#fbclc_email, input[type='email']").first
                email.wait_for(state="visible", timeout=8000)
                email.click()
                email.fill("")
                email.fill(EMAIL)
                break
            except Exception as e:
                print(f"email fill attempt {attempt+1}:", e)
                page.wait_for_timeout(1000)

        emails = page.locator('input[type="email"], input[aria-label*="Email" i], #fbclc_emailConf, #fbclc_email')
        if emails.count() >= 2:
            emails.nth(1).fill(EMAIL)
        else:
            fill_by_label(page, "Retype Email", EMAIL)

        pws = page.locator('input[type="password"]')
        if pws.count() >= 2:
            pws.nth(0).fill(PASSWORD)
            pws.nth(1).fill(PASSWORD)

        fill_by_label(page, "First Name", "Sakshi")
        fill_by_label(page, "Last Name", "Chaudhary")
        fill_by_label(page, "Mobile Phone", "+4915510203327")
        fill_by_label(page, "City", "Berlin")
        fill_by_label(page, "Salary expectation", "55000 EUR")
        fill_by_label(page, "notice period", "0")

        fill_required_sap_fields(page)

        page.screenshot(path=str(PACK / "apply_before_submit.png"), full_page=True)

        if not ok_resume:
            print("ABORT: resume not uploaded — not submitting")
            print("URL:", page.url)
            browser.close()
            raise SystemExit(3)

        page.get_by_role("button", name="Apply", exact=True).click()
        page.wait_for_timeout(7000)

        # If validation still present, try one remediation pass
        body = page.content().lower()
        if "please complete all required fields" in body or "is required" in body:
            print("validation still present — remediating once")
            fill_required_sap_fields(page)
            page.screenshot(path=str(PACK / "apply_before_submit_retry.png"), full_page=True)
            page.get_by_role("button", name="Apply", exact=True).click()
            page.wait_for_timeout(7000)

        print("URL after submit:", page.url)
        print("TITLE:", page.title())
        page.screenshot(path=str(PACK / "apply_result.png"), full_page=True)
        body = page.content().lower()
        success = any(
            s in body
            for s in [
                "thank you",
                "application has been submitted",
                "successfully submitted",
                "we have received",
                "application received",
                "your application has been",
            ]
        )
        # failure signals
        still_form = "country/region of residence is required" in body or "terms of use is required" in body
        print("success_heuristic:", success, "still_form_errors:", still_form)
        browser.close()
        raise SystemExit(0 if success and not still_form else 4)


if __name__ == "__main__":
    main()
