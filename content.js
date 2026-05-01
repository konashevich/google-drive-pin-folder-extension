// content.js — GDrive Sidebar Pinner
// Zero cloning. All custom HTML. Observer pauses during DOM writes.

(function () {
    'use strict';

    console.log('GDrive Sidebar Pinner: Extension Loaded');

    let pinnedFolders = [];
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

    chrome.storage.sync.get(['pinnedFolders'], (result) => {
        pinnedFolders = result.pinnedFolders || [];
        pinsReady = true;
        if (colorCacheReady) runUpdate();
    });

    // Listen for storage changes (e.g. from another tab)
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (changes.pinnedFolders) {
            pinnedFolders = changes.pinnedFolders.newValue || [];
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

    // Also poll on SPA navigation (URL changes without page reload)
    let lastUrl = location.href;
    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            runUpdate();
        }
    }, 500);

    function runUpdate() {
        if (isUpdating) return;
        isUpdating = true;
        try {
            scanAndCacheColors(); // scan file list for folder icon colors
            ensureWidgetExists();
            ensureFabExists();
            syncThemeColor(); // Fix the light PWA header
        } finally {
            // Release guard after a tick so the observer ignores our mutations
            setTimeout(() => { isUpdating = false; }, 50);
        }
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
        const stateKey = JSON.stringify(pinnedFolders) + cacheKey;
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
            link.href = `https://drive.google.com/drive/u/0/folders/${folder.id}`;
            link.target = '_blank';
            link.rel = 'noopener';
            link.className = 'gdp-folder-link';

            // Always prefer live cache color over stored value (cache is fresher)
            const iconColor = normalizeHex(folderColorCache[folder.id]) || normalizeHex(folder.color || '') || '#9aa0a6';

            link.innerHTML = `
                <span class="gdp-folder-icon" style="color: ${iconColor}"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" fill="currentColor"/></svg></span>
                <span class="gdp-folder-name">${folder.name}</span>
            `;

            list.appendChild(link);
        });
    }

    function getCurrentFolderInfo() {
        const path = window.location.pathname;
        if (!path.includes('/folders/')) return null;

        const segments = path.split('/');
        const id = segments[segments.length - 1];
        if (!id || id.length < 10) return null;

        let name = document.title || '';
        name = name.replace(/\s*-\s*Google Drive\s*/gi, '').trim();
        name = name.replace(/^Google Drive\s*-\s*/i, '').trim();
        if (!name) name = 'Unnamed Folder';

        // Look up color from cache
        const color = folderColorCache[id] || null;

        return { id, name, color };
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

        if (scanVisibleFolderRowsForColors()) {
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

            const hex = readFolderColorFromRow(row);
            if (!hex || folderColorCache[folderId] === hex) continue;

            folderColorCache[folderId] = hex;
            updated = true;
        }

        return updated;
    }

    function readFolderColorFromRow(row) {
        const rowRect = safeRect(row);
        const candidates = [];
        const elements = row.querySelectorAll('*');

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

    function scanAriaLabelFolderColors() {
        const elements = document.querySelectorAll('[aria-label*="with colour"], [aria-label*="with color"]');
        if (elements.length === 0) return false;

        let updated = false;
        for (const el of elements) {
            const label = el.getAttribute('aria-label') || '';
            const match = label.match(/Folder with colou?r\s+(.+)/i);
            if (!match) continue;

            // Strip all types of quotes (straight, curly, etc.)
            const colorName = match[1].trim().replace(/["'\u201C\u201D\u2018\u2019]/g, '').trim().toLowerCase();
            const hex = GDRIVE_COLOR_MAP[colorName];
            if (!hex) continue;

            // Try to find folder ID from multiple sources:
            // 1. Closest data-id (file list rows)
            const row = el.closest('[data-id]');
            if (row) {
                const folderId = row.getAttribute('data-id');
                if (folderId && folderId.length >= 10 && folderColorCache[folderId] !== hex) {
                    folderColorCache[folderId] = hex;
                    updated = true;
                }
                continue;
            }

            // 2. Details panel — extract folder name, then match from URL or page title
            //    Also try to extract from the header text next to the icon
            const headerParent = el.closest('.a-Mg-V-j, [role="link"], h2')?.parentElement;
            const headerText = headerParent?.querySelector('div')?.textContent?.trim();

            // 3. If we're inside the folder, use the current URL's folder ID
            const urlMatch = location.pathname.match(/\/folders\/([^/?]+)/);
            if (urlMatch) {
                const folderId = urlMatch[1];
                if (folderId.length >= 10 && folderColorCache[folderId] !== hex) {
                    folderColorCache[folderId] = hex;
                    updated = true;
                }
            }

            // 4. Try the breadcrumb/title folder name match  
            //    Look for nearby folder name text and match to data-id in the file list
            if (headerText) {
                const allRows = document.querySelectorAll('[data-id]');
                for (const r of allRows) {
                    const nameEl = r.querySelector('.KL4NAf');
                    if (nameEl && nameEl.textContent.trim() === headerText) {
                        const fId = r.getAttribute('data-id');
                        if (fId && fId.length >= 10 && folderColorCache[fId] !== hex) {
                            folderColorCache[fId] = hex;
                            updated = true;
                        }
                    }
                }
            }
        }

        return updated;
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
        scanAndCacheColors();

        const info = getCurrentFolderInfo();
        if (!info) return;

        const idx = pinnedFolders.findIndex((f) => f.id === info.id);
        if (idx > -1) {
            pinnedFolders.splice(idx, 1);
        } else {
            pinnedFolders.push(info);
        }

        chrome.storage.sync.set({ pinnedFolders }, () => {
            updateFabLabel();
            lastRendered = ''; // force re-render
            renderPinnedList();
        });
    }

    // ──────────────────────────────────────────────
    // THEME COLOR FIX (PWA Header)
    // ──────────────────────────────────────────────

    function syncThemeColor() {
        // Find or create the theme-color meta tag
        let meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'theme-color';
            document.head.appendChild(meta);
        }

        // Google Drive's dark mode background is approx #131314.
        // We set the browser frame to match this exactly.
        const darkThemeColor = '#131314';
        
        // Only update if it's different to avoid unnecessary DOM noise
        if (meta.getAttribute('content') !== darkThemeColor) {
            meta.setAttribute('content', darkThemeColor);
            console.log('GDrive Sidebar Pinner: Syncing frame color to dark');
        }
    }
})();
