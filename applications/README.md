# Application packs (Sakshi)

Teal-style flow: master resume JSON → tailor to JD → PDF via the **same Download path** as [resume.fineanmol.dev](https://resume.fineanmol.dev/) (React Designer + `buildPrintHtml`).

## Master

- `master/sakshi-resume.json` — Designer `ResumeState` (from website Product Resume)
- `master/sakshi-cover-letter.json` — cover letter seed
- `uploads/Sakshi Product Resume.pdf` — original website export (reference)

## Per-job folder `jobs/{job_id}_{company}/`

| File | Purpose |
|---|---|
| `resume.pdf` / `cover_letter.pdf` | Files to upload when applying |
| `resume.json` / `cover_letter.json` | Tailored content |
| `meta.json` | ATS score, variant id |
| `sheet_fields.json` | Paths for Google Sheet tracking |

## Generate one job

```bash
# Terminal 1 — resume-cv-mvp
export GEMINI_API_KEY=...
npx playwright install chromium   # once
npm run api

# Terminal 2 — this repo
node scripts/generate-application.mjs \
  --job-id li_4433195439 \
  --company FACTUREE \
  --role "Associate Product Manager" \
  --jd-file applications/jobs/li_4433195439_facturee/jd.txt \
  --out applications/jobs/li_4433195439_facturee
```

Sheet columns (Apps Script `addApplicationDocColumns`): `resume_used`, `cover_letter_used`, `resume_variant_id`, `ats_score`, `pack_folder`, `apply_channel`, `external_apply_url`.
