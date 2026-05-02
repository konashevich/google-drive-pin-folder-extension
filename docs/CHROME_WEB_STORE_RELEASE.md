# Chrome Web Store Release Guide

This project is ready to upload through your existing Chrome Web Store developer account.

## 1. Before Upload

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked** and select this project folder.
4. Open Google Drive and test:
   - The Pinned section appears below Starred.
   - The Pin Folder button appears inside folders.
   - Pinning and unpinning works.
   - A colored Drive folder keeps the same color in the pinned list.
   - Pinned folders open in a new tab.
   - **Multi-Account Support:** Switching to another Google Drive account in the same browser profile shows that account's own pinned list.

## 2. Build The Upload ZIP

Run:

```bash
./scripts/package-webstore.sh
```

Upload the ZIP printed by the script, for example:

```text
dist/gdrive-sidebar-pinner-1.1.0.zip
```

Do not upload the whole repository ZIP. The Web Store package should contain only:

- `manifest.json`
- `content.js`
- `styles.css`
- `icons/icon16.png`
- `icons/icon48.png`
- `icons/icon128.png`
- `icons/icon.svg`

## 3. Store Listing Fields

> [!IMPORTANT]
> The actual text for the store listing (Name, Descriptions, etc.) is located in [STORE_LISTING.md](../STORE_LISTING.md). Use that file as your copy-paste source.

Recommended category: **Productivity**

Recommended language: **English**

Single purpose:

```text
Adds a pinned-folder section to Google Drive so users can quickly reopen frequently used folders.
```

## 4. Privacy And Permissions

Permission justification for `storage`:

```text
Used to save the user's pinned folder list, hashed active-account key, and locally cached folder icon colors.
```

Host permission / content script justification for `drive.google.com`:

```text
Required to add the pinned-folder UI to Google Drive and read the current Drive folder page state.
```

Data usage disclosure:

- The extension stores user-provided pinned folder IDs and names.
- The extension stores a hashed active-account key, or the visible Drive account slot as a fallback, so pinned folders stay separated between Google Drive accounts.
- The extension stores folder color metadata locally.
- The extension does not collect, sell, transmit, or share user data.
- The extension does not use remote code, analytics, or advertising.

Use `PRIVACY.md` as the public privacy policy text. If the Web Store requires a hosted URL, publish that file from your GitHub repository and paste the GitHub URL.

## 5. Screenshots and Video

Prepared screenshots are in `store_assets/`:

- `store-ready-screenshot-1.png` (High-priority: shows how to pin)
- `store-ready-screenshot-2.png` (High-priority: shows sidebar integration)
- `store-ready-screenshot-3.png` (Shows multi-tab productivity)
- `promo-small-440x280.png` (optional small promotional tile)

The Chrome Web Store accepts screenshots at 1280x800 or 640x400.

**Video:**
A demo video is available at `images/demo-video.mp4`. The Chrome Web Store requires videos to be hosted on YouTube. 
1. Upload the MP4 to YouTube.
2. Paste the YouTube URL into the **Promo video** field in the developer console.

## 6. Manual Upload Steps

1. Go to <https://chrome.google.com/webstore/devconsole>.
2. Select your existing developer account.
3. Click **New item**.
4. Upload the ZIP from `dist/`.
5. Fill in the store listing using **[STORE_LISTING.md](../STORE_LISTING.md)**.
6. Upload screenshots from `store_assets/`.
7. Complete the privacy practices form using the notes above.
8. Save draft.
9. Submit for review.

## 7. Version Updates Later

For future releases:

1. Update `version` in `manifest.json`.
2. Run `./scripts/package-webstore.sh`.
3. Upload the new ZIP to the existing Web Store item.
4. Add a short changelog in the Web Store release notes.

