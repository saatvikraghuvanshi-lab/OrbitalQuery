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

# Cloud Run sets PORT=8080; start.sh ensures uvicorn uses it
RUN chmod +x start.sh
EXPOSE 8080

CMD ["./start.sh"]
