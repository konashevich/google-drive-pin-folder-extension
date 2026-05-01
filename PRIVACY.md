# Privacy Policy

GDrive Sidebar Pinner does not collect, sell, transmit, or share personal data.

The extension runs only on `drive.google.com` pages. It reads the current Google Drive page structure in the browser so it can add a pinned-folder sidebar widget, detect visible folder icon colors, and keep pinned folders separated for each active Google Drive account.

Data stored by the extension:

- Pinned folder IDs and names are stored in `chrome.storage.sync` so Chrome can sync them between the user's browsers.
- A hashed active-account key is stored with those pinned folders so pins from one Google Drive account do not appear in another account in the same browser profile. If the account email is not visible in the Google Drive page, the extension falls back to Drive's visible `/u/0`, `/u/1`, etc. account slot.
- Detected folder icon colors are stored in `chrome.storage.local` on the user's device, also separated by account when an account key is available.

The extension does not send this data to the developer or to any third-party service. It does not use analytics, advertising, tracking pixels, or remote code.

To delete stored data, remove pinned folders in the extension UI or uninstall the extension from Chrome.
