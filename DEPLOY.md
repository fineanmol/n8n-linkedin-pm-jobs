# Deploy n8n to Oracle Cloud E2.1.Micro (Free Tier)

This guide deploys the job automation stack to the **Always Free** `VM.Standard.E2.1.Micro`
(1 OCPU, 1 GB RAM, AMD EPYC) using **Cloudflare Tunnel** for HTTPS — no nginx container
needed, no ports to open.

---

## Why Cloudflare Tunnel?

| Approach | Containers | RAM used | Open ports |
|---|---|---|---|
| nginx + certbot | 4 | ~800 MB (risky on 1 GB) | 80, 443 |
| **Cloudflare Tunnel** | **2** | **~550 MB** | **none** |

Cloudflare Tunnel runs as a lightweight host daemon (~40 MB) and creates an outbound-only
encrypted connection from your VM to Cloudflare's edge. No inbound firewall rules needed.
HTTPS and your subdomain are handled automatically.

---

## Prerequisites

- Oracle Cloud VM.Standard.E2.1.Micro running Ubuntu 22.04
- A domain on **Cloudflare** (free plan is fine — add your domain at dash.cloudflare.com)
- SSH access to the VM
- Your subdomain decided, e.g. `n8n.yourdomain.com`

---

## Step 1 — Create the VM

1. Oracle Cloud Console → **Compute → Instances → Create Instance**
2. Name: `n8n-automation`
3. Shape: `VM.Standard.E2.1.Micro` (Always Free)
4. Image: **Ubuntu 22.04 Minimal**
5. Networking: default VCN, assign a public IP
6. Add your SSH public key
7. Click **Create**

> No need to open ports 80 or 443 in the Security List — Cloudflare Tunnel is outbound-only.
> You only need **port 22 (SSH)** open, which is the default.

---

## Step 2 — Transfer the project to the VM

```bash
# From your Mac (in the project folder)
scp -r . ubuntu@<VM_PUBLIC_IP>:~/n8n-automation/
```

Or use git if you have the repo on GitHub:

```bash
ssh ubuntu@<VM_PUBLIC_IP>
git clone https://github.com/yourusername/your-repo.git ~/n8n-automation
```

---

## Step 3 — Create a Cloudflare Tunnel

1. Go to **dash.cloudflare.com → Zero Trust → Networks → Tunnels**
2. Click **Add a tunnel** → **Cloudflared**
3. Name it `n8n-tunnel`
4. Click **Save tunnel** — you'll see an install command. **Copy the token** from it:
   ```
   cloudflared service install eyJhIjoiMWY...verylongtoken...
   ```
   The token is the last argument.
5. Under **Public Hostname**, add:
   - **Subdomain:** `n8n` (or whatever prefix)
   - **Domain:** your domain
   - **Service:** `http://localhost:5678`
6. Save. Cloudflare will now route `https://n8n.yourdomain.com` → your VM's port 5678.

---

## Step 4 — Run the deploy script

```bash
ssh ubuntu@<VM_PUBLIC_IP>
cd ~/n8n-automation

chmod +x deploy.sh
bash deploy.sh n8n.yourdomain.com eyJhIjoiMWY...your-tunnel-token...
```

The script will:
- Install Docker
- Create a **2 GB swap file** (critical — prevents OOM crashes)
- Generate a random password and encryption key in `.env.prod`
- Install and start `cloudflared` as a systemd service
- Build and start the two Docker containers (n8n + linkedin-proxy)
- Set up auto-restart on reboot

> **Save the credentials printed at the end.** They won't be shown again.

---

## Step 5 — Import workflows

1. Open `https://n8n.yourdomain.com` and log in with the credentials from Step 4
2. Go to **Settings → Import Workflow**
3. Import these files one by one:
   - `workflow.json` (main LinkedIn scraper)
   - `wf2_apify.json` (Apify scraper) — if you have it
   - `wf3_status.json` (Job Status Updater) — if you have it

---

## Step 6 — Re-connect credentials

After import, Google Sheets and Gmail OAuth will be broken (they're tied to your local n8n).
Re-authorize them:

1. **Settings → Credentials**
2. Open **Google Sheets OAuth2** → click **Sign in with Google** → re-authorize
3. Open **Gmail OAuth2** → same process
4. Check each workflow — any node with a red exclamation mark needs its credential re-selected

---

## Step 7 — Set your LinkedIn `li_at` cookie

In the **Job Status Updater** workflow:

1. Open the `⚙️ Config` node
2. Set `liAt` to your LinkedIn `li_at` cookie value
3. Save

> To find your `li_at` cookie: LinkedIn in Chrome → DevTools (F12) → Application →
> Cookies → linkedin.com → find `li_at`

---

## Monitoring on 1 GB RAM

SSH in and check:

```bash
# Memory + swap usage
free -h

# Container resource usage
docker stats --no-stream

# n8n logs
docker logs n8n --tail 50

# Cloudflare Tunnel status
sudo systemctl status cloudflared
```

Expected idle usage:

| Component | RAM |
|---|---|
| OS (Ubuntu minimal) | ~200 MB |
| Docker daemon | ~50 MB |
| cloudflared (host) | ~40 MB |
| linkedin-proxy | ~30 MB |
| n8n | ~400 MB |
| **Total** | **~720 MB** |
| Swap available | 2 GB |

---

## Troubleshooting

**n8n won't start / OOM killed:**
```bash
# Check if swap is active
swapon --show
# If empty, re-add it:
sudo swapon /swapfile
```

**Cloudflare Tunnel not connecting:**
```bash
sudo systemctl status cloudflared
sudo journalctl -u cloudflared -n 50
```

**n8n container keeps restarting:**
```bash
docker logs n8n --tail 100
# Common cause: wrong N8N_ENCRYPTION_KEY (don't change it after first run)
```

**Workflow fails with "service unavailable":**
The VM may have run out of memory. SSH in and run `free -h`. If swap is nearly full, reduce `checkBatchSize` in the Job Status Updater config node from 30 to 10.

---

## Updating n8n

```bash
cd ~/n8n-automation
docker compose -f docker-compose.prod.yml --env-file .env.prod pull n8n
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d n8n
```
