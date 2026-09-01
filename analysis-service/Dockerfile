FROM python:3.11-slim

# System dependencies for rasterio, geopandas, etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ gfortran make libgomp1 libspatialindex-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# HF Spaces and Cloud Run both use PORT env var
# Default to 8080, start.sh reads PORT env
RUN chmod +x start.sh 2>/dev/null || true
EXPOSE 8080

# Use start.sh if it exists, otherwise direct uvicorn
CMD if [ -f start.sh ]; then ./start.sh; else python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}; fi
