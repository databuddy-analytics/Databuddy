FROM timberio/vector:0.50.0-alpine

# Copy vector.yaml - supports both repo root and infra/ingest/ build contexts
# When building from repo root: docker build -f infra/ingest/vector.Dockerfile -t vector .
# When building from infra/ingest/: docker build -f vector.Dockerfile -t vector .
COPY infra/ingest/vector.yaml /etc/vector/vector.yaml

WORKDIR /etc/vector

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=10s \
    CMD ["vector", "validate", "/etc/vector/vector.yaml"]

CMD ["--config", "/etc/vector/vector.yaml"]