#!/usr/bin/env bash
# Cheapest Cloud Run deploy: scale-to-zero + capped autoscaling.
# Usage: ./deploy.sh  (requires gcloud CLI, authenticated, project set)
set -euo pipefail

SERVICE_NAME="stremio-addon"
REGION="${REGION:-us-central1}"   # us-central1 = cheapest tier
PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project)}"

echo ">> Project: $PROJECT_ID | Region: $REGION"

# Enable required APIs (no-op if already enabled)
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  --project "$PROJECT_ID"

# ── Deploy: cheapest autoscaling config ──────────────────────
#   min-instances=0   -> scales to ZERO when idle ($0 while not streaming)
#   max-instances=3   -> hard cost cap on burst scaling
#   1 vCPU / 512Mi    -> smallest instance tier
#   request-based CPU -> billed only while requests are active
#   timeout=3600      -> max allowed; needed for long video range requests
#   cpu-boost         -> faster cold starts at no extra charge
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 3 \
  --memory 512Mi \
  --cpu 1 \
  --concurrency 80 \
  --timeout 3600 \
  --cpu-boost

URL="$(gcloud run services describe "$SERVICE_NAME" \
  --project "$PROJECT_ID" --region "$REGION" \
  --format 'value(status.url)')"

# ── Second pass: inject the public URL so manifest/stream links are absolute ──
gcloud run services update "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --update-env-vars "RENDER_EXTERNAL_URL=${URL}"

echo ""
echo "Deployed: $URL"
echo "Manifest: $URL/manifest.json"
