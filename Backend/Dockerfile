FROM python:3.13-slim

# Install uv from the official image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency files first for caching
COPY pyproject.toml uv.lock README.md ./

# Install exactly the versions in uv.lock (no dev tools) into /opt/venv; --frozen refuses to re-resolve.
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN uv sync --frozen --no-dev --no-install-project

# Copy application code
COPY . .

# Default command
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
