# GDrive Sidebar Pinner

A premium, native-feeling Chrome/Brave extension that adds a "Pinned Folders" section to your Google Drive sidebar for high-speed navigation.

![Sidebar Screenshot](images/screenshot_sidebar.png)

## Features

- **Persistent Pinned Section**: Adds a dedicated "Pinned" widget right below your "Starred" section in the Google Drive sidebar.
- **Color Preservation**: Automatically detects and preserves your folder colors in the sidebar icons.
- **Multi-Tab Workflow**: Pinned folders open in new tabs by default, perfect for PWA users and power navigators.
- **Floating Action Button (FAB)**: A native-styled "Pin Folder" button appears when you are inside a directory.
- **SPA Resilient**: Built with a debounced MutationObserver to handle Google Drive's dynamic page updates without performance lag or UI flickering.
- **Sync Support**: Pins are synced across your devices via your Google account.

## Installation

1. Clone or download this repository.
2. Open Chrome/Brave and navigate to `chrome://extensions`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the project directory.

## Publishing to Web Store

To bundle the extension for production:

1. Ensure all icons (16, 48, 128) are present in the root directory.
2. Create a ZIP file of the repository (excluding `.git` and `images/` source files).
3. Upload to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

## Technical Details

- **Manifest V3**: Using the latest extension standards.
- **Storage**: Uses `chrome.storage.sync` for folder metadata and `chrome.storage.local` for color caching.
- **DOM Manipulation**: Custom-built UI elements (zero-cloning) to avoid event listener conflicts with Google Drive's internal React router.

---
*Created by Antigravity AI.*
