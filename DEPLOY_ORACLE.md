# OrbitalQuery — Oracle Cloud Always Free Deployment

## Why Oracle Cloud

| | Render Free | Oracle Cloud Always Free |
|---|---|---|
| **RAM** | 512 MB | **12-24 GB** |
| **CPU** | Shared | **2-4 ARM cores** |
| **Cold starts** | 30-60s every request | **None — always on** |
| **Spin down** | After 15 min idle | **Never** |
| **Cost** | Free (with limits) | **Free forever** |
| **Storage** | Ephemeral | **200 GB block** |

Oracle Cloud Always Free gives you a real VM that runs 24/7. No cold starts, no spin-downs, no sleeping services.

## Architecture

```
                    Internet
                       │
                       ▼
              ┌────────────────┐
              │  Oracle Cloud  │
              │  ARM VM        │
              │  (Ubuntu)      │
              │                │
              │  ┌──────────┐  │
              │  │  Nginx   │  │  ← Optional: SSL/HTTPS
              │  │  :80/443 │  │
              │  └────┬─────┘  │
              │       │        │
              │  ┌────▼─────┐  │
              │  │ Backend  │  │  ← Node.js :3001
              │  │ Express  │  │
              │  └────┬─────┘  │
              │       │        │
              │  ┌────▼─────┐  │
              │  │ Python   │  │  ← FastAPI :8000
              │  │ Analysis │  │
              │  └──────────┘  │
              └────────────────┘
                       │
                       ▼
              Vercel (Frontend)
              orbiralquery.vercel.app
```

## Step 1: Create Oracle Cloud Account

1. Go to [cloud.oracle.com](https://cloud.oracle.com)
2. Sign up for an Always Free account (requires credit card for verification, but you won't be charged)
3. Select your home region (choose closest to your users)

## Step 2: Create ARM VM

1. Go to **Compute > Instances > Create Instance**
2. Configure:
   - **Name**: `orbitalquery`
   - **Image**: Ubuntu 22.04 or 24.04 (aarch64)
   - **Shape**: **VM.Standard.A1.Flex**
     - OCPUs: **2** (max 4 free)
     - Memory: **12 GB** (max 24 GB free)
   - **Networking**: Create a VCN with default settings
   - **SSH Keys**: Upload your public key
3. Click **Create**
4. Note the **Public IP address**

## Step 3: SSH into the VM

```bash
ssh -i ~/.ssh/your_key ubuntu@<PUBLIC_IP>
```

## Step 4: Run Setup Script

```bash
# Option A: Clone and run
git clone https://github.com/saatvikraghuvanshi-lab/OrbitalQuery.git
cd OrbitalQuery
bash scripts/oracle-cloud-setup.sh

# Option B: One-liner
curl -fsSL https://raw.githubusercontent.com/saatvikraghuvanshi-lab/OrbitalQuery/main/scripts/oracle-cloud-setup.sh | bash
```

The script will:
1. Install Docker and Docker Compose
2. Configure the firewall
3. Build both services (Node.js + Python)
4. Start everything with Docker Compose
5. Run health checks

## Step 5: Update Frontend

In your Vercel project settings or `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "http://<PUBLIC_IP>:3001/api/:path*"
    }
  ]
}
```

Or set the environment variable:
```
NEXT_PUBLIC_BACKEND_URL=http://<PUBLIC_IP>:3001
```

## Step 6: (Optional) Set Up SSL with Let's Encrypt

For production, you'll want HTTPS. The fastest path:

1. Point a domain to your VM's IP (e.g., `api.orbitalquery.com`)
2. Uncomment the Nginx service in `docker-compose.yml`
3. Install Certbot:

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d api.orbitalquery.com
```

4. Copy certs to the nginx volume and restart.

## Day-to-Day Commands

```bash
# View logs
sudo docker compose logs -f

# View specific service
sudo docker compose logs -f backend
sudo docker compose logs -f python

# Restart everything
sudo docker compose restart

# Rebuild and restart (after code changes)
sudo docker compose up -d --build

# Stop everything
sudo docker compose down

# Check status
sudo docker compose ps

# Check resource usage
docker stats --no-stream
```

## Updating the Application

When you push new code to GitHub:

```bash
ssh ubuntu@<PUBLIC_IP>
cd ~/OrbitalQuery
git pull
sudo docker compose up -d --build
```

Or set up a GitHub webhook for automatic deployment.

## Monitoring

The services include health checks:
- **Backend**: `http://<IP>:3001/api/health` (every 30s)
- **Python**: `http://<IP>:8000/health` (every 30s)

If a service crashes, Docker will automatically restart it (`restart: unless-stopped`).

## Troubleshooting

**Services not starting?**
```bash
sudo docker compose logs -f
```

**Out of memory?**
```bash
free -h
docker stats --no-stream
```
If using all 12GB, consider reducing to 2GB for Python and 512MB for Node.js in docker-compose.yml.

**Can't connect from frontend?**
- Check firewall: `sudo ufw status`
- Check services: `sudo docker compose ps`
- Test locally: `curl http://localhost:3001/api/health`
- Oracle Cloud security list: Ensure port 3001 is open in the cloud console networking rules

**Python service slow on first request?**
With Oracle Cloud's always-on VM, there are NO cold starts. The Python service stays running 24/7. If it's slow, it's doing actual computation, not warming up.
