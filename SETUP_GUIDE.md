# 🎯 LinkedIn Job Application & ATS Resume Automation

A complete n8n workflow that automatically scrapes LinkedIn jobs, optimizes your resume for ATS, generates cover letters, and applies to jobs — all while tracking everything in Google Sheets.

---

## 🏗️ Workflow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  SECTION 1: JOB SCRAPER  (Every 6 Hours)                        │
│  Schedule → JSearch API → Parse → Filter New → Save to Sheets   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  SECTION 2: JOB APPLICATOR  (9 AM, Mon–Fri)                     │
│  Read Sheet → For Each Job:                                     │
│    → OpenAI: Extract required skills from JD                    │
│    → Compare with your skills sheet                             │
│    → If skills missing: Update Google Docs resume + add ATS kws │
│    → Generate personalized cover letter                         │
│    → If LinkedIn Easy Apply: Submit via Apify                   │
│    → If External: Flag + email you the cover letter             │
│    → Update Sheet + Email confirmation                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  SECTION 3: STATUS TRACKER  (Every 2 Days)                      │
│  Read applied jobs → Build report → Email summary               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Prerequisites

| Service | Purpose | Cost | Link |
|---------|---------|------|------|
| **n8n** | Workflow engine | Free (self-hosted) | localhost:5678 |
| **Google Account** | Sheets + Docs + Drive + Gmail | Free | — |
| **LinkedIn Guest API** | Job scraping (primary) | **100% Free — no key** | Built-in to LinkedIn |
| **OpenAI** | ATS analysis + cover letters | ~$1-2/month | [platform.openai.com](https://platform.openai.com) |
| **Apify** | LinkedIn Easy Apply automation | $5 free credits/mo | [apify.com](https://apify.com) |
| **LinkedIn Jobs Data API** | Optional: company enrichment | 10 req/month free | [rapidapi.com](https://rapidapi.com/karimgreek/api/linkedin-jobs-data-api) |

> **Why not JSearch or LinkedIn Jobs Data API for scraping?**
> The [LinkedIn Jobs Data API](https://rapidapi.com/karimgreek/api/linkedin-jobs-data-api) is a **company search** API (`/companies/search`), not a job search API — it returns company profiles, not job listings. And with only 10 requests/month free, it's too limited for daily scraping. Instead, this workflow uses **LinkedIn's own public Guest API** (`linkedin.com/jobs-guest/...`) which is completely free, requires no API key, and is the same data LinkedIn shows to logged-out users.

---

## 🚀 Step-by-Step Setup

### Step 1: Create Your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) → Create new spreadsheet
2. Name it: **"Job Application Tracker"**
3. Open **Extensions → Apps Script**
4. Paste the contents of `google-sheets-setup.js` into the editor
5. Click **Run → setupAllSheets**
6. Authorize when prompted
7. Copy the **Sheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/[THIS_IS_YOUR_SHEET_ID]/edit
   ```

**Sheets created automatically:**
- **Jobs** — All job listings with status tracking
- **My Skills** — Your skills (update with your actual skills!)
- **Cover Letters** — Stored generated cover letters
- **Stats** — Live dashboard with application metrics

### Step 2: Prepare Your Resume in Google Docs

1. Go to [docs.google.com](https://docs.google.com) → Create new document
2. Name it: **"Master Resume"**
3. Paste your resume text (plain text or formatted)
4. Make sure the **Skills section** is clearly labeled
5. Copy the **Doc ID** from the URL:
   ```
   https://docs.google.com/document/d/[THIS_IS_YOUR_DOC_ID]/edit
   ```

### Step 3: Get Your API Keys

#### LinkedIn Guest API — Job Scraping (FREE, no sign-up needed)
The workflow uses LinkedIn's public guest API endpoints directly:
- **Search jobs**: `linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search`
- **Job details**: `linkedin.com/jobs-guest/jobs/api/jobPosting/{jobId}`

No API key required. These are the same endpoints LinkedIn uses for logged-out users. **No configuration needed — it just works.**

#### LinkedIn Jobs Data API (Optional — for company info only)
If you want to enrich jobs with additional company data using your 10 free req/month:
1. Go to [rapidapi.com/karimgreek/api/linkedin-jobs-data-api](https://rapidapi.com/karimgreek/api/linkedin-jobs-data-api)
2. Add the `linkedInJobsApiKey` value in Configuration node
3. Use sparingly — 10/month limit

#### OpenAI API
1. Go to [platform.openai.com](https://platform.openai.com)
2. Create an account → API Keys → Create new secret key
3. Add $5 credit to your account (will last months for this use)
4. Copy your **API Key**

#### Apify (LinkedIn Easy Apply)
1. Sign up at [apify.com](https://apify.com)
2. Go to Settings → Integrations → API Token
3. Copy your **API Token** ($5 free credits/month included)
4. Search for **"LinkedIn Easy Apply"** actor in Apify Store

### Step 4: Set Up n8n Credentials

In your n8n instance at `http://localhost:5678`:

1. Go to **Settings → Credentials → Add Credential**

Add these credentials:

| Credential Name | Type |
|----------------|------|
| Google Sheets OAuth2 | Google Sheets OAuth2 API |
| Gmail OAuth2 | Gmail OAuth2 API |
| Google Docs OAuth2 | Google Docs OAuth2 API |

For Google OAuth2 setup:
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable these APIs:
   - Google Sheets API
   - Gmail API
   - Google Docs API
   - Google Drive API
3. Create OAuth2 credentials (Web Application type)
4. Add `http://localhost:5678/rest/oauth2-credential/callback` as redirect URI

### Step 5: Import the Workflow

1. Open n8n at `http://localhost:5678`
2. Click **+** to create new workflow → **Import from file**
3. Select `linkedin-job-automation.json`
4. The workflow will open with all nodes

### Step 6: Configure the Workflow

Update these values in the **"⚙️ Configuration"** and **"⚙️ Apply Configuration"** nodes:

| Field | Your Value |
|-------|-----------|
| `searchQueries` | Comma-separated job searches (e.g., `software engineer Germany,DevOps Berlin`) |
| `linkedInJobsApiKey` | Optional: your RapidAPI key for company enrichment |
| `spreadsheetId` | Your Google Sheet ID |
| `yourEmail` | Your Gmail address |
| `resumeDocId` | Your Google Docs resume ID |
| `apifyApiKey` | Your Apify API token |
| `openAiApiKey` | Your OpenAI API key |
| `fullName` | Your full name |
| `phoneNumber` | Your phone number |
| `linkedInProfileUrl` | Your LinkedIn profile URL |

### Step 7: Update Your Skills Sheet

1. Open your Google Sheet → **"My Skills"** tab
2. Delete the sample skills
3. Add all your actual skills (one per row)
4. Be specific: e.g., `React.js`, `PostgreSQL`, `Docker`, `Agile/Scrum`

This is critical — the workflow compares job requirements against this list to find skill gaps!

### Step 8: Customize Search Queries

Edit the `searchQueries` field in the Configuration node. Examples:
```
software engineer Germany,
road traffic management Germany,
infrastructure project manager,
DevOps engineer Munich,
data engineer Berlin,
full stack developer remote
```

### Step 9: Test & Activate

1. **Test Section 1 first**: Click "Execute" on the Scraper trigger manually
   - Check that jobs appear in your Google Sheet

2. **Test Section 2**: Add a test job manually in the sheet with status "Not Applied"
   - Then manually execute the Apply trigger
   - Check your email for the application confirmation

3. **Activate the workflow**: Toggle the "Active" switch
   - Scraper runs every 6 hours
   - Applications run 9 AM Mon–Fri
   - Status report every 2 days

---

## 📊 Google Sheet Structure

### Jobs Sheet Columns

| Column | Description |
|--------|-------------|
| `job_id` | Unique job ID from JSearch |
| `company` | Company name |
| `position` | Job title |
| `location` | City, Country |
| `job_url` | Direct link to apply |
| `apply_type` | `LinkedIn Easy Apply` / `LinkedIn External` / `Direct Website` |
| `is_linkedin` | Yes/No |
| `is_remote` | Yes/No |
| `employment_type` | FULLTIME, PARTTIME, etc. |
| `status` | **Not Applied → Applied → Under Review → Interview Scheduled → Offer/Rejected** |
| `priority` | High / Medium / Low (set manually) |
| `skill_match_score` | % of required skills you have |
| `missing_skills` | Skills added to resume for this job |
| `posted_date` | When job was posted |
| `applied_date` | When you/the bot applied |
| `last_checked` | Last time status was checked |
| `application_id` | Reference ID from platform |
| `cover_letter_generated` | Yes/No |
| `resume_optimized` | Yes/No — was resume updated for this job |
| `notes` | Auto-generated notes |

### My Skills Sheet Columns

| Column | Description |
|--------|-------------|
| `skill` | Skill name (e.g., `React.js`, `PostgreSQL`) |
| `category` | Programming, DevOps, AI/ML, etc. |
| `proficiency` | Beginner / Intermediate / Advanced / Expert |
| `years_experience` | Number of years |
| `notes` | Additional context |

---

## ⚙️ Customization

### Change Job Search Domains
Edit the `searchQueries` in Configuration node:
```
road construction project manager Germany,
traffic infrastructure engineer,
transportation planning Germany
```

### Adjust Application Rate Limiting
The workflow waits **5 minutes between applications** to avoid triggering LinkedIn's bot detection. Increase this in the "⏱️ Wait 5 Min" node if needed.

### Change Schedule Times
- **Scraper**: Currently every 6 hours (`0 */6 * * *`)
- **Applicator**: 9 AM Mon-Fri (`0 9 * * 1-5`)
- **Status check**: Every 2 days (`0 10 */2 * *`)

### Filter by Priority
Change the Google Sheets filter in "📊 Get Jobs to Apply" node to only apply for High priority jobs:
- Add filter: `priority = High`

### Add More Job Platforms
Duplicate the JSearch HTTP request node and modify it to search:
- Indeed: use `indeed.com` in JSearch query
- Glassdoor: add `site:glassdoor.com` to query

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|---------|
| No jobs found | Check RapidAPI key is valid, verify search query format |
| Google Sheets not updating | Reauthorize Google Sheets OAuth2 credential |
| OpenAI errors | Check API key, ensure you have credit balance |
| Apify apply failing | LinkedIn may require 2FA — configure Apify actor settings |
| Email not sending | Reauthorize Gmail credential in n8n |
| Duplicate jobs appearing | Check that `job_id` column matches between runs |

---

## 📈 Tips for Best Results

1. **Set priorities in the sheet** — Mark important jobs as "High" priority to ensure they get applied to first
2. **Keep your Skills sheet updated** — The more accurate it is, the better the ATS optimization
3. **Review cover letters** — The workflow emails you each cover letter; review before important applications
4. **Don't over-automate** — For "Manual Apply Required" jobs, the workflow emails you the cover letter so you can apply carefully
5. **Monitor rate limits** — RapidAPI free tier allows 500 searches/month; if searching many queries, consider reducing frequency
6. **Check Apify logs** — If Easy Apply isn't working, check the Apify actor run logs at apify.com

---

## 🔒 Privacy & Compliance

- Store all API keys in n8n credentials, never hardcoded
- LinkedIn Terms of Service prohibit automated scraping — use at your own discretion
- The workflow uses LinkedIn's publicly available job search, not scraping private data
- Apify's Easy Apply actor simulates human behavior to reduce detection risk
- Your resume and personal data stay within your own Google account

---

## 📞 Workflow Flow Summary

```
Every 6 hours:
  LinkedIn Guest API (FREE) → Parse HTML job cards → Filter new → Add to Google Sheet → Email summary
  - Waits 3 seconds between each keyword query to avoid rate limiting

Every weekday 9 AM (for each "Not Applied" job):
  1. Fetches FULL job description from LinkedIn Guest API (free)
  2. OpenAI analyzes job description → extracts required skills
  2. Compares with YOUR skills in sheet → finds gaps
  3. If gaps found → updates your Google Doc resume with missing ATS keywords
  4. Generates personalized cover letter using job details
  5. If LinkedIn Easy Apply → Apify submits application automatically
  6. If external apply → marks job, emails you cover letter + job link
  7. Updates sheet with status, match score, notes
  8. Waits 5 minutes → processes next job

Every 2 days:
  Reads all "Applied" jobs → sends you a status report email
  Flags jobs with no response after 7+ days for follow-up
```
