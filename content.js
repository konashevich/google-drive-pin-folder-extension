// content.js — GDrive Sidebar Pinner
// Zero cloning. All custom HTML. Observer pauses during DOM writes.

(function () {
    'use strict';

    console.log('GDrive Sidebar Pinner: Extension Loaded');

    let pinnedFolders = [];
    let isUpdating = false; // guard to prevent observer re-entry

    // Load saved pins
    chrome.storage.sync.get(['pinnedFolders'], (result) => {
        pinnedFolders = result.pinnedFolders || [];
        runUpdate();
    });

    // Listen for storage changes (e.g. from another tab)
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.pinnedFolders) {
            pinnedFolders = changes.pinnedFolders.newValue || [];
            renderPinnedList();
        }
    });

    // MutationObserver — guards against re-entry
    const observer = new MutationObserver(() => {
        if (isUpdating) return; // skip mutations caused by our own DOM writes
        runUpdate();
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
            ensureWidgetExists();
            ensureFabExists();
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
        renderPinnedList();
    }

    let lastRendered = '';
    function renderPinnedList() {
        const list = document.getElementById('gdp-list');
        if (!list) return;

        const stateKey = JSON.stringify(pinnedFolders);
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

            link.innerHTML = `
                <span class="gdp-folder-icon"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" fill="currentColor"/></svg></span>
                <span class="gdp-folder-name">${folder.name}</span>
            `;

            list.appendChild(link);
        });
    }

    // ──────────────────────────────────────────────
    // FAB (Pin / Unpin button)
    // ──────────────────────────────────────────────

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

        return { id, name };
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
})();
