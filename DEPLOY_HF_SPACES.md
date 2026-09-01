# Deploy Python Analysis Service to Hugging Face Spaces

Free. No credit card. 16GB RAM. Docker support.

## Why Hugging Face Spaces

- **Free** — no credit card required
- **16 GB RAM** — enough for rasterio, numpy, scipy
- **Docker support** — run any Python service
- **Fast cold starts** — ~10-15s (vs Render's 30-60s)
- **Always accessible** — stays alive longer than Render

## Step 1: Create a Hugging Face Account

1. Go to **[huggingface.co](https://huggingface.co)**
2. Click **Sign Up** (top right)
3. Create a free account (email + password, no credit card)

## Step 2: Create a New Space

1. Go to **[huggingface.co/new-space](https://huggingface.co/new-space)**
2. Fill in:
   - **Space name**: `orbitalquery-analysis` (or anything you like)
   - **License**: MIT
   - **SDK**: **Docker**
   - **Visibility**: Public (or Private if you prefer)
3. Click **Create Space**

## Step 3: Upload the Code

**Option A — Git push (recommended):**

On your computer:

```bash
# Clone your new Space
git clone https://huggingface.co/spaces/<YOUR_USERNAME>/orbitalquery-analysis
cd orbitalquery-analysis

# Copy the analysis service code
cp -r /path/to/OrbitalQuery/analysis-service/* .

# Push to Hugging Face
git add .
git commit -m "Initial deployment"
git push
```

**Option B — Web upload:**

1. Go to your Space page on Hugging Face
2. Click **Files** tab → **Upload files**
3. Upload everything from the `analysis-service/` folder:
   - `Dockerfile`
   - `README.md` (the one with `sdk: docker` in front matter)
   - `requirements.txt`
   - `app/` folder (entire directory)
   - `start.sh`

## Step 4: Wait for Build

Hugging Face will automatically:
1. Detect the `Dockerfile`
2. Build the Docker image (takes 3-5 minutes on first build)
3. Start the service

You can watch the build logs in the **Logs** tab of your Space.

## Step 5: Get Your Space URL

Once running, your service is available at:

```
https://<YOUR_USERNAME>-orbitalquery-analysis.hf.space
```

Test it:
```
https://<YOUR_USERNAME>-orbitalquery-analysis.hf.space/health
```

Should return: `{"status": "ok", ...}`

## Step 6: Update the Node.js Backend

You need to tell the Node.js backend (on Render) where the Python service now lives.

1. Go to **Render Dashboard** → your Node.js backend service
2. Go to **Environment** tab
3. Update `PYTHON_SERVICE_URL`:
   ```
   https://<YOUR_USERNAME>-orbitalquery-analysis.hf.space
   ```
4. Save — Render will auto-redeploy

## Step 7: Test End-to-End

1. Go to **orbitalquery.vercel.app**
2. Type: `Sundarbans deforestation 2019 vs 2024`
3. Wait 10-20 seconds (HF Spaces cold start on first request)
4. Results should appear

Subsequent requests within a few minutes will be faster (~3-8 seconds).

## Updating the Service

When you push new code to the analysis service:

```bash
cd /path/to/orbitalquery-analysis
# Copy updated files from OrbitalQuery repo
cp -r /path/to/OrbitalQuery/analysis-service/* .
git add .
git commit -m "Update analysis service"
git push
```

Hugging Face will automatically rebuild and restart.

## Troubleshooting

**Build fails?**
→ Check the Logs tab for errors
→ Common issue: `requirements.txt` has incompatible versions
→ Try building locally first: `docker build -t test .`

**Service starts but /health returns 502?**
→ Check logs for import errors
→ The service might be OOM — HF Spaces free tier has 16GB, should be enough

**Cold starts still slow?**
→ HF Spaces free tier sleeps after ~48 hours of inactivity
→ First request after sleep takes ~10-15s (much better than Render's 60s)

**Want to prevent sleep?**
→ HF Spaces supports a "persistent" storage option on the paid tier
→ For free tier, the cold start is fast enough that it's not a major issue
