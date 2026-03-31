# LinkedIn PM Job Automation — n8n + Docker

Automatically scrapes LinkedIn for **English-language Product Manager jobs in Germany**, deduplicates them, saves to Google Sheets, and sends a daily digest email.  
Runs 100% free on your own machine or any free cloud VM.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Docker Compose                                     │
│                                                     │
│  ┌──────────┐   HTTP      ┌──────────────────────┐  │
│  │   n8n    │ ──────────▶ │  linkedin-proxy :9877│  │
│  │ :5678    │             │  (curl, bypasses TLS) │  │
│  └──────────┘             └──────────────────────┘  │
│       │                                             │
│       ▼                                             │
│  Google Sheets / Gmail / Google Docs               │
└─────────────────────────────────────────────────────┘
```

**Why a proxy?** LinkedIn detects and blocks n8n's HTTP client via TLS fingerprinting.  
The proxy uses `curl` which has a browser-like TLS fingerprint that LinkedIn allows.

---

## Quick Start (Local)

### 1. Clone & configure

```bash
git clone https://github.com/fineanmol/n8n-linkedin-pm-jobs.git
cd n8n-linkedin-pm-jobs
cp .env.example .env
# Edit .env — set N8N_BASIC_AUTH_PASSWORD at minimum
```

### 2. Start the stack

```bash
docker compose up -d
```

n8n is now at **http://localhost:5678**  
Login with the credentials from your `.env`

### 3. Import the workflow

```bash
bash scripts/import-workflow.sh
```

### 4. Set up credentials in n8n UI

Go to **Settings → Credentials** and add:
| Credential | Used by |
|---|---|
| Google Sheets OAuth2 | Save jobs, track status |
| Gmail OAuth2 | Digest email |
| Google Docs OAuth2 | Fetch resume (for AI optimisation) |

### 5. Configure the ⚙️ Config node

Open the workflow → click `⚙️ Config` → fill in:

| Field | Description |
|---|---|
| `proxyUrl` | `http://linkedin-proxy:9877/fetch` (leave as-is) |
| `searchQueries` | `Product Manager,Product Owner,Head of Product` |
| `searchLocation` | `Germany` |
| `pmKeywords` | Role filter (comma-separated keywords) |
| `englishOnly` | `true` to skip German job postings |
| `spreadsheetId` | Google Sheet ID from its URL |
| `yourEmail` | Where digest emails are sent |
| `openAiApiKey` | For AI resume optimisation (optional) |
| `apifyApiKey` | For LinkedIn Easy Apply bot (optional) |
| `resumeDocId` | Google Docs ID of your resume |
| `fullName` | Your full name |

### 6. Activate & run

Toggle the workflow **Active** → it runs every 6 hours automatically.  
Or click **Execute Workflow** to run manually.

---

## Deploy for Free on Oracle Cloud (24/7)

> ⚠️ **Cloud Shell ≠ Free VM.** Oracle Cloud Shell is a browser terminal — it times out, has no sudo, and can't run persistent services. You need a **Compute Instance** (free, takes 3 min to create).

### 1. Create a free Oracle Cloud Compute VM

1. Log in → **Compute → Instances → Create Instance**
2. Name it anything (e.g. `n8n-server`)
3. Click **Change Shape** → choose **VM.Standard.A1.Flex** (ARM, 4 OCPU / 24 GB — Always Free)
4. Under **Networking** → make sure a public IP is assigned
5. **Add SSH key** (download the private key)
6. Click **Create**

### 2. Open port 5678 in Oracle's firewall

**Console → Networking → Virtual Cloud Networks → your VCN → Security Lists → Default → Add Ingress Rule:**
- Source: `0.0.0.0/0`
- Protocol: `TCP`
- Destination Port: `5678`

### 3. SSH into the VM and run one command

```bash
# SSH in (replace with your actual IP and key path)
ssh -i ~/Downloads/your-key.pem ubuntu@<vm-public-ip>

# On the VM — one command does everything:
git clone https://github.com/fineanmol/n8n-linkedin-pm-jobs.git
cd n8n-linkedin-pm-jobs
bash scripts/setup.sh
```

`setup.sh` automatically:
- Installs Docker + Docker Compose (no sudo issues)
- Generates a random password
- Builds and starts both containers
- Imports the workflow
- Prints the URL, username and password

### 4. Access n8n
`http://<your-oracle-vm-ip>:5678`

---

## How It Works

```
Every 6 hours:
  1. ⚙️ Config          → load all settings
  2. 📝 Split Queries   → 5 keywords × 2 pages = 10 LinkedIn fetches
  3. 🔍 LinkedIn Fetch  → via linkedin-proxy (sortBy=DD, last 24h)
  4. 📋 Parse HTML      → extract job ID, title, company, location, URL
  5. 🔎 Filter          → deduplicate + English-only + PM role check + not in sheet
  6. 💾 Save to Sheet   → append new jobs to Google Sheets
  7. 📧 Email digest    → ONE summary email with all new jobs

Daily at 9am (weekdays):
  8. 📊 Get jobs to apply → jobs with status "To Apply"
  9. 🤖 AI optimise resume → match resume to each JD using OpenAI
  10. 🚀 Easy Apply       → submit via Apify bot (if Easy Apply available)
  11. 📊 Update status    → mark applied in sheet
```

---

## Updating Configuration

**Everything is in the `⚙️ Config` node** — you never need to edit code.

To add a new PM keyword: open Config node → `pmKeywords` → add to the comma-separated list → Save.

To disable English filter: open Config node → `englishOnly` → set to `false` → Save.

---

## Project Structure

```
.
├── docker-compose.yml          # n8n + linkedin-proxy services
├── .env.example                # environment variable template
├── workflow.json               # n8n workflow (import into n8n UI)
├── proxy/
│   ├── Dockerfile              # lightweight Python + curl image
│   └── linkedin_proxy_server.py  # HTTP proxy server
└── scripts/
    └── import-workflow.sh      # one-command workflow import
```

---

## Free Hosting Options

| Platform | Free Tier | Notes |
|---|---|---|
| **Oracle Cloud** | Always free (ARM VM, 24GB RAM) | Best option — no expiry |
| **Your Mac/PC** | Free while machine is on | Already working |
| Railway.app | 500 hrs/month | Sleeps when idle |
| Render.com | 750 hrs/month | Sleeps after 15 min inactivity |

> **Note**: Cloud datacenter IPs may occasionally be rate-limited by LinkedIn.  
> The proxy helps, but residential IPs (your Mac) are the most reliable.
