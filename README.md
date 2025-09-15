# Screenshot Extension

A minimal Chrome (MV3) extension built with Plasmo for capturing screenshots in three modes: Visible Area, Full Page, and Custom Region. All capture results provide a unified dark overlay with Copy, Download, and Close options.

## Features

- 📸 **Visible Area Capture**: Quickly capture exactly what you see in the current viewport.
- 🧵 **Full Page Capture**: Scrolls automatically and stitches the entire page (vertical + horizontal if present).
- ✂️ **Region Capture (Custom Area)**: Drag to select any rectangular area; supports stitching beyond the current viewport via intelligent tiled scrolling only over the selected region.
- 🗂️ **Unified Result Overlay**: Consistent minimal dark panel with Copy, Download, and Close across all capture types.
- 📋 **Robust Clipboard Flow**: Attempts direct programmatic copy; falls back to a user-gesture overlay if needed.
- 🚫 **No Keyboard Shortcut Required**: Removed to keep surface minimal (was previously Ctrl/Cmd+Shift+S).
- ⚡ **Efficiency & Rate Limiting**: Internal pacing prevents missed frames and reduces visual artifacts.
- 🛟 **Resilient UX Details**: Auto-scroll during region selection near edges, selection size indicator, temporary text-selection suppression, and overlay delay to avoid capturing itself.

## Quick Start

### Install (Development)
1. Clone repository
2. Install dependencies:
   ```bash
   pnpm install
   # or
   npm install
   ```
3. Start dev build (watch):
   ```bash
   pnpm dev
   # or
   npm run dev
   ```
4. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable Developer Mode
   - Load unpacked → select `build/chrome-mv3-dev`

### Production Build
```bash
pnpm build
# or
npm run build
```
Then load `build/chrome-mv3-prod` the same way.

## Usage

1. Click the extension icon to open the minimal popup.
2. Choose one of:
   - Capture Visible Area
   - Capture Full Page
   - Capture Region
3. Popup closes immediately; capture proceeds in the page.
4. After processing, a dark overlay appears with:
   - Copy (puts PNG into clipboard)
   - Download (saves `screenshot-*.png`)
   - Close (dismiss overlay)

### Region Mode Notes
- Drag to create a rectangle; release to capture.
- If your rectangle extends beyond the viewport, the page auto-scrolls and only the needed tiles are captured & stitched.
- Cancel by pressing `Esc` before releasing.

## How It Works

1. User initiates a mode from popup.
2. Content script orchestrates: viewport capture, scrolling, or region tiling.
3. Uses `chrome.tabs.captureVisibleTab` for each tile with controlled delays.
4. Tiles are composited onto an offscreen canvas (only selected region area for region mode).
5. Final PNG presented in overlay with actions; clipboard write attempts direct `ClipboardItem` usage with fallbacks.

## Technical Details

