// content.js — GDrive Sidebar Pinner
// Zero cloning. All custom HTML. Observer pauses during DOM writes.

(function () {
    'use strict';

    console.log('GDrive Sidebar Pinner: Extension Loaded');

    let pinnedFolders = [];
    let pinnedFoldersByAccount = {};
    let legacyPinnedFolders = [];
    let currentAccountKey = '';
    let currentDriveUserSlot = '0';
    let isUpdating = false; // guard to prevent observer re-entry
    let colorCacheReady = false;
    let pinsReady = false;
    let folderColorCache = {}; // folderId -> hex color

    // Load both caches before first render to avoid race conditions
    chrome.storage.local.get(['folderColors'], (result) => {
        folderColorCache = result.folderColors || {};
        colorCacheReady = true;
        if (pinsReady) runUpdate();
    });

    chrome.storage.sync.get(['pinnedFolders', 'pinnedFoldersByAccount'], (result) => {
        legacyPinnedFolders = Array.isArray(result.pinnedFolders) ? result.pinnedFolders : [];
        pinnedFoldersByAccount = isPlainObject(result.pinnedFoldersByAccount) ? result.pinnedFoldersByAccount : {};
        refreshAccountState({ migrateLegacyPins: true });
        pinsReady = true;
        if (colorCacheReady) runUpdate();
    });

    // Listen for storage changes (e.g. from another tab)
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (changes.pinnedFolders) {
            legacyPinnedFolders = Array.isArray(changes.pinnedFolders.newValue) ? changes.pinnedFolders.newValue : [];
            refreshAccountState({ migrateLegacyPins: true });
            renderPinnedList();
        }
        if (changes.pinnedFoldersByAccount) {
            pinnedFoldersByAccount = isPlainObject(changes.pinnedFoldersByAccount.newValue)
                ? changes.pinnedFoldersByAccount.newValue
                : {};
            refreshAccountState();
            renderPinnedList();
        }
        if (areaName === 'local' && changes.folderColors) {
            folderColorCache = changes.folderColors.newValue || {};
            lastRendered = '';
            renderPinnedList();
        }
    });

    // MutationObserver — debounced to coalesce Drive's rapid DOM rebuilds
    let mutationTimer = null;
    const observer = new MutationObserver(() => {
        if (isUpdating) return; // skip mutations caused by our own DOM writes
        clearTimeout(mutationTimer);
        mutationTimer = setTimeout(runUpdate, 200);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('pointerdown', cacheFolderColorFromDriveEvent, true);
    document.addEventListener('click', cacheFolderColorFromDriveEvent, true);

    // Also poll on SPA navigation (URL changes without page reload)
    let lastUrl = location.href;
    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            runUpdate();
        }
    }, 500);

    function runUpdate() {
        if (!pinsReady || !colorCacheReady) return;
        if (isUpdating) return;
        isUpdating = true;
        try {
            refreshAccountState();
            scanAndCacheColors(); // scan file list for folder icon colors
            ensureWidgetExists();
            ensureFabExists();
            syncDriveTheme();
        } finally {
            // Release guard after a tick so the observer ignores our mutations
            setTimeout(() => { isUpdating = false; }, 50);
        }
    }

    function cacheFolderColorFromDriveEvent(event) {
        if (!pinsReady || !colorCacheReady) return;

        const item = event.target?.closest?.('[data-id]');
        if (!item || item.closest('#gdp-widget, #gdp-fab')) return;

        const folderId = item.getAttribute('data-id');
        if (!folderId || folderId.length < 10) return;

        const hex = readFolderColorFromDriveItem(item);
        if (!hex || getCachedFolderColor(folderId) === hex) return;

        setCachedFolderColor(folderId, hex);
        chrome.storage.local.set({ folderColors: folderColorCache });
        lastRendered = '';
        renderPinnedList();
    }

    // ──────────────────────────────────────────────
    // SIDEBAR WIDGET
    // ──────────────────────────────────────────────

    function findInsertionAnchor() {
        // Google Drive sidebar items are div[role="link"] with class "a-U-J"
        // containing a span with text "Starred".
        // Search the whole body since there's no reliable role="navigation" wrapper.
        const allSpans = document.querySelectorAll('span');
        for (const span of allSpans) {
            if (span.children.length === 0 && span.textContent.trim() === 'Starred') {
                // Walk up to the sidebar row container (div.a-U-J with role="link")
                let row = span;
                while (row.parentElement) {
                    row = row.parentElement;
                    if (row.getAttribute('role') === 'link' || row.classList.contains('a-U-J')) {
                        return row;
                    }
                    // Safety: don't walk past body
                    if (row === document.body) break;
                }
                // Fallback: return the deepest meaningful parent
                return span.parentElement;
            }
        }
        return null;
    }

    function ensureWidgetExists() {
        if (document.getElementById('gdp-widget')) {
            renderPinnedList();
            return;
        }

        const anchor = findInsertionAnchor();
        if (!anchor || !anchor.parentNode) return;

        const widget = document.createElement('div');
        widget.id = 'gdp-widget';

        // Header
        const header = document.createElement('div');
        header.className = 'gdp-header';
        header.innerHTML = `
            <span class="gdp-header-icon"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z" fill="currentColor"/></svg></span>
            <span class="gdp-header-label">Pinned</span>
        `;

        // List
        const list = document.createElement('div');
        list.id = 'gdp-list';

        // Separator
        const hr = document.createElement('hr');
        hr.className = 'gdp-separator';

        widget.appendChild(header);
        widget.appendChild(list);
        widget.appendChild(hr);

        anchor.parentNode.insertBefore(widget, anchor.nextSibling);
        lastRendered = ''; // Force re-render since we just created a fresh container
        renderPinnedList();
    }

    let lastRendered = '';
    function renderPinnedList() {
        const list = document.getElementById('gdp-list');
        if (!list) return;

        // Include cache state in dedup key so colors update when cache refreshes
        const cacheKey = JSON.stringify(folderColorCache);
        const stateKey = currentAccountKey + JSON.stringify(pinnedFolders) + cacheKey;
        if (stateKey === lastRendered) return;
        lastRendered = stateKey;

        list.innerHTML = '';

        if (pinnedFolders.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'gdp-empty';
            empty.textContent = 'No pinned folders';
            list.appendChild(empty);
            return;
        }

        pinnedFolders.forEach((folder) => {
            const link = document.createElement('a');
            link.href = buildDriveFolderUrl(folder.id);
            link.target = '_blank';
            link.rel = 'noopener';
            link.className = 'gdp-folder-link';

            // Always prefer live cache color over stored value (cache is fresher)
            const iconColor = normalizeHex(getCachedFolderColor(folder.id)) || normalizeHex(folder.color || '') || '#9aa0a6';

            link.innerHTML = `
                <span class="gdp-folder-icon" style="color: ${iconColor}"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" fill="currentColor"/></svg></span>
                <span class="gdp-folder-name">${folder.name}</span>
            `;

            list.appendChild(link);
        });
    }

    function getCurrentFolderInfo() {
        const info = readCurrentFolderBaseInfo();
        if (!info) return null;

        return {
            ...info,
            color: getCachedFolderColor(info.id) || findCurrentFolderColorOnPage(info) || null,
        };
    }

    function readCurrentFolderBaseInfo() {
        const path = window.location.pathname;
        if (!path.includes('/folders/')) return null;

        const segments = path.split('/');
        const id = segments[segments.length - 1];
        if (!id || id.length < 10) return null;

        let name = document.title || '';
        name = name.replace(/\s*-\s*Google Drive\s*/gi, '').trim();
        name = name.replace(/^Google Drive\s*-\s*/i, '').trim();
        if (!name) name = 'Unnamed Folder';

        return { id, name };
    }

    function refreshAccountState(options = {}) {
        const previousKey = currentAccountKey;
        currentDriveUserSlot = getCurrentDriveUserSlot();
        currentAccountKey = detectCurrentDriveAccountKey();

        maybeMigrateSlotPinsToAccount(previousKey, currentAccountKey);

        if (options.migrateLegacyPins) {
            maybeMigrateLegacyPinsToCurrentAccount();
        }

        pinnedFolders = getPinsForCurrentAccount();

        if (previousKey && previousKey !== currentAccountKey) {
            lastRendered = '';
            renderPinnedList();
            updateFabLabel();
        }
    }

    function maybeMigrateLegacyPinsToCurrentAccount() {
        if (!legacyPinnedFolders.length || !currentAccountKey) return;
        if (Array.isArray(pinnedFoldersByAccount[currentAccountKey]) && pinnedFoldersByAccount[currentAccountKey].length) return;

        pinnedFoldersByAccount = {
            ...pinnedFoldersByAccount,
            [currentAccountKey]: legacyPinnedFolders,
        };
        legacyPinnedFolders = [];

        chrome.storage.sync.set({ pinnedFoldersByAccount }, () => {
            chrome.storage.sync.remove('pinnedFolders');
        });
    }

    function maybeMigrateSlotPinsToAccount(previousKey, nextKey) {
        if (!previousKey || previousKey === nextKey) return;
        if (!previousKey.startsWith('slot:') || !nextKey.startsWith('acct:')) return;
        if (!Array.isArray(pinnedFoldersByAccount[previousKey]) || !pinnedFoldersByAccount[previousKey].length) return;
        if (Array.isArray(pinnedFoldersByAccount[nextKey]) && pinnedFoldersByAccount[nextKey].length) return;

        pinnedFoldersByAccount = {
            ...pinnedFoldersByAccount,
            [nextKey]: pinnedFoldersByAccount[previousKey],
        };
        chrome.storage.sync.set({ pinnedFoldersByAccount });
    }

    function getPinsForCurrentAccount() {
        if (!currentAccountKey) return [];
        const pins = pinnedFoldersByAccount[currentAccountKey];
        return Array.isArray(pins) ? [...pins] : [];
    }

    function savePinsForCurrentAccount(nextPins, callback) {
        if (!currentAccountKey) return;

        pinnedFolders = [...nextPins];
        pinnedFoldersByAccount = {
            ...pinnedFoldersByAccount,
            [currentAccountKey]: pinnedFolders,
        };

        chrome.storage.sync.set({ pinnedFoldersByAccount }, callback);
    }

    function detectCurrentDriveAccountKey() {
        const email = detectCurrentDriveEmail();
        if (email) return `acct:${hashAccountIdentifier(email.toLowerCase())}`;
        return `slot:${currentDriveUserSlot || '0'}`;
    }

    function detectCurrentDriveEmail() {
        const accountSelectors = [
            '[aria-label^="Google Account"]',
            '[aria-label*="Google Account:"]',
            '[aria-label*="Google Account"]',
            'a[href*="SignOutOptions"][aria-label]',
        ];

        for (const selector of accountSelectors) {
            for (const el of document.querySelectorAll(selector)) {
                const email = extractEmail(el.getAttribute('aria-label') || '');
                if (email) return email;
            }
        }

        return null;
    }

    function extractEmail(text) {
        const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        return match ? match[0].toLowerCase() : null;
    }

    function hashAccountIdentifier(value) {
        let hash = 0x811c9dc5;
        for (let i = 0; i < value.length; i += 1) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    function getCurrentDriveUserSlot() {
        const match = location.pathname.match(/\/drive\/u\/(\d+)(?:\/|$)/);
        return match ? match[1] : '0';
    }

    function buildDriveFolderUrl(folderId) {
        const encodedId = encodeURIComponent(folderId);
        return `https://drive.google.com/drive/u/${currentDriveUserSlot || '0'}/folders/${encodedId}`;
    }

    function isPlainObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }

    // Google Drive color name → hex mapping (all 24 Drive colors)
    const GDRIVE_COLOR_MAP = {
        'wild strawberries': '#d93025',
        'fire engine': '#e8453c',
        'old red brick': '#b31412',
        'mars orange': '#fa903e',
        'orange juice': '#fa903e',
        'autumn leaves': '#f4511e',
        'yellow cab': '#f9cb55',
        'custard': '#f9cb55',
        'spearmint': '#0b8043',
        'spring meadow': '#16a765',
        'green': '#16a765',
        'asparagus': '#689f38',
        'slime green': '#a1c935',
        'blueberries': '#4285f4',
        'denim': '#3c78d8',
        'blue': '#4285f4',
        'pool': '#4ecde6',
        'sea foam': '#009688',
        'teal': '#009688',
        'bubble gum': '#f06292',
        'pink': '#f06292',
        'purple rain': '#9c27b0',
        'purple': '#9c27b0',
        'baked aubergine': '#795548',
        'orchid': '#ab47bc',
        'rainy sky': '#9aa0a6',
        'mouse': '#78909c',
        'grey': '#78909c',
        'mountain grey': '#a3a3a3',
        'earthworm': '#8d6e63',
        'brown': '#8d6e63',
    };

    const COMMON_UI_COLORS = new Set([
        '#000000', '#ffffff', '#e8eaed', '#c4c7c5', '#9aa0a6',
        '#80868b', '#5f6368', '#444746', '#3c4043', '#202124',
        '#1f1f1f', '#131314',
    ]);

    const DRIVE_FOLDER_COLOR_HEXES = new Set(Object.values(GDRIVE_COLOR_MAP));

    // Scan for folder colors from the visible file list first, then fall back
    // to the details panel's color-name aria-label when it happens to be open.
    function scanAndCacheColors() {
        let updated = false;

        if (scanCurrentFolderForColor()) {
            updated = true;
        }

        if (scanVisibleFolderRowsForColors()) {
            updated = true;
        }

        if (scanVisiblePinnedFoldersForColors()) {
            updated = true;
        }

        if (scanAriaLabelFolderColors()) {
            updated = true;
        }

        if (updated) {
            chrome.storage.local.set({ folderColors: folderColorCache });
            lastRendered = ''; // force color refresh in our sidebar
            renderPinnedList();
        }
    }

    function scanVisibleFolderRowsForColors() {
        const rows = document.querySelectorAll('[data-id]');
        let updated = false;

        for (const row of rows) {
            const folderId = row.getAttribute('data-id');
            if (!folderId || folderId.length < 10) continue;

            const hex = readFolderColorFromDriveItem(row);
            if (!hex || getCachedFolderColor(folderId) === hex) continue;

            setCachedFolderColor(folderId, hex);
            updated = true;
        }

        return updated;
    }

    function scanCurrentFolderForColor() {
        const info = readCurrentFolderBaseInfo();
        if (!info) return false;

        const hex = findCurrentFolderColorOnPage(info);
        if (!hex || getCachedFolderColor(info.id) === hex) return false;

        setCachedFolderColor(info.id, hex);
        return true;
    }

    function scanVisiblePinnedFoldersForColors() {
        let updated = false;

        for (const folder of pinnedFolders) {
            if (!folder?.id || !folder?.name) continue;

            const hex = findVisibleFolderColorForPinnedFolder(folder);
            if (!hex || getCachedFolderColor(folder.id) === hex) continue;

            setCachedFolderColor(folder.id, hex);
            updated = true;
        }

        return updated;
    }

    function findVisibleFolderColorForPinnedFolder(folder) {
        for (const row of document.querySelectorAll('[data-id]')) {
            if (row.getAttribute('data-id') !== folder.id) continue;

            const hex = readFolderColorFromDriveItem(row);
            if (hex) return hex;
        }

        const matchingRows = [];
        for (const row of getVisibleDriveItemRoots()) {
            if (!driveItemNameMatches(row, folder.name)) continue;

            const hex = readFolderColorFromRow(row);
            if (hex) matchingRows.push(hex);
        }

        const uniqueMatches = [...new Set(matchingRows)];
        return uniqueMatches.length === 1 ? uniqueMatches[0] : null;
    }

    function getVisibleDriveItemRoots() {
        const roots = new Set();

        for (const item of document.querySelectorAll('[data-id]')) {
            for (const root of getDriveItemColorRoots(item)) {
                roots.add(root);
            }
        }

        return [...roots];
    }

    function readFolderColorFromDriveItem(item) {
        for (const root of getDriveItemColorRoots(item)) {
            const hex = readFolderColorFromRow(root);
            if (hex) return hex;
        }

        return null;
    }

    function getDriveItemColorRoots(item) {
        const roots = [];
        let el = item;

        while (el && el !== document.body && roots.length < 8) {
            const nestedItems = el.querySelectorAll?.('[data-id]') || [];
            if (el !== item && nestedItems.length > 1) break;

            roots.push(el);

            if (el.getAttribute?.('role') === 'row' || el.tagName?.toLowerCase() === 'tr') break;

            el = el.parentElement;
        }

        return roots;
    }

    function readFolderColorFromRow(row) {
        const rowRect = safeRect(row);
        const candidates = [];
        const elements = [row, ...row.querySelectorAll('*')];

        for (const el of elements) {
            const style = getComputedStyle(el);
            const maskImage = style.maskImage || style.webkitMaskImage || '';
            const hasMask = maskImage && maskImage !== 'none';
            const tagName = el.tagName.toLowerCase();
            const rect = safeRect(el);

            if (!hasMask && !isVisibleRect(rect)) continue;

            const iconScore = scoreIconCandidate(el, rect, rowRect, hasMask);
            if (iconScore <= 0) continue;

            addColorCandidate(candidates, style.backgroundColor, iconScore + (hasMask ? 120 : 0));

            if (tagName === 'svg' || tagName === 'path' || el.querySelector('svg')) {
                addColorCandidate(candidates, style.fill, iconScore + 50);
                addColorCandidate(candidates, style.color, iconScore + 40);
            }

            if (hasMask || looksLikeFolderIconElement(el)) {
                addColorCandidate(candidates, style.color, iconScore + 20);
            }
        }

        candidates.sort((a, b) => b.score - a.score);
        return candidates[0]?.hex || null;
    }

    function findCurrentFolderColorOnPage(info) {
        return findCurrentFolderColorFromAriaLabels(info)
            || findCurrentFolderColorNearName(info)
            || null;
    }

    function findCurrentFolderColorFromAriaLabels(info) {
        const matches = [];

        for (const el of document.querySelectorAll('[aria-label]')) {
            if (el.closest('#gdp-widget, #gdp-fab')) continue;
            if (el.closest('[data-id]')) continue;
            if (!isElementVisibleForScan(el)) continue;

            const hex = parseDriveFolderColorLabel(el.getAttribute('aria-label') || '');
            if (!hex) continue;

            if (isElementNearFolderName(el, info.name)) return hex;
            matches.push(hex);
        }

        const uniqueMatches = [...new Set(matches)];
        return uniqueMatches.length === 1 ? uniqueMatches[0] : null;
    }

    function findCurrentFolderColorNearName(info) {
        const matches = [];

        for (const el of document.querySelectorAll('h1,h2,h3,span,div,[data-tooltip],[aria-label]')) {
            if (el.closest('#gdp-widget, #gdp-fab')) continue;
            if (!elementReferencesFolderName(el, info.name)) continue;

            for (const root of getNameColorSearchRoots(el)) {
                const hex = readFolderColorFromRow(root);
                if (hex) matches.push(hex);
            }
        }

        const uniqueMatches = [...new Set(matches)];
        return uniqueMatches.length === 1 ? uniqueMatches[0] : null;
    }

    function getNameColorSearchRoots(el) {
        const roots = [];
        let node = el;

        while (node && node !== document.body && roots.length < 6) {
            roots.push(node);
            if (node.getAttribute?.('role') === 'heading') break;
            if (node.getAttribute?.('role') === 'row') break;
            node = node.parentElement;
        }

        return roots;
    }

    function isElementNearFolderName(el, folderName) {
        return elementReferencesFolderName(el, folderName)
            || getNameColorSearchRoots(el).some((root) => elementReferencesFolderName(root, folderName));
    }

    function elementReferencesFolderName(el, folderName) {
        const expected = normalizeDriveItemName(folderName);
        if (!expected) return false;

        const text = normalizeDriveItemName(el.textContent);
        if (text === expected) return true;
        if (text.length <= expected.length + 40 && text.includes(expected)) return true;

        const attributeValues = [
            el.getAttribute?.('aria-label'),
            el.getAttribute?.('data-tooltip'),
            el.getAttribute?.('data-tooltip-unhoverable'),
        ].map(normalizeDriveItemName);

        return attributeValues.some((value) => value === expected || value.includes(expected));
    }

    function driveItemNameMatches(row, expectedName) {
        const normalizedExpected = normalizeDriveItemName(expectedName);
        if (!normalizedExpected) return false;

        for (const candidate of readDriveItemNameCandidates(row)) {
            if (normalizeDriveItemName(candidate) === normalizedExpected) return true;
        }

        return false;
    }

    function readDriveItemNameCandidates(row) {
        const candidates = [];
        const nameSelectors = [
            '.KL4NAf',
            '[data-tooltip]',
            '[aria-label]',
        ];

        const elements = [row, ...row.querySelectorAll(nameSelectors.join(','))];
        for (const el of elements) {
            candidates.push(el.textContent);
            candidates.push(el.getAttribute('data-tooltip'));
            candidates.push(el.getAttribute('aria-label'));
        }

        return candidates.filter(Boolean);
    }

    function normalizeDriveItemName(name) {
        return String(name || '').replace(/\s+/g, ' ').trim();
    }

    function getCachedFolderColor(folderId) {
        if (!folderId) return null;
        return folderColorCache[getFolderColorCacheKey(folderId)] || folderColorCache[folderId] || null;
    }

    function setCachedFolderColor(folderId, hex) {
        if (!folderId || !hex) return;
        folderColorCache[getFolderColorCacheKey(folderId)] = hex;
    }

    function getFolderColorCacheKey(folderId) {
        return currentAccountKey ? `${currentAccountKey}:${folderId}` : folderId;
    }

    function scanAriaLabelFolderColors() {
        const elements = document.querySelectorAll('[aria-label]');
        if (elements.length === 0) return false;

        let updated = false;
        const currentFolder = readCurrentFolderBaseInfo();
        for (const el of elements) {
            if (!isElementVisibleForScan(el)) continue;

            const label = el.getAttribute('aria-label') || '';
            const hex = parseDriveFolderColorLabel(label);
            if (!hex) continue;

            // Try to find folder ID from multiple sources:
            // 1. Closest data-id (file list rows)
            const row = el.closest('[data-id]');
            if (row) {
                const folderId = row.getAttribute('data-id');
                if (folderId && folderId.length >= 10 && getCachedFolderColor(folderId) !== hex) {
                    setCachedFolderColor(folderId, hex);
                    updated = true;
                }
                continue;
            }

            if (currentFolder && isElementNearFolderName(el, currentFolder.name)) {
                if (getCachedFolderColor(currentFolder.id) !== hex) {
                    setCachedFolderColor(currentFolder.id, hex);
                    updated = true;
                }
                continue;
            }

            // 2. Details panel — extract folder name, then match from URL or page title
            //    Also try to extract from the header text next to the icon
            const headerParent = el.closest('.a-Mg-V-j, [role="link"], h2')?.parentElement;
            const headerText = headerParent?.querySelector('div')?.textContent?.trim();

            // 3. Try the breadcrumb/title folder name match
            //    Look for nearby folder name text and match to data-id in the file list
            if (headerText) {
                const allRows = document.querySelectorAll('[data-id]');
                for (const r of allRows) {
                    const nameEl = r.querySelector('.KL4NAf');
                    if (nameEl && nameEl.textContent.trim() === headerText) {
                        const fId = r.getAttribute('data-id');
                        if (fId && fId.length >= 10 && getCachedFolderColor(fId) !== hex) {
                            setCachedFolderColor(fId, hex);
                            updated = true;
                        }
                    }
                }
            }
        }

        return updated;
    }

    function parseDriveFolderColorLabel(label) {
        const normalizedLabel = normalizeDriveItemName(label)
            .replace(/["'\u201C\u201D\u2018\u2019]/g, '')
            .toLowerCase();

        if (!normalizedLabel.includes('folder')) return null;

        const colorNames = Object.keys(GDRIVE_COLOR_MAP).sort((a, b) => b.length - a.length);
        for (const colorName of colorNames) {
            const escapedName = escapeRegExp(colorName);
            const patterns = [
                new RegExp(`\\b(?:with\\s+)?colou?r\\s*:?\\s*${escapedName}\\b`, 'i'),
                new RegExp(`\\b${escapedName}\\s+folder\\b`, 'i'),
                new RegExp(`\\bfolder\\s+${escapedName}\\b`, 'i'),
            ];

            if (patterns.some((pattern) => pattern.test(normalizedLabel))) {
                return GDRIVE_COLOR_MAP[colorName];
            }
        }

        return null;
    }

    function escapeRegExp(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function scoreIconCandidate(el, rect, rowRect, hasMask) {
        let score = 0;

        if (hasMask) score += 120;
        if (looksLikeFolderIconElement(el)) score += 80;
        if (rowRect && rect && rect.left <= rowRect.left + 160) score += 50;
        if (rect && rect.width >= 12 && rect.width <= 64 && rect.height >= 12 && rect.height <= 64) score += 35;
        if (el.closest('#gdp-widget, #gdp-fab')) score -= 300;

        return score;
    }

    function looksLikeFolderIconElement(el) {
        const text = [
            el.getAttribute('aria-label'),
            el.getAttribute('data-tooltip'),
            el.getAttribute('data-tooltip-unhoverable'),
            el.className?.toString(),
        ].filter(Boolean).join(' ').toLowerCase();

        return text.includes('folder') || text.includes('l-o-c-qd');
    }

    function addColorCandidate(candidates, cssColor, score) {
        const hex = cssColorToHex(cssColor);
        if (!hex || !isUsefulFolderColor(hex)) return;

        candidates.push({ hex, score: score + folderColorSpecificity(hex) });
    }

    function folderColorSpecificity(hex) {
        if (DRIVE_FOLDER_COLOR_HEXES.has(hex)) return 40;
        const rgb = hexToRgb(hex);
        if (!rgb) return 0;
        return Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
    }

    function isUsefulFolderColor(hex) {
        if (!hex || COMMON_UI_COLORS.has(hex)) return false;
        if (DRIVE_FOLDER_COLOR_HEXES.has(hex)) return true;

        const rgb = hexToRgb(hex);
        if (!rgb) return false;

        const chroma = Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
        const brightness = (rgb.r + rgb.g + rgb.b) / 3;
        return chroma >= 32 && brightness >= 35 && brightness <= 235;
    }

    function safeRect(el) {
        try {
            return el.getBoundingClientRect();
        } catch {
            return null;
        }
    }

    function isVisibleRect(rect) {
        return rect && rect.width > 0 && rect.height > 0;
    }

    function isElementVisibleForScan(el) {
        const rect = safeRect(el);
        if (!isVisibleRect(rect)) return false;

        const style = getComputedStyle(el);
        return style.display !== 'none'
            && style.visibility !== 'hidden'
            && style.opacity !== '0';
    }

    function cssColorToHex(cssColor) {
        if (!cssColor || cssColor === 'none' || cssColor === 'transparent' || cssColor === 'currentColor') {
            return null;
        }

        if (cssColor.startsWith('#')) {
            return normalizeHex(cssColor);
        }

        const match = cssColor.match(/rgba?\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)(?:\s*[,/]\s*(\d+(?:\.\d+)?))?\s*\)/i);
        if (!match) return null;

        const alpha = match[4] === undefined ? 1 : Number(match[4]);
        if (Number.isFinite(alpha) && alpha <= 0.05) return null;

        return rgbToHex(Number(match[1]), Number(match[2]), Number(match[3]));
    }

    function normalizeHex(hex) {
        const value = hex.trim().toLowerCase();
        if (/^#[0-9a-f]{6}$/.test(value)) return value;
        if (/^#[0-9a-f]{3}$/.test(value)) {
            return '#' + value.slice(1).split('').map((char) => char + char).join('');
        }
        return null;
    }

    function rgbToHex(r, g, b) {
        return '#' + [r, g, b]
            .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0'))
            .join('');
    }

    function hexToRgb(hex) {
        const normalized = normalizeHex(hex);
        if (!normalized) return null;

        return {
            r: parseInt(normalized.slice(1, 3), 16),
            g: parseInt(normalized.slice(3, 5), 16),
            b: parseInt(normalized.slice(5, 7), 16),
        };
    }

    function ensureFabExists() {
        const folderInfo = getCurrentFolderInfo();
        let fab = document.getElementById('gdp-fab');

        if (!folderInfo) {
            if (fab) fab.style.display = 'none';
            return;
        }

        if (!fab) {
            fab = document.createElement('button');
            fab.id = 'gdp-fab';
            fab.className = 'gdp-fab';
            fab.addEventListener('click', onFabClick);
            document.body.appendChild(fab);
        }

        fab.style.display = 'flex';
        updateFabLabel();
    }

    function updateFabLabel() {
        const fab = document.getElementById('gdp-fab');
        if (!fab) return;

        const info = getCurrentFolderInfo();
        if (!info) return;

        const isPinned = pinnedFolders.some((f) => f.id === info.id);

        if (isPinned) {
            fab.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z"/></svg><span>Unpin</span>`;
            fab.classList.add('is-pinned');
        } else {
            fab.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12M8.8,14L10,12.8V4H14V12.8L15.2,14H8.8Z"/></svg><span>Pin Folder</span>`;
            fab.classList.remove('is-pinned');
        }
    }

    function onFabClick() {
        refreshAccountState();
        scanAndCacheColors();

        let info = getCurrentFolderInfo();
        if (!info) return;

        const nextPins = [...pinnedFolders];
        const idx = nextPins.findIndex((f) => f.id === info.id);
        if (idx > -1) {
            nextPins.splice(idx, 1);
        } else {
            const color = getCachedFolderColor(info.id) || findCurrentFolderColorOnPage(info) || info.color || null;
            if (color) {
                setCachedFolderColor(info.id, color);
                chrome.storage.local.set({ folderColors: folderColorCache });
                info = { ...info, color };
            }
            nextPins.push(info);
        }

        savePinsForCurrentAccount(nextPins, () => {
            updateFabLabel();
            lastRendered = ''; // force re-render
            renderPinnedList();
        });
    }

    // ──────────────────────────────────────────────
    // THEME COLOR FIX (PWA Header)
    // ──────────────────────────────────────────────

    function syncDriveTheme() {
        const theme = detectDriveTheme();
        document.documentElement.classList.toggle('gdp-theme-dark', theme === 'dark');
        document.documentElement.classList.toggle('gdp-theme-light', theme === 'light');

        // Find or create the theme-color meta tag
        let meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'theme-color';
            document.head.appendChild(meta);
        }

        const themeColor = theme === 'dark' ? '#131314' : '#f8fafd';
        
        // Only update if it's different to avoid unnecessary DOM noise
        if (meta.getAttribute('content') !== themeColor) {
            meta.setAttribute('content', themeColor);
        }
    }

    function detectDriveTheme() {
        const colorScheme = getComputedStyle(document.documentElement).colorScheme;
        const background = findDriveBackgroundColor();

        if (background) {
            return getRelativeLuminance(background) < 0.45 ? 'dark' : 'light';
        }

        if (colorScheme && colorScheme.includes('dark') && !colorScheme.includes('light')) {
            return 'dark';
        }

        if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }

        return 'light';
    }

    function findDriveBackgroundColor() {
        const candidates = [
            document.body,
            document.documentElement,
            document.querySelector('[role="navigation"]'),
            document.querySelector('div[role="main"]'),
            document.querySelector('.a-U-J')?.parentElement,
        ].filter(Boolean);

        for (const el of candidates) {
            const color = parseCssColor(getComputedStyle(el).backgroundColor);
            if (color && color.a > 0.2) return color;
        }

        return null;
    }

    function parseCssColor(cssColor) {
        if (!cssColor || cssColor === 'transparent') return null;

        const match = cssColor.match(/rgba?\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)(?:\s*[,/]\s*(\d+(?:\.\d+)?))?\s*\)/i);
        if (!match) return null;

        return {
            r: Number(match[1]),
            g: Number(match[2]),
            b: Number(match[3]),
            a: match[4] === undefined ? 1 : Number(match[4]),
        };
    }

    function getRelativeLuminance(color) {
        const [r, g, b] = [color.r, color.g, color.b].map((value) => {
            const channel = value / 255;
            return channel <= 0.03928
                ? channel / 12.92
                : ((channel + 0.055) / 1.055) ** 2.4;
        });

        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
})();
