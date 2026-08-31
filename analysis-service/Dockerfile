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

# HuggingFace Spaces sets PORT env var; default to 8000 for local dev
ENV PORT=8000
EXPOSE 8000

# Run the FastAPI service — Cloud Run sets PORT=8080
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
