# Specification & Implementation Plan: Google Drive Sidebar Pinner

**Project Name**: GDrive Sidebar Pinner  
**Target Platform**: Google Chrome / Brave Browser (Manifest V3)  
**Location**: `/mnt/merged_ssd/google-drive-pin-folder-extension`

## 1. Executive Summary
The goal is to enhance the Google Drive PWA/Web interface by adding a native-feeling "Pinned Folders" section in the left sidebar. This solves the problem of deep navigation for frequently accessed folders by providing direct, one-click access regardless of the current view.

---

## 2. UIX Specification (The "Premium" Experience)

### 2.1 Sidebar Widget
- **Location**: Injected into the left navigation pane, specifically in the empty vertical space below "Starred" and above the "Spam/Bin/Storage" block.
- **Header**: A section header titled "PINNED" or "QUICK ACCESS", using the standard Google Drive sidebar typography (Material Design 3).
- **Items**:
    - Folder icon (matching Drive's current style).
    - Folder name (truncated if too long).
    - Hover State: Subtle background highlight and a small "unpin" (X) icon.
- **Animations**:
    - Smooth slide-down when a new folder is pinned.
    - Fade-out when unpinned.

### 2.2 Pinning Mechanism
- **Injection**: A "Pin" icon (outline of a pushpin) will be injected into the top header bar, next to the current folder name.
- **Visual Feedback**: The icon will "fill" when the folder is pinned.
- **Context Menu (Optional)**: Integration into the right-click menu on folders within the file list.

### 2.3 Aesthetics
- **Dark Mode**: Fully dynamic. It will read Drive's current CSS variables to ensure the background and text colors match perfectly.
- **Typography**: Uses `Google Sans` or the system-defined font used by Drive.
- **Consistency**: Padding, margins, and font sizes will be 1:1 with native sidebar items (e.g., "My Drive").

---

## 3. Technical Architecture

### 3.1 Persistence Layer
- **API**: `chrome.storage.sync`.
- **Logic**: All pinned folders are stored as an array of objects: `[{id: "folder_id", name: "Folder Name"}]`.
- **Benefit**: Your pinned folders will automatically sync to any other computer where you log into Brave/Chrome.

### 3.2 Content Script & DOM Injection
- **Target**: `https://drive.google.com/*`.
- **MutationObserver**: Since Google Drive is a Single Page App (SPA), the extension will use a `MutationObserver` to watch for DOM changes. This ensures the UI is re-injected if Google Drive re-renders its sidebar or header.
- **ID Stability**: Google Drive heavily obfuscates class names and rarely uses semantic data attributes. The script MUST target stable `aria-label` attributes (e.g., `[aria-label="Starred"]`) and structural relationships rather than brittle class names.

### 3.3 Styling & "The Cloning Trick"
- **Native Inheritance**: To guarantee 100% visual parity with Drive's Material 3 design, hover states, and dark mode, the extension will NOT attempt to recreate Google's CSS. Instead, it will use "The Cloning Trick":
    - Find an existing native sidebar item (like "Starred").
    - Clone its DOM node (`node.cloneNode(true)`).
    - Swap out the SVG path (for a folder icon), text content, and strip original click listeners to attach our own.
- **Style Isolation**: Any minor custom styles (like a visual separator or the header) will be prefixed (e.g., `.gdp-sidebar-block`).

---

## 4. Implementation Plan

### Phase 1: Foundation (Setup)
- [ ] Initialize `manifest.json` with appropriate permissions (`storage`, `activeTab`).
- [ ] Create basic `content.js` that logs "Extension Loaded" on Drive.

### Phase 2: UI Injection (The "Widget")
- [ ] Implement the logic to find the sidebar injection point using `aria-label` selectors.
- [ ] Implement "The Cloning Trick" to duplicate a native sidebar item (e.g., "Starred") instead of building an HTML template from scratch.
- [ ] Add a visual separator (e.g., a native-looking `<hr>`) to distinguish the pinned section.

### Phase 3: Pinning Logic
- [ ] Implement the "Pin" button injection into the header.
- [ ] Implement robust Folder ID extraction: Parse the current URL (`window.location.pathname`) instead of relying on the DOM.
- [ ] Extract the Folder Name from `document.title` or a stable DOM breadcrumb.
- [ ] Hook up `chrome.storage.sync` to save/load folders.
- [ ] Implement the navigation logic. Clicking a pinned folder MUST open it in a new tab (`window.open(url, '_blank')`). This ensures compatibility with installed PWAs configured as multi-tab apps.

### Phase 4: Polish & Performance
- [ ] Add micro-animations using CSS transitions.
- [ ] Optimize the `MutationObserver` to prevent excessive CPU usage (important for aarch64 SoC).
- [ ] Add "Clear All" or "Reorder" capabilities.
- [ ] Implement a global keyboard shortcut (e.g., `Ctrl+Shift+P`) via `manifest.json` commands to quickly pin/unpin the current folder.

---

## 5. Verification & Testing
- **Visual Audit**: Compare injected items side-by-side with native items to ensure 100% visual parity.
- **Navigation Stress Test**: Rapidly navigate between folders to ensure the "Pin" button updates correctly.
- **Cross-Profile Sync**: Verify that pinning a folder in one Brave profile reflects in another (if synced).

---

## 6. How to Install
1. Open Brave and go to `brave://extensions`.
2. Enable **Developer Mode** (top right).
3. Click **Load unpacked**.
4. Select the `/mnt/merged_ssd/google-drive-pin-folder-extension` directory.
