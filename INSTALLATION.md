# Installation Guide - Full Page Screenshot Extension

## Quick Start

1. **Open Chrome Extensions Page**
   - Go to `chrome://extensions/` in your Chrome browser
   - Or click the three dots menu → More tools → Extensions

2. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top right corner

3. **Load the Extension**
   - Click "Load unpacked" button
   - Navigate to and select the `hunt-melodic-duck/build/chrome-mv3-dev` folder
   - The extension should now appear in your extensions list

4. **Test the Extension**
   - Open any webpage (try the included `test-page.html`)
   - Press `Ctrl+Shift+S` (or `Cmd+Shift+S` on Mac)
   - Or click the extension icon and use the "Capture Screenshot" button

## Detailed Steps

### Step 1: Prepare the Extension

If you haven't built the extension yet:

```bash
cd hunt-melodic-duck
pnpm install
pnpm dev
```

This will create the development build in `build/chrome-mv3-dev/`.

### Step 2: Chrome Extensions Setup

1. Open Chrome browser
2. Type `chrome://extensions/` in the address bar and press Enter
3. You should see the Chrome Extensions management page

### Step 3: Enable Developer Mode

1. Look for the "Developer mode" toggle in the top right corner
2. Click to enable it (it should turn blue/green)
3. You'll see new buttons appear: "Load unpacked", "Pack extension", "Update"

### Step 4: Load the Extension

1. Click the "Load unpacked" button
2. A file browser will open
3. Navigate to your project folder: `screenshot-extension/hunt-melodic-duck/`
4. Select the `build/chrome-mv3-dev` folder (not the files inside, but the folder itself)
5. Click "Select Folder" or "Open"

### Step 5: Verify Installation

1. The extension should appear in your extensions list with:
   - Name: "Full Page Screenshot"
   - ID: A unique extension ID
   - Status: Enabled (toggle should be on)

2. You should see the extension icon in your Chrome toolbar
   - If not visible, click the puzzle piece icon and pin the extension

### Step 6: Test the Extension

1. **Test with Keyboard Shortcut:**
   - Open any webpage
   - Press `Ctrl+Shift+S` (Windows/Linux) or `Cmd+Shift+S` (Mac)
   - You should see a notification about screenshot capture

2. **Test with Popup:**
   - Click the extension icon in the toolbar
   - Click "Capture Screenshot" button
   - The popup should close and capture should begin

3. **Test with Test Page:**
   - Open the `test-page.html` file in Chrome
   - Try both methods above
   - The page has various sections to test scrolling

## Troubleshooting

### Extension Not Loading
- **Error**: "Manifest file is missing or unreadable"
  - **Solution**: Make sure you selected the `build/chrome-mv3-dev` folder, not individual files

- **Error**: "This extension may have been corrupted"
  - **Solution**: Run `pnpm dev` again to rebuild the extension

### Extension Not Working
- **Issue**: Keyboard shortcut not working
  - **Solution**: Check if another extension is using the same shortcut in `chrome://extensions/shortcuts`

- **Issue**: Screenshots not copying to clipboard
  - **Solution**: Make sure you're on an HTTPS page (clipboard API requirement)

- **Issue**: Partial screenshots only
  - **Solution**: Wait for the page to fully load before capturing

### Permission Issues
- Make sure the extension has all required permissions:
  - Active Tab
  - Tabs
  - Clipboard Write
  - Scripting

### Development Mode Issues
- If you see "Developer mode extensions" warning, that's normal for unpacked extensions
- The extension will be disabled if you turn off Developer mode

## Production Installation

For a production version:

1. Run `pnpm build` instead of `pnpm dev`
2. Load the `build/chrome-mv3-prod` folder instead
3. This version is optimized and doesn't require the development server

## Updating the Extension

When you make changes to the code:

1. The development server (`pnpm dev`) will auto-rebuild
2. Go to `chrome://extensions/`
3. Click the refresh icon on your extension
4. Or use the "Update" button in developer mode

## Uninstalling

To remove the extension:

1. Go to `chrome://extensions/`
2. Find "Full Page Screenshot" extension
3. Click "Remove"
4. Confirm the removal

The extension and all its data will be completely removed from Chrome.
