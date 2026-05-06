---
description: Chrome Web Store publishing instructions for GDrive Sidebar Pinner
applyTo: 'manifest.json,scripts/**,docs/**,.github/instructions/publish-extension.instructions.md'
---

# Publishing GDrive Sidebar Pinner

Use these instructions whenever the task is to release, update, publish, or check the Chrome Web Store status of this extension.

## Current Publishing Setup

The extension is already published on the Chrome Web Store. Future work is an update to the existing item, not an initial publication flow.

Known identifiers:

```text
Google Cloud project: chromium-466007
Chrome Web Store publisher ID: d7a941da-a849-4e7a-aca2-86ca562d724d
Chrome Web Store item ID: fnnhheoolpallbahcbafdfindgcdhoak
Service account: chrome-web-store-publisher@chromium-466007.iam.gserviceaccount.com
```

The Chrome Web Store API is enabled in Google Cloud. The service account has already been added to the Chrome Web Store Developer Dashboard publisher settings. API access was verified with `fetchStatus`.

Do not treat the OAuth consent screen or initial Web Store listing setup as the normal path. Those were only relevant while enabling API publishing.

## Important Safety Notes

- Never ask for or handle the user's Google password.
- If a browser asks for password verification, stop using that page and use an already authorized/shared browser context or the terminal API flow.
- Do not publish a package with the same version as the live Web Store item. Chrome Web Store updates require a version bump in `manifest.json`.
- Publishing through the API submits the item for review. It does not necessarily make the update live immediately.
- The live version remains unchanged until Google review completes.

## Normal Update Procedure

1. Check the current worktree:

```bash
git status --short
```

Understand whether there are unrelated user changes. Do not revert them.

2. Read the current manifest version:

```bash
node -p "require('./manifest.json').version"
```

3. Bump `version` in `manifest.json`.

Use a conservative patch bump unless the user requests otherwise. For example, `1.1.1` to `1.1.2`.

Also update version-specific examples in docs if present, especially `docs/CHROME_WEB_STORE_RELEASE.md`.

4. Validate scripts:

```bash
bash -n scripts/package-webstore.sh scripts/publish-webstore-api.sh
```

5. Build and inspect the Web Store ZIP:

```bash
./scripts/package-webstore.sh
VERSION="$(node -p "require('./manifest.json').version")"
unzip -l "dist/gdrive-sidebar-pinner-${VERSION}.zip"
```

The package should contain only:

```text
manifest.json
content.js
styles.css
icons/icon16.png
icons/icon48.png
icons/icon128.png
icons/icon.svg
```

6. Confirm API access before uploading:

```bash
CWS_STATUS_ONLY=1 ./scripts/publish-webstore-api.sh
```

Expected success includes the item path:

```text
publishers/d7a941da-a849-4e7a-aca2-86ca562d724d/items/fnnhheoolpallbahcbafdfindgcdhoak
```

7. Upload and submit for review:

```bash
CWS_PUBLISH_NOW=1 ./scripts/publish-webstore-api.sh
```

Expected upload success includes:

```text
"crxVersion": "<new version>"
"uploadState": "SUCCEEDED"
```

Expected publish/submit success includes:

```text
"state": "PENDING_REVIEW"
```

8. Confirm final status:

```bash
CWS_STATUS_ONLY=1 ./scripts/publish-webstore-api.sh
```

After a successful submission, expect the live version under `publishedItemRevisionStatus` and the newly submitted version under `submittedItemRevisionStatus`, for example:

```text
publishedItemRevisionStatus.state = PUBLISHED
publishedItemRevisionStatus.crxVersion = 1.1.0
submittedItemRevisionStatus.state = PENDING_REVIEW
submittedItemRevisionStatus.crxVersion = 1.1.1
```

Tell the user clearly that the update is submitted but not live until Google review completes.

## Existing Publish Script

Use `scripts/publish-webstore-api.sh`. It has the correct defaults:

```bash
CWS_PUBLISHER_ID="${CWS_PUBLISHER_ID:-d7a941da-a849-4e7a-aca2-86ca562d724d}"
CWS_EXTENSION_ID="${CWS_EXTENSION_ID:-fnnhheoolpallbahcbafdfindgcdhoak}"
CWS_SERVICE_ACCOUNT="${CWS_SERVICE_ACCOUNT:-chrome-web-store-publisher@chromium-466007.iam.gserviceaccount.com}"
```

Useful modes:

```bash
# Status only, no upload.
CWS_STATUS_ONLY=1 ./scripts/publish-webstore-api.sh

# Upload package, do not submit for review.
./scripts/publish-webstore-api.sh

# Upload package and submit for review/publish.
CWS_PUBLISH_NOW=1 ./scripts/publish-webstore-api.sh
```

The script obtains an access token through:

```bash
gcloud auth print-access-token \
  --impersonate-service-account=chrome-web-store-publisher@chromium-466007.iam.gserviceaccount.com \
  --scopes=https://www.googleapis.com/auth/chromewebstore
```

If this fails, inspect:

```bash
gcloud config list
gcloud auth list
gcloud services list --enabled --filter=chromewebstore.googleapis.com
```

The expected Google account is `konoshevich@gmail.com`, and the expected project is `chromium-466007`.

## Publishing Experience From 2026-05-06

What happened during the successful setup:

- The Web Store dashboard publisher URL exposed the publisher ID: `d7a941da-a849-4e7a-aca2-86ca562d724d`.
- The item list exposed the GDrive item ID: `fnnhheoolpallbahcbafdfindgcdhoak`.
- The service account was created in Google Cloud and added in Chrome Web Store Developer Dashboard settings.
- `fetchStatus` returned `HTTP_STATUS=200`, proving the service account could access the item.
- Version `1.1.1` was uploaded with `uploadState: SUCCEEDED`.
- The publish request returned `state: PENDING_REVIEW`.

The Chrome DevTools MCP connector expects a browser on `127.0.0.1:9222`. If the shared IDE browser is not directly available to the agent, the terminal API flow is enough for future updates. Browser access should only be needed for unusual dashboard troubleshooting.

## Manual Fallback

If the API is unavailable, use the existing item in the Chrome Web Store Developer Dashboard:

```text
https://chrome.google.com/webstore/devconsole/d7a941da-a849-4e7a-aca2-86ca562d724d/fnnhheoolpallbahcbafdfindgcdhoak/edit
```

Manual fallback steps:

1. Build the ZIP with `./scripts/package-webstore.sh`.
2. Open the existing GDrive Sidebar Pinner item.
3. Upload the ZIP from `dist/`.
4. Add release notes.
5. Submit for review.

Prefer the API script whenever possible.
