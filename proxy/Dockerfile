FROM python:3.11-slim

# Install curl (used to fetch LinkedIn pages)
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY linkedin_proxy_server.py .

EXPOSE 9877

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -sf http://localhost:9877/health || exit 1

CMD ["python3", "linkedin_proxy_server.py", "9877"]
