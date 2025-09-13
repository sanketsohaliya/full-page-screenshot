# Full Page Screenshot Extension

A Chrome extension built with Plasmo that captures full page screenshots with keyboard shortcuts and copies them to the clipboard.

## Features

- 📸 **Full Page Screenshots**: Captures the entire webpage, including content that requires scrolling
- ⌨️ **Keyboard Shortcut**: Quick capture with `Ctrl+Shift+S` (or `Cmd+Shift+S` on Mac)
- 📋 **Clipboard Integration**: Automatically copies screenshots to clipboard for easy sharing
- 🖱️ **Popup Interface**: Alternative capture method through extension popup
- 🔄 **Smart Scrolling**: Handles both horizontal and vertical scrolling automatically

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
