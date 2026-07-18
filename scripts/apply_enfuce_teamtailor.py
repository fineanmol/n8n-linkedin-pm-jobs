#!/usr/bin/env python3
"""Apply to Enfuce Product Marketing Manager (Teamtailor)."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "applications/jobs/li_4423182041_enfuce"
RESUME = PACK / "resume.pdf"
CL = PACK / "cover_letter.pdf"
URL = "https://enfuceoy.teamtailor.com/jobs/7888331-product-marketing-manager"

Q1 = (
    "At Softude I partnered with sales on a risk-platform launch where demos stalled on "
    "unclear value and long security questionnaires. I built a lightweight enablement pack: "
    "a problem-led demo script, a one-page value brief for CISOs vs operators, and a short "
    "objection guide tied to real discovery calls. Success was measured by shorter first-call "
    "time-to-value explanations, fewer repeat clarification loops from sales, and clearer "
    "handoffs into technical evaluation. I treated enablement as a product loop — gather "
    "field feedback weekly, update the assets, and retire what sales did not use."
)

Q2 = (
    "I supported go-to-market for Softude's cybersecurity risk platform, which is technically "
    "dense (controls, evidence, risk scoring). I translated it into business outcomes: faster "
    "audit readiness, fewer manual follow-ups, and clearer ownership of risk. Messaging used "
    "plain-language buyer jobs-to-be-done, short proof points from discovery, and role-based "
    "talk tracks instead of feature lists. The same approach applied when explaining "
    "construction CRM workflows — lead with operational pain, then map capabilities to "
    "decisions stakeholders already make."
)

Q3 = (
    "I use AI daily for structured PM work: drafting PRD outlines from discovery notes, "
    "clustering interview themes, and generating first-pass release notes that I then edit. "
    "I also built prompt workflows that turn raw stakeholder feedback into prioritized "
    "opportunity lists with acceptance criteria drafts, which cut my write-up time and kept "
    "me focused on validation and decisions. Outcome: faster iteration on specs and clearer "
    "handoffs to engineering without inventing facts the model could not know."
)


def main() -> None:
    assert RESUME.exists() and CL.exists()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        page.wait_for_timeout(1500)
        for label in [
            "Accept all cookies",
            "Accept all",
            "Allow all",
            "Accept",
            "I agree",
            "OK",
        ]:
            btn = page.get_by_role("button", name=label)
            if btn.count():
                try:
                    btn.first.click(timeout=2500)
                    page.wait_for_timeout(400)
                except Exception:
                    pass
        try:
            page.locator("dialog[open]").evaluate_all(
                "els => els.forEach(e => { e.removeAttribute('open'); e.remove(); })"
            )
        except Exception:
            pass

        for name in ["Apply for this job", "Apply", "Apply now"]:
            b = page.get_by_role("button", name=name)
            if not b.count():
                b = page.get_by_role("link", name=name)
            if b.count():
                try:
                    b.first.click(timeout=5000, force=True)
                    break
                except Exception:
                    try:
                        b.first.evaluate("el => el.click()")
                        break
                    except Exception:
                        continue
        page.wait_for_timeout(2000)

        # Screening answers (type=text inputs, not textareas)
        page.fill("#candidate_answers_attributes_0_text", Q1)
        page.fill("#candidate_answers_attributes_1_text", Q2)
        page.fill("#candidate_answers_attributes_2_text", Q3)
        page.fill("#candidate_answers_attributes_3_text", "Immediate / can start immediately")
        page.fill("#candidate_answers_attributes_4_text", "€50,000–€60,000 gross/year")
        page.fill("#candidate_answers_attributes_5_text", "Germany")

        # Preferred location
        for loc_id in [
            "candidate_location_ids_1354865",  # Germany (Remote)
            "candidate_location_ids_4856421",  # Remote EU
        ]:
            box = page.locator(f"#{loc_id}")
            if box.count():
                try:
                    box.check(force=True)
                except Exception:
                    pass

        page.fill("#candidate_first_name", "Sakshi")
        page.fill("#candidate_last_name", "Chaudhary")
        page.fill("#candidate_email", "ch.sakshiasb@gmail.com")
        page.fill("#candidate_phone", "+4915510203327")

        # Location autocomplete — type Berlin and pick suggestion if any
        loc = page.locator("#candidate_location")
        if loc.count():
            loc.fill("Berlin, Germany")
            page.wait_for_timeout(1200)
            # try select first suggestion
            opt = page.locator('[role="option"], .pac-item, li[data-place]').first
            try:
                if opt.count():
                    opt.click(timeout=2000)
            except Exception:
                # set hidden fields manually as fallback
                page.evaluate(
                    """() => {
                      const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
                      set('candidate_city', 'Berlin');
                      set('candidate_country', 'Germany');
                      set('candidate_address', 'Berlin, Germany');
                    }"""
                )

        files = page.locator('input[type="file"]')
        if files.count():
            files.first.set_input_files(str(RESUME))
            page.wait_for_timeout(1200)
            if files.count() >= 2 and CL.exists():
                files.nth(1).set_input_files(str(CL))
                page.wait_for_timeout(800)

        cl = page.locator("#candidate_job_applications_attributes_0_cover_letter")
        if cl.count():
            cl.fill(
                "Berlin-based Product Manager with 3.5+ years B2B SaaS experience, "
                "strong collaboration with sales/GTM, and authorization to work in Germany now. "
                "Excited about Enfuce's sales-enablement-focused Product Marketing role."
            )

        # consent hidden field often required
        page.evaluate(
            """() => {
              const c = document.getElementById('candidate_consent_given');
              if (c) c.value = '1';
            }"""
        )

        page.screenshot(path=str(PACK / "apply_before_submit.png"), full_page=True)

        submitted = False
        # prefer real submit input
        submit = page.locator('input[type="submit"][name="commit"]')
        if submit.count():
            try:
                submit.first.click(timeout=5000)
                submitted = True
            except Exception:
                pass
        if not submitted:
            for name in ["Submit application", "Submit", "Send application"]:
                b = page.get_by_role("button", name=name)
                if b.count():
                    try:
                        b.first.click(timeout=5000)
                        submitted = True
                        break
                    except Exception:
                        continue

        page.wait_for_timeout(6000)
        page.screenshot(path=str(PACK / "apply_result.png"), full_page=True)
        body = page.content().lower()
        success = any(
            s in body
            for s in [
                "thank you",
                "application has been submitted",
                "successfully",
                "we have received",
                "application received",
                "thanks for applying",
                "application was sent",
            ]
        )
        blank = "can't be blank" in body or "field can't be blank" in body
        print(
            "submitted_click",
            submitted,
            "success",
            success,
            "blank_err",
            blank,
            "url",
            page.url,
        )
        browser.close()
        raise SystemExit(0 if success else 4)


if __name__ == "__main__":
    main()
