# Sakshi PM Job Application Automation

End-to-end job-hunting automation for **Sakshi Chaudhary** (Product Manager, ~3.5 YOE, Berlin / Germany): scrape English PM roles, track them in Google Sheets, qualify and expire stale listings, generate truth-bound ATS resume + cover letter packs, and maintain a separate funded-startup watchlist.

**Production n8n:** [https://n8n.fineanmol.dev](https://n8n.fineanmol.dev)

This README is the **system-of-record overview**. Specialized runbooks stay in linked docs — not duplicated verbatim here.

---

## Table of contents

1. [What this is](#what-this-is)
2. [Architecture](#architecture)
3. [Live n8n workflows](#live-n8n-workflows)
4. [Google Sheets](#google-sheets)
5. [Configuration knobs](#configuration-knobs)
6. [Filtering philosophy](#filtering-philosophy)
7. [Resume / cover letter pipeline](#resume--cover-letter-pipeline)
8. [Qualification rules](#qualification-rules)
9. [Deploy & operations](#deploy--operations)
10. [How to run & verify](#how-to-run--verify)
11. [Known issues & gotchas](#known-issues--gotchas)
12. [File map](#file-map)
13. [Related documentation](#related-documentation)
14. [Disclaimer](#disclaimer)

---

## What this is

| Aspect | Detail |
|--------|--------|
| **Who** | Sakshi Chaudhary — IBM-certified PM, B2B SaaS / cybersecurity / CRM background, Berlin |
| **Target roles** | Product Manager, Product Owner, Associate PM, Technical PM, Growth PM, etc. (not design / VP / CPO) |
| **Geography** | Germany (LinkedIn location filter) |
| **Language** | English job titles and postings only at scrape time |
| **Experience band** | ~3.5 YOE — skip roles requiring 5+ years, Lead/Global titles, or German above B2 |
| **Outputs** | Google Sheets tracker, digest emails, tailored PDF packs (`Sakshi_Resume_{company}`, `Sakshi_Cover_Letter_{company}`), R2-hosted docs |

**Master profile source of truth:** [`Profile/Profile.md`](Profile/Profile.md) — used by pack scripts and AI tailoring; never exaggerate experience.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Docker Compose (local or Oracle VM)                                        │
│                                                                             │
│  ┌──────────────┐   HTTP/curl    ┌─────────────────────┐                   │
│  │ n8n :5678    │ ─────────────▶ │ linkedin-proxy :9877 │                   │
│  │ (workflows)  │                │ (TLS fingerprint)    │                   │
│  └──────┬───────┘                └─────────────────────┘                   │
│         │                                                                   │
│         ├──▶ Google Sheets (Jobs + Target Companies)                        │
│         ├──▶ Gmail (digests)                                                  │
│         └──▶ Webhooks (save-application-docs, compose-application-pack)   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  Local / Mac (pack factory — not in Docker)                                 │
│                                                                             │
│  resume-cv-mvp API :8791  →  Designer PDF export (layout-locked)          │
│  compose-pack-http   :8792  →  HTTP wrapper for n8n                          │
│  scripts/pack-factory-from-end.mjs  →  batch compose + R2 + sheet update  │
└─────────────────────────────────────────────────────────────────────────────┘

Optional: Apify `cheap_scraper~linkedin-job-scraper` (paid quota) for richer metadata + live apply-status checks via `li_at` cookie.
Production HTTPS: Cloudflare Tunnel → localhost:5678 (see [`DEPLOY.md`](DEPLOY.md)).
```

**Why the proxy?** LinkedIn blocks n8n's default HTTP client via TLS fingerprinting. The sidecar uses `curl`, which LinkedIn accepts. See [`proxy/linkedin_proxy_server.py`](proxy/linkedin_proxy_server.py).

**Why split workflows on prod?** The repo's [`workflow.json`](workflow.json) is a **combined export** (scraper + disabled apply pipeline + expire check + status sync). Production runs **separate published workflows** on n8n.fineanmol.dev (Guest scraper, Apify scraper, startup targets).

---

## Live n8n workflows

| # | Name | ID | Schedule | Purpose | Status notes |
|---|------|-----|----------|---------|--------------|
| 1 | [LinkedIn Scraper — Guest API](https://n8n.fineanmol.dev/workflow/KVA1KCuBAoJiso1k) | `KVA1KCuBAoJiso1k` | Every **6 hours** (`0 */6 * * *`) | Free LinkedIn guest search → title/config filters → dedupe → append to Jobs sheet → email digest | **Active.** JD enrich / YOE / German loop **disabled** (see [Filtering philosophy](#filtering-philosophy)). Saves immediately after filters. |
| 2 | [LinkedIn Scraper — Apify](https://n8n.fineanmol.dev/workflow/NKosSP6mwPBeqhiV) | `NKosSP6mwPBeqhiV` | Every **12 hours** at :30 | Apify actor → parse → **Normalize Experience Years** → title/config filters → German/YOE gate → live-check new jobs with `li_at` → save | **Active but often blocked** by Apify monthly usage limit. When quota is exhausted, runs fail at the Apify node. |
| 3 | [DE Funded Startups → Hiring Watchlist](https://n8n.fineanmol.dev/workflow/XCzeLgTXXU8o5p1v) | `XCzeLgTXXU8o5p1v` | **Mon & Thu 08:00** Europe/Berlin (`0 8 * * 1,4`) | Tech.eu funding + seed CSV → careers/LinkedIn guest + apply-email enrich → action queue (`Apply now` / `Find contact`) → rewrite sheet → digest | **Active.** Full setup: [`STARTUP_TARGETS.md`](STARTUP_TARGETS.md). Bootstrap: `POST https://n8n.fineanmol.dev/webhook/startup-targets-bootstrap` |

### Webhooks (live n8n — workflow JSON not in this repo)

| Webhook | Used by |
|---------|---------|
| `POST /webhook/save-application-docs` | Pack factory, `agent-compose-pack.mjs`, backfill scripts — updates Jobs sheet columns (`resume_used`, `cover_letter_used`, `ats_score`, `status`, etc.) |
| `POST /webhook/compose-application-pack` | Optional n8n-triggered pack compose (see [`n8n/compose-application-pack.workflow.ts`](n8n/compose-application-pack.workflow.ts)) |
| `POST /webhook/startup-targets-bootstrap` | One-shot startup targets seed run |

### Disabled / legacy (in repo `workflow.json`, not primary prod path)

These nodes exist in the combined export but are **`disabled: true`** or not wired on production:

- **Apply pipeline** (weekday 9 AM): OpenAI JD extract → skill gaps → Google Docs resume edit → cover letter → Apify Easy Apply
- **Guest JD enrich loop**: `SplitInBatches` per-job JD fetch → YOE + German parse → filter (see below)
- **Status report** (every 2 days) and parts of **expire check** may live in the monolithic export; verify on n8n UI before relying on them

Prefer **local pack factory** + manual apply over the old in-n8n apply pipeline.

---

## Google Sheets

### Jobs tracker

| Item | Value |
|------|-------|
| **Spreadsheet** | [Job Application Tracker](https://docs.google.com/spreadsheets/d/1xl94TeV4CA459vAk38_KAymxUEe_YAVwQ0iEajzmnXM/edit) |
| **Tab** | `Jobs` |
| **Setup script** | [`google-sheets-setup.js`](google-sheets-setup.js) — run `setupAllSheets` in Apps Script; migrate existing sheets with `addApplicationDocColumns` |

**Core columns**

| Column | Meaning |
|--------|---------|
| `job_id` | `li_<linkedin_numeric_id>` |
| `company`, `position`, `location`, `job_url` | From scraper |
| `apply_type` | `LinkedIn Easy Apply` / `LinkedIn External` |
| `status` | See status table below |
| `posted_date`, `applied_date`, `last_checked` | Dates |
| `experience_required` | e.g. `3+`, `3-5`, `Mid-Senior`, `Lead/Global (5+ implied)` |
| `german_required` | `None` \| `B1` \| `B2` \| `C1` \| `Fluent` \| `Native` \| `Not specified` |
| `resume_used`, `cover_letter_used` | R2 public URLs after pack upload |
| `resume_variant_id`, `ats_score`, `pack_folder` | Pack metadata |
| `apply_channel`, `external_apply_url` | How/where to apply |
| `notes` | Auto-generated audit trail |

**Other tabs:** `My Skills`, `Cover Letters`, `Stats` (dashboard formulas).

**Status values (operational)**

| Status | Meaning |
|--------|---------|
| `Not Applied` | New scrape, awaiting pack / manual apply |
| `Ready to Apply` | Pack generated (ATS ≥ 90), docs on R2 |
| `Applied` | Submitted (manual or automation) |
| `Not Available Now` | LinkedIn listing closed / unavailable — **no pack generated** |
| `not qualified` | YOE / experience filter failed at pack time |
| `Only German Required` | German requirement above B2 (Apify path) |
| `Manual Apply Required` | External apply — cover letter emailed (legacy apply pipeline) |

### Target Companies (startup watchlist)

| Item | Value |
|------|-------|
| **Spreadsheet** | [DE Startup PM Targets](https://docs.google.com/spreadsheets/d/1pZiI5OdkdTCTR3ztXLer2seIQ9JT3SF4wUBJwP_JXsY/edit) |
| **Tabs** | `Target Companies`, `Targets Meta` |
| **Setup script** | [`google-sheets-startup-targets-setup.js`](google-sheets-startup-targets-setup.js) |

Key columns: `company`, `funding_stage`, `funding_amount`, `funding_date`, `website`, `careers_url`, `apply_email`, `next_action` (`Apply now` / `Find contact` / `Watch`), `next_action_url`, `hiring_pm`, `pm_job_urls`, `priority`, `status` (`Watch` / `Ready to Apply` / `Applied` / `Contacted` / `Skip` — set Applied/Contacted/Skip to hide from the next digest).

Details: [`STARTUP_TARGETS.md`](STARTUP_TARGETS.md).

---

## Configuration knobs

All scraper settings live in each workflow's **⚙️ Config** node (edit in n8n UI — no code deploy needed for query changes).

### Shared scraper config (Guest + Apify)

| Field | Production-ish value | Notes |
|-------|-------------------|-------|
| `searchQueries` | `Product Manager,Product Owner,Associate Product Manager,...` | Comma-separated. Also used as **title match** terms in filter nodes. |
| `searchLocation` | `Germany` | LinkedIn location parameter |
| `spreadsheetId` | Jobs sheet ID above | |
| `yourEmail` | Digest recipient(s) | |
| `englishOnly` | `true` | Drops German titles (umlauts, `(m/w/d)`, German function words) |
| `excludedRoleKeywords` | `director, vp, head of product, product designer, intern, ...` | Substring match on normalized title |
| `proxyUrl` | `http://linkedin-proxy:9877/fetch` | Inside Docker network |
| `maxExperienceYears` | `5` | Drop when min years ≥ 5 (Apify save path; pack factory) |
| `maxGermanLevel` | `B2` | Drop when German requirement above B2 (Apify save path) |

### Guest scraper only (`KVA1KCuBAoJiso1k`)

| Field | Live value | Notes |
|-------|------------|-------|
| `jobsPerQuery` | `200` | Max 100 enforced in code (4 pages × 25). Controls pagination fan-out. |
| LinkedIn `f_TPR` | `r1209600` | **14-day** posting window in search URL |
| LinkedIn `f_E` | `2,3,4` | Entry / Associate / Mid-Senior experience buckets |
| Query delay | **3 s** | `⏳ Wait 3s Between Queries` between HTTP fetches |
| `maxJdEnrichPerRun` | `400` | Caps batch size before save (`📏 Limit Enrich Batch`) — enrich loop itself is off |
| `jdEnrichDelaySec` | `1` | Only relevant if enrich nodes re-enabled |

### Apify scraper only (`NKosSP6mwPBeqhiV`)

| Field | Notes |
|-------|-------|
| `apifyApiKey` | Set in Config — **never commit** |
| `liAt` | LinkedIn session cookie for authenticated live-check (`/check-status`) — **never commit** |
| `maxApifyItems` | `300` |
| `apifyExperienceLevels` | `entry-level,associate,mid-senior` |
| Actor | `cheap_scraper~linkedin-job-scraper` |
| `publishedAt` | `r604800` (7 days) in Apify input |

### Startup targets (`XCzeLgTXXU8o5p1v`)

See [`STARTUP_TARGETS.md`](STARTUP_TARGETS.md). Key fields: `startupTargetsSpreadsheetId`, `techEuLookbackDays`, `maxEnrichPerRun`, `maxHiringChecksPerRun`, `forceImportSeed`, `digestEmails`.

### PDF naming (Config / upload script)

| Pattern | Example |
|---------|---------|
| `resumePdfNamePattern` | `Sakshi_Resume_{company}` |
| `coverLetterPdfNamePattern` | `Sakshi_Cover_Letter_{company}` |

Implemented in [`scripts/upload-application-docs.mjs`](scripts/upload-application-docs.mjs).

---

## Filtering philosophy

### At scrape time (title + config) — **YES, always on**

Both Guest and Apify paths apply:

1. **Dedupe** by `job_id` and normalized `company|title` (skip reposts)
2. **English-only titles** when `englishOnly=true` (German gender markers, umlauts, common DE job words)
3. **Role match** — title must contain a term from `searchQueries`
4. **Excluded roles** — `excludedRoleKeywords` (director, VP, designer, intern, …)

Guest scraper saves **immediately** after these filters (`❓ New Jobs Found?` → `📏 Limit Enrich Batch` → `💾 Save New Jobs to Sheet` → email). No JD fetch on the hot path.

### Per-job JD enrich (YOE + German) — **OFF on Guest, partial on Apify**

| Path | JD enrich | Why |
|------|-----------|-----|
| **Guest** | **Disabled** (`🔁 Enrich JD One by One`, `🔍 Fetch Guest Job Posting JD`, `🧠 Enrich Years From JD`, `❓ Keep After JD Enrich?` all `disabled: true`, not in connection graph) | Historical **SplitInBatches enrich bug**: loop could stall runs, rate-limit LinkedIn, and drop jobs silently. Title-level filtering is fast and reliable; YOE/German qualification moved to **pack factory** and **Apify Normalize Experience Years**. |
| **Apify** | **Normalize Experience Years** node parses description / Apify fields → `experience_required` column. **German/YOE hard drop** on **new** jobs only in `🛡️ Protect Existing Tracked Status` before save. Live-check drops already-applied / expired new jobs. | Apify returns descriptions; filtering happens without N sequential guest JD fetches. |

### At pack time (local scripts) — **YES**

[`scripts/pack-factory-from-end.mjs`](scripts/pack-factory-from-end.mjs) and [`scripts/experience-filter.mjs`](scripts/experience-filter.mjs):

- Skip closed jobs → `Expired`
- Skip min years ≥ 5 or Lead/Global titles → `not qualified`
- German above B2 → handled in backfill / Apify path (`extract-german-required.mjs`)

---

## Resume / cover letter pipeline

Teal-style flow: master JSON → JD-aware tailor → **layout-locked** Designer PDF (same path as [resume.fineanmol.dev](https://resume.fineanmol.dev/)).

### Master assets

| File | Purpose |
|------|---------|
| [`applications/master/sakshi-resume.json`](applications/master/sakshi-resume.json) | Designer `ResumeState` |
| [`applications/master/sakshi-cover-letter.json`](applications/master/sakshi-cover-letter.json) | Cover letter seed |
| [`applications/master/form-answers.json`](applications/master/form-answers.json) | Shortlist-safe form defaults (work auth, notice, German level, etc.) |
| [`Profile/Profile.md`](Profile/Profile.md) | Truth source for skills / stories |

Per-job output: `applications/jobs/{job_id}_{company}/` — see [`applications/README.md`](applications/README.md).

### Two compose paths

| Path | When to use | Entry |
|------|---------------|-------|
| **Gemini / full tailor** | Highest quality, one-off jobs | [`scripts/generate-application.mjs`](scripts/generate-application.mjs) — needs `resume-cv-mvp` on `:8791` + `GEMINI_API_KEY` |
| **Composer-inline (default factory)** | Batch, no Gemini cost | [`scripts/agent-compose-pack.mjs`](scripts/agent-compose-pack.mjs) — keyword weave + truth lexicon, ATS target **≥ 90** |

HTTP bridge for n8n: [`scripts/compose-pack-http.mjs`](scripts/compose-pack-http.mjs) (`COMPOSE_PACK_PORT`, `COMPOSE_PACK_TOKEN`).

### Guards & quality gates

| Layer | What it enforces |
|-------|------------------|
| **contentGuard** (resume-cv-mvp server) | Rejects emptied summaries / bullets / CL paragraphs |
| **layoutLock** | PDF layout matches Designer export; n8n does not rebuild layout |
| **truth-lexicon** ([`scripts/truth-lexicon.mjs`](scripts/truth-lexicon.mjs)) | Tier A = Profile-proven; Tier B = PM baseline ≤5 YOE; Tier C = never invent (languages, fake stacks, senior titles) |
| **verify-pack-quality** ([`scripts/verify-pack-quality.mjs`](scripts/verify-pack-quality.mjs)) | No German filler in EN docs, no parenthetical keyword dumps, no "Familiar with" spam, honest ATS via truth overlap |
| **boost-ats** ([`scripts/boost-ats.mjs`](scripts/boost-ats.mjs)) | DE JD → EN skill mapping; strip keyword spam |
| **Profile guidelines** | Never exaggerate; 3.5+ YOE wording (`APPLICANT_YOE` in agent-compose-pack) |

### Pack factory (batch)

```bash
# Prerequisites: resume-cv-mvp API on :8791, wrangler auth for R2
node scripts/pack-factory-from-end.mjs --csv /tmp/jobs_export.csv --limit 30
# Or export sheet to CSV; walks Not Applied from bottom of sheet upward
```

Flow: open-check → experience filter → `agent-compose-pack.mjs` → R2 upload → `save-application-docs` webhook → status `Ready to Apply`.

Progress log: `applications/queues/pack_factory_progress.jsonl`.

### Upload & storage

- **R2** via wrangler: `R2_BUCKET`, `R2_PUBLIC_BASE_URL`, `R2_KEY_PREFIX` env vars
- Sheet updated with public URLs in `resume_used` / `cover_letter_used`

---

## Qualification rules

Canonical logic lives in scripts (not duplicated in n8n for Guest):

### Experience ([`scripts/experience-filter.mjs`](scripts/experience-filter.mjs))

- **Skip** when parsed minimum years **≥ 5** (default `maxYears=5`)
- **Skip** Lead/Global/Founding product titles (imply 5+ YOE) even if years unknown
- **Keep** "Senior" / "Mid-Senior" when years unknown or &lt; 5
- Labels parsed from JD: `3+`, `3-5`, `at least 5 years`, German `Jahre Berufserfahrung`, LinkedIn seniority

### German ([`scripts/extract-german-required.mjs`](scripts/extract-german-required.mjs))

- Sakshi learning **B2** — skip roles requiring **C1, C2, Fluent, Native**
- Handles tricky JD phrasing ("Native or fluent in German, English B2" — don't mis-read English CEFR as German)
- Soft requirements → `B2`; explicit none → `None`

### Role exclusion

- Config `excludedRoleKeywords` + title must match a `searchQueries` term
- Design/UX roles, directors, VPs, interns excluded by keyword list

### ATS / truth

- Target **≥ 90** ATS via truth-bound skill overlap — **not** keyword stuffing
- Metrics: reuse numeric claims from master/Profile only (e.g. 20% revenue, 28% faster delivery)
- Resume stays **English** even for German JDs

---

## Deploy & operations

### Local (Mac)

```bash
cp .env.example .env          # set N8N_BASIC_AUTH_PASSWORD at minimum (.env is gitignored)
bash scripts/start.sh           # or: docker compose up -d --build
bash scripts/import-workflow.sh # imports workflow.json — then import/publish live workflows separately on prod
```

Stop: `bash scripts/stop.sh` (containers removed; `~/.n8n` data kept).

### Production (Oracle VM + Cloudflare Tunnel)

Primary guide: [`DEPLOY.md`](DEPLOY.md)

```bash
bash deploy.sh n8n.yourdomain.com <cloudflare-tunnel-token>
# Uses docker-compose.prod.yml, .env.prod, 4 GB swap, n8n bound to 127.0.0.1:5678
```

| Component | Role |
|-----------|------|
| `docker-compose.prod.yml` | n8n + linkedin-proxy only (no nginx container) |
| `cloudflared` systemd service | HTTPS termination at Cloudflare edge |
| `nginx/conf.d/n8n.conf` | Legacy nginx + certbot config (not used in current Tunnel deploy) |
| `scripts/backup-n8n.sh` | Export workflows + SQLite before migration |
| `scripts/setup.sh` | One-command Oracle/Ubuntu bootstrap (Docker + import) |

**Credentials after migrate:** Re-authorize Google Sheets + Gmail OAuth in n8n UI (credentials are encrypted with `N8N_ENCRYPTION_KEY` — must match across restores).

**Memory budget (1 GB VM):** ~720 MB idle with swap; see DEPLOY monitoring section.

### Environment variables (names only — never commit values)

| Variable | Where |
|----------|-------|
| `N8N_BASIC_AUTH_USER`, `N8N_BASIC_AUTH_PASSWORD` | n8n login |
| `N8N_ENCRYPTION_KEY` | Credential encryption (prod) |
| `N8N_HOST`, `WEBHOOK_URL`, `GENERIC_TIMEZONE` | n8n config |
| `apifyApiKey`, `liAt`, `openAiApiKey` | ⚙️ Config nodes in n8n |
| `GEMINI_API_KEY`, `RESUME_API_URL`, `RESUME_API_TOKEN` | resume-cv-mvp + generate-application |
| `COMPOSE_PACK_PORT`, `COMPOSE_PACK_TOKEN` | compose-pack-http |
| `N8N_SAVE_DOCS_WEBHOOK` | Override default save webhook URL |
| `R2_BUCKET`, `R2_PUBLIC_BASE_URL`, `R2_KEY_PREFIX` | Cloudflare R2 uploads |
| `SKIP_OPEN_CHECK`, `SKIP_HUMANIZE`, `SKIP_R2_UPLOAD`, `SKIP_SHEET_UPDATE` | Pack script toggles |

`.env.example` is gitignored in this repo — copy from [`docker-compose.yml`](docker-compose.yml) / [`DEPLOY.md`](DEPLOY.md) comments when bootstrapping.

---

## How to run & verify

### Scrapers

1. Open [n8n workflows](https://n8n.fineanmol.dev) → **Execute workflow** on Guest or Apify scraper
2. Check **Executions** for counts in Code node logs (`✅ N genuinely new jobs`)
3. Confirm new rows in [Jobs sheet](https://docs.google.com/spreadsheets/d/1xl94TeV4CA459vAk38_KAymxUEe_YAVwQ0iEajzmnXM/edit)
4. Check digest email

**Proxy health:** `curl http://localhost:9877/health` (or via Docker network)

### Startup targets

See [`STARTUP_TARGETS.md`](STARTUP_TARGETS.md). Quick bootstrap: set `forceImportSeed=true` → execute once → set back to `false`.

### Pack quality (single job)

```bash
# Terminal 1 — in resume-cv-mvp repo
npm run api   # :8791

# Terminal 2 — this repo
node scripts/generate-application.mjs \
  --job-id li_XXXXX \
  --company "Company" \
  --role "Product Manager" \
  --jd-file /path/to/jd.txt

node scripts/verify-pack-quality.mjs \
  --pack-dir applications/jobs/li_XXXXX_company \
  --jd-file /path/to/jd.txt \
  --target 90
```

### Screen queue without generating packs

```bash
node scripts/screen-and-apply-queue.mjs --from-row 589 --limit 20 --mark-expired
```

### Backfills

```bash
npm run backfill-experience   # scripts/backfill-experience-required.mjs
npm run backfill-german       # scripts/backfill-german-required.mjs
npm run backfill-r2           # scripts/backfill-r2-docs.mjs
```

---

## Known issues & gotchas

| Issue | Detail |
|-------|--------|
| **Apify quota** | Workflow `NKosSP6mwPBeqhiV` fails when monthly Apify credits exhausted. Guest scraper remains free fallback. |
| **Few "new" jobs** | Jobs sheet already has thousands of rows — most runs dedupe to zero new IDs. Expected. |
| **Guest enrich loop history** | Re-enabling `SplitInBatches` JD enrich caused stuck runs and silent drops — keep disabled on Guest. |
| **German title false negatives** | Aggressive DE word list may drop borderline English titles — tune `englishOnly` / word list if needed. |
| **Sheet status overwrite** | Apify scraper **must** use `🛡️ Protect Existing Tracked Status` — without it, re-scrapes reset `Applied` → `Not Applied`. |
| **Rate limits** | LinkedIn 429 during open-check — pack factory skips (does not mark Expired). |
| **Secrets** | Never commit `.env`, `li_at`, Apify keys, OpenAI keys, or n8n credentials export. `.gitignore` blocks `.env.example` too. |
| **Monolithic `workflow.json`** | Repo export ≠ prod topology; import individual published workflows from n8n or maintain separate JSON exports. |
| **External dependency** | `resume-cv-mvp` (Designer API) is **not** in this repo — required for PDF generation. |
| **MCP visibility** | Startup targets workflow may need "Available in MCP" enabled in n8n settings for API discovery. |

---

## File map

```
.
├── README.md                          ← this file
├── STARTUP_TARGETS.md                 ← startup watchlist runbook
├── SETUP_GUIDE.md                     ← legacy full setup (JSearch references outdated)
├── DEPLOY.md                          ← Oracle + Cloudflare Tunnel production deploy
├── workflow.json                      ← combined n8n export (import baseline)
├── workflow-startup-targets.json      ← startup targets workflow
├── docker-compose.yml                 ← local n8n + proxy
├── docker-compose.prod.yml            ← prod (localhost bind, named volume)
├── deploy.sh                          ← prod bootstrap script
├── google-sheets-setup.js             ← Jobs / Skills / Stats Apps Script
├── google-sheets-startup-targets-setup.js
├── Profile/Profile.md                 ← master career profile
├── applications/
│   ├── README.md                      ← pack folder layout
│   └── master/                        ← sakshi-resume.json, cover letter, form-answers
├── n8n/compose-application-pack.workflow.ts  ← SDK source for compose webhook workflow
├── proxy/
│   ├── Dockerfile
│   └── linkedin_proxy_server.py       ← /fetch, /check-status, /health
├── nginx/conf.d/n8n.conf              ← legacy TLS proxy config
└── scripts/
    ├── start.sh / stop.sh / setup.sh
    ├── import-workflow.sh
    ├── import-startup-targets-workflow.sh
    ├── backup-n8n.sh
    ├── pack-factory-from-end.mjs      ← batch pack runner
    ├── agent-compose-pack.mjs         ← composer-inline pack builder
    ├── generate-application.mjs       ← Gemini full tailor path
    ├── compose-pack-http.mjs          ← HTTP wrapper :8792
    ├── verify-pack-quality.mjs        ← pre-ship quality gate
    ├── boost-ats.mjs / truth-lexicon.mjs
    ├── experience-filter.mjs
    ├── extract-experience-required.mjs
    ├── extract-german-required.mjs
    ├── check-job-open.mjs
    ├── screen-and-apply-queue.mjs
    ├── upload-application-docs.mjs    ← R2 upload + naming
    ├── backfill-*.mjs
    └── apply_*.py                     ← portal-specific apply helpers (Greenhouse, Personio, …)
```

---

## Related documentation

| Doc | Use when |
|-----|----------|
| [`STARTUP_TARGETS.md`](STARTUP_TARGETS.md) | Setting up / operating funded-startup watchlist |
| [`DEPLOY.md`](DEPLOY.md) | Deploying to Oracle Cloud with Cloudflare Tunnel |
| [`applications/README.md`](applications/README.md) | Per-job pack folder layout |
| [`SETUP_GUIDE.md`](SETUP_GUIDE.md) | Historical step-by-step (some API references superseded by Guest scraper) |

---

## Disclaimer

Provided for **personal job search automation** and educational use.

- Automated LinkedIn access may violate LinkedIn Terms of Service — use at your own risk.
- The Guest API uses the same public endpoints as logged-out job search.
- Do not commit secrets or use this to spam employers.
- Review platform policies and applicable laws before running scrapers or auto-apply tooling.
