#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CWS_PUBLISHER_ID="${CWS_PUBLISHER_ID:-d7a941da-a849-4e7a-aca2-86ca562d724d}"
CWS_EXTENSION_ID="${CWS_EXTENSION_ID:-fnnhheoolpallbahcbafdfindgcdhoak}"
CWS_SERVICE_ACCOUNT="${CWS_SERVICE_ACCOUNT:-chrome-web-store-publisher@chromium-466007.iam.gserviceaccount.com}"
CWS_SCOPE="https://www.googleapis.com/auth/chromewebstore"

TOKEN="$(gcloud auth print-access-token \
    --impersonate-service-account="$CWS_SERVICE_ACCOUNT" \
    --scopes="$CWS_SCOPE" 2>/dev/null)"

UPLOAD_URL="https://chromewebstore.googleapis.com/upload/v2/publishers/${CWS_PUBLISHER_ID}/items/${CWS_EXTENSION_ID}:upload"
STATUS_URL="https://chromewebstore.googleapis.com/v2/publishers/${CWS_PUBLISHER_ID}/items/${CWS_EXTENSION_ID}:fetchStatus"
PUBLISH_URL="https://chromewebstore.googleapis.com/v2/publishers/${CWS_PUBLISHER_ID}/items/${CWS_EXTENSION_ID}:publish"

if [[ "${CWS_STATUS_ONLY:-0}" == "1" ]]; then
    curl --silent --show-error --fail-with-body \
        -H "Authorization: Bearer $TOKEN" \
        -X GET \
        "$STATUS_URL"
    echo
    exit 0
fi

PACKAGE="$("$ROOT_DIR/scripts/package-webstore.sh")"

echo "Uploading $PACKAGE"
curl --silent --show-error --fail-with-body \
    -H "Authorization: Bearer $TOKEN" \
    -X POST \
    -T "$PACKAGE" \
    "$UPLOAD_URL"
echo

echo "Fetch status:"
curl --silent --show-error --fail-with-body \
    -H "Authorization: Bearer $TOKEN" \
    -X GET \
    "$STATUS_URL"
echo

if [[ "${CWS_PUBLISH_NOW:-0}" == "1" ]]; then
    echo "Submitting item for review/publish:"
    curl --silent --show-error --fail-with-body \
        -H "Authorization: Bearer $TOKEN" \
        -X POST \
        "$PUBLISH_URL"
    echo
else
    echo "Upload complete. Set CWS_PUBLISH_NOW=1 to also submit for review/publish."
fi