- **Framework**: [Plasmo](https://docs.plasmo.com/)
- **Manifest**: Chrome Extension Manifest V3
- **Permissions**: `activeTab`, `tabs`, `clipboardWrite`
- **APIs**: Tabs capture, messaging, (previous keyboard commands removed)
- **Resilience**: Overlay introduced as fallback for stricter clipboard permission environments.

## File Overview

```
background.ts               # Background coordination (messaging)
contents/screenshot-handler.ts  # Core capture + stitching + overlays
popup.tsx                   # Minimal UI (3 action buttons)
offscreen.html / offscreen.js  # (If present) clipboard/offscreen logic
package.json                # Manifest + scripts
```

## Removed / Deprecated

- Keyboard shortcut (Ctrl/Cmd+Shift+S) removed for simplicity.
- Older white/light result dialogs replaced by unified dark overlay.
- Test clipboard button removed from popup.

## Troubleshooting

- Blank or partial full-page capture: Ensure page fully loaded; very dynamic sites may need a brief pause before triggering.
- Clipboard blocked: Use the Copy button in the overlay (user gesture) if automatic copy fails silently.
- Overlay captured in image: A short delay prevents this; if it ever happens, re-run the capture—ensure page not repainted heavily at trigger time.
- Region selection not starting: Confirm the active tab is a standard web page (some Chrome internal pages are restricted).

## Development Tips

- Adjust capture pacing or tile size inside `screenshot-handler.ts` if targeting extremely large pages.
- Overlay styling is centralized in the `showResultOverlay` helper.
- Region scrolling thresholds (edge auto-scroll) configurable near region selection logic.

## Future Ideas (Not Implemented)

- JPEG/WEBP export toggle
- In-overlay basic annotation
- Retain last capture mode preference

## License

Internal / Private (add a license if you intend to distribute)


## Installation

### Development Mode

1. Clone this repository
2. Install dependencies:
   ```bash
   pnpm install
   # or
   npm install
   ```

3. Start the development server:
   ```bash
   pnpm dev
   # or
   npm run dev
   ```

4. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `build/chrome-mv3-dev` folder

### Production Build

1. Build the extension:
   ```bash
   pnpm build
   # or
   npm run build
   ```

2. Load the extension from `build/chrome-mv3-prod` folder

## Usage

### Method 1: Keyboard Shortcut (Recommended)
- Press `Ctrl+Shift+S` (Windows/Linux) or `Cmd+Shift+S` (Mac)
- The extension will automatically scroll through the page and capture everything
- Screenshot will be copied to clipboard when complete

### Method 2: Extension Popup
- Click the extension icon in the toolbar
- Click "Capture Screenshot" button
- Wait for the capture process to complete

## How It Works

1. **Trigger**: User activates via keyboard shortcut or popup button
2. **Injection**: Background script injects content script into active tab
3. **Analysis**: Content script analyzes page dimensions and viewport size
4. **Capture**: Systematically scrolls and captures visible areas using Chrome's `captureVisibleTab` API
5. **Combine**: Stitches individual screenshots into a single full-page image
6. **Clipboard**: Copies the final image to system clipboard

## Technical Details

- **Framework**: [Plasmo](https://docs.plasmo.com/)
- **Manifest**: Chrome Extension Manifest V3
- **Permissions**: `activeTab`, `tabs`, `clipboardWrite`, `scripting`
- **APIs Used**: Chrome Commands, Tabs, Scripting, and Clipboard APIs

## File Structure

```
├── background.ts              # Background script handling shortcuts and coordination
├── contents/
│   └── screenshot-handler.ts  # Content script for page interaction and capture
├── popup.tsx                  # Extension popup interface
├── package.json              # Project configuration and permissions
└── test-page.html            # Test page for development
```

## Testing

1. Open the included `test-page.html` in your browser
2. Load the extension in development mode
3. Test both keyboard shortcut and popup methods
4. Verify the screenshot includes all sections (tall, wide, and colorful content)

## Troubleshooting

- **Permission Issues**: Ensure all required permissions are granted in `chrome://extensions/`
- **Clipboard Not Working**: Check if the page has HTTPS (required for clipboard API)
- **Incomplete Screenshots**: Verify the page has finished loading before capturing
- **Extension Not Loading**: Check the console in `chrome://extensions/` for error messages

## Development

This project uses Plasmo for Chrome extension development. Key files:

- Modify `popup.tsx` for UI changes
- Update `background.ts` for background script logic
- Edit `contents/screenshot-handler.ts` for capture functionality
- Adjust permissions in `package.json` manifest section

For more information, visit the [Plasmo Documentation](https://docs.plasmo.com/)

## Progress Overlay Exclusion
The animated dot progress overlay (`data-screenshot-progress`) is now automatically hidden for the exact frame(s) when a bitmap capture is requested (full page, region, or visible area). This prevents the progress UI from appearing inside the stitched screenshot. The element is visually restored immediately after each capture so the user still sees live progress.

If you customize the progress markup, keep the `data-screenshot-progress` attribute so the hider continues to work.
