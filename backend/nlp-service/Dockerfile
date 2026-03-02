FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install CPU-only PyTorch first (avoids pulling ~2.5GB of CUDA libraries)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Copy requirements first for caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN useradd -m -u 1000 app
USER app

# Pre-download ML models into the image to avoid startup delay,
# write conflicts on shared PVC, and HuggingFace rate limiting
# Downloads to /home/app/.cache/ instead of /root/.cache/
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"
RUN python -c "from detoxify import Detoxify; Detoxify('unbiased')"

# Copy application code
COPY app/ ./app/

# Copy prompt templates (editable YAML files)
COPY prompts/ ./prompts/

# Expose port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5001/health')" || exit 1

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5001"]
