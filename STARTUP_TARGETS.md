# DE Funded Startups → Hiring Watchlist (n8n-only)

Fully runs **inside n8n** — Schedule / Manual → HTTP → Code → Google Sheets → Gmail.  
No local Node scripts are required for weekly operation.

Purpose: list **Germany startups that recently raised**, enrich an **action queue** (`Apply now` / `Find contact` / `Watch`) with careers links, optional **apply emails**, and a digest you can act on in ~10 minutes — not auto cold email.

Workflow file: [`workflow-startup-targets.json`](workflow-startup-targets.json)

**Live on n8n:** [DE Funded Startups → PM Targets](https://n8n.fineanmol.dev/workflow/XCzeLgTXXU8o5p1v)  
**Sheet:** [Target sheet](https://docs.google.com/spreadsheets/d/1pZiI5OdkdTCTR3ztXLer2seIQ9JT3SF4wUBJwP_JXsY/edit)  
**Manual run:** `POST https://n8n.fineanmol.dev/webhook/startup-targets-bootstrap`

## What it does (Mon & Thu 08:00 Europe/Berlin)

1. Reads **Target Companies** sheet  
2. Fetches seed CSV when empty / `forceImportSeed=true`  
3. Fetches **Tech.eu** Germany funding rounds (lookback days)  
4. Merges + dedupes; probes website + `/careers` (capped)  
5. **Free hiring + contact check** (no Apify): careers page, LinkedIn **guest** jobs, mailto/`jobs@` scrape on careers/contact/impressum  
6. Sets `next_action` + `next_action_url` + `apply_email`  
7. Rewrites the sheet (**Apply now** first) + emails an **action-queue digest**

## One-time setup

### 1) Google Sheet

1. Create a spreadsheet (e.g. **DE Startup PM Targets**)  
2. Extensions → Apps Script → paste [`google-sheets-startup-targets-setup.js`](google-sheets-startup-targets-setup.js)  
3. Run `setupStartupTargetsSheet`  
4. Copy the spreadsheet ID from the URL  

### 2) Import / sync workflow into n8n

UI: **Workflows → Import from File** → `workflow-startup-targets.json`  

To update the **existing** live workflow (`XCzeLgTXXU8o5p1v`) after code changes:

```bash
export N8N_URL=https://n8n.fineanmol.dev
export N8N_API_KEY=...   # n8n → Settings → API
node scripts/sync-startup-targets-to-n8n.mjs
```

Or re-run the patcher then sync:

```bash
node scripts/patch-startup-action-queue.mjs
node scripts/sync-startup-targets-to-n8n.mjs
```

First-time import only:

```bash
export N8N_URL=https://your-n8n-host
export N8N_BASIC_AUTH_USER=...
export N8N_BASIC_AUTH_PASSWORD=...
bash scripts/import-startup-targets-workflow.sh
```

### 3) Credentials (reuse jobs workflow)

On each Google Sheets / Gmail node, select the same OAuth credentials as the LinkedIn jobs workflow.

### 4) Config node

| Field | Example / notes |
|-------|-----------------|
| `startupTargetsSpreadsheetId` | Sheet ID from step 1 |
| `startupTargetsSheetName` | `Target Companies` |
| `targetsMetaSheetName` | `Targets Meta` |
| `yourEmail` | Fallback recipient |
| `digestEmails` | `agarwal.anmol2004@gmail.com, ch.sakshiasb@gmail.com` |
| `techEuLookbackDays` | `14` |
| `maxEnrichPerRun` | `40` (website/careers HEAD checks) |
| `maxHiringChecksPerRun` | `25` (careers + LinkedIn guest per run) |
| `hiringCheckEnabled` | `true` |
| `forceImportSeed` | `true` **only on first run**, then `false` |
| `seedCsvUrl` | Default seed sheet export URL (already set) |
| `sheetUrl` | Optional full Sheets URL for digest link |

### 5) First run (bootstrap)

1. Set `forceImportSeed` = `true`  
2. **Execute workflow** once (or hit bootstrap webhook)  
3. Confirm companies in **Target Companies**  
4. Set `forceImportSeed` = `false`  
5. Keep workflow **Active** (Mon & Thu 08:00)

## Sheet write rules

Each run **clears and rewrites** `Target Companies` (no append-only pile-up):

- **Dedupe** by normalized company name (strips GmbH/AG/etc., case-insensitive)
- **Action queue first**: `Apply now` → `Find contact` → `Watch` (then by `priority_score`)
- Header row rewritten every run (includes `apply_email`, `next_action`, `next_action_url`)

### Action columns

| Field | Meaning |
|-------|---------|
| `next_action` | `Apply now` / `Find contact` / `Watch` / `Applied` / `Skip` |
| `next_action_url` | One click: job URL, careers, or `mailto:` |
| `apply_email` | Best public email found (`jobs@`, `careers@`, mailto, etc.) |

### How to hide a company from the next email

In the sheet, set **`status`** after you act:

| status | Meaning |
|--------|---------|
| `Applied` | Applied to a role — hidden from next digest |
| `Contacted` | Emailed / messaged — hidden from next digest |
| `Skip` | Not a fit — hidden from next digest |
| `Watch` / `Ready to Apply` | Still in the action queue |

`status` is **sticky** across Mon/Thu runs (funding updates will not reset it).

## Digest content

Email is an **action queue**, not a raw funding dump:

1. **Apply now** — hiring signal + job/careers/email link  
2. **Find contact** — funded + website/careers, no clear role yet (email when found)  
3. **Latest funding updates** — short awareness list  

### Gmail drafts (no auto-send)

When a company has `apply_email` and is `Apply now` / `Find contact`, the workflow **creates a Gmail draft** (capped by `maxDraftsPerRun`, default 8). Nothing is sent.

- Review in **Gmail → Drafts**, edit, send yourself  
- Then set sheet `status` = `Contacted` or `Applied`  
- `last_draft_at` prevents re-drafting the same company for `draftCooldownDays` (default 14)

Config: `draftEmailsEnabled`, `maxDraftsPerRun`, `candidateName`, `candidateEmail`, `candidateLinkedin`, `candidatePortfolio`, `draftCooldownDays`.

## Free hiring / contact sources (no Apify)

1. Company `website` / `/careers` / `/jobs` HTML signals (Greenhouse, Personio, “open positions”, etc.)  
2. LinkedIn public guest API: `jobs-guest/jobs/api/seeMoreJobPostings/search` filtered by company name  
3. Mailto + email scrape on careers, `/contact`, `/impressum`, homepage (prefers `jobs@` / `careers@` / `talent@`) 

## Node map

```
Manual / Mon+Thu schedule / Webhook
  → Config
  → Read Target Companies
  → Fetch Seed CSV + Fetch Tech.eu (parallel)
  → Merge Enrich Score (Code)
  → Free Hiring Check + Digest (careers + LinkedIn guest + apply_email)
  → Expand rows
  → Action-queue email + Clear/rewrite sheet (Apply now first) + Meta last_run
```

## Sources

- Seed: [shared funded list](https://docs.google.com/spreadsheets/d/1up3Vy8aZsMdDMPqzOwW0ZEJ26fppJyilJqSEXNU3HEo/)  
- Weekly funding: [Tech.eu API](https://funding.tech.eu/for-ai) `country=Germany`  
- Hiring: Apify `cheap_scraper~linkedin-job-scraper` (same actor as jobs WF)

## Out of scope

- Local cron / `node scripts/...` for production  
- Auto CV/CL packs (use pack factory when a real job URL appears)  
- Startup-Verband Neugründungen list (not funding)
