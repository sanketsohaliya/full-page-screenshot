# Troubleshooting Guide - Full Page Screenshot Extension

## Common Issues and Solutions

### 1. Extension Not Loading

**Error**: "Manifest file is missing or unreadable"
- **Solution**: Make sure you're loading the `build/chrome-mv3-dev` folder, not individual files
- **Check**: Verify the manifest.json exists in the selected folder

**Error**: "This extension may have been corrupted"
- **Solution**: 
  1. Stop the dev server (`Ctrl+C`)
  2. Run `pnpm dev` again
  3. Reload the extension in Chrome

### 2. Keyboard Shortcut Not Working

**Issue**: `Ctrl+Shift+S` doesn't trigger screenshot
- **Check**: Go to `chrome://extensions/shortcuts` and verify the shortcut is assigned
- **Solution**: If conflicting with another extension, change the shortcut there
- **Alternative**: Use the popup button instead

### 3. Content Script Issues

**Error**: "Extension context invalidated"
- **Cause**: Extension was reloaded while page was open
- **Solution**: Refresh the webpage after reloading the extension

**Error**: "Could not load file: contents/screenshot-handler.js"
- **Cause**: Old reference to incorrect file path
- **Solution**: This should be fixed in the latest version

### 4. Screenshot Capture Issues

**Issue**: Only partial screenshots captured
- **Check**: Wait for page to fully load before capturing
- **Check**: Ensure page doesn't have infinite scroll or dynamic content loading

**Issue**: Screenshots not copying to clipboard
- **Requirement**: Page must be served over HTTPS (clipboard API requirement)
- **Solution**: Test with HTTPS sites or use `https://` instead of `file://`

### 5. Debugging Steps

#### Enable Debug Logging
1. Open Chrome DevTools (`F12`)
2. Go to Console tab
3. Look for messages from the extension:
   - "Screenshot handler content script loaded"
   - "Command received: capture-screenshot"
   - "Starting full page capture..."

#### Check Extension Console
1. Go to `chrome://extensions/`
2. Find "Full Page Screenshot" extension
3. Click "Inspect views: background page"
4. Check console for background script errors

#### Check Content Script Console
1. Open the webpage you want to screenshot
2. Open DevTools (`F12`)
3. Look for content script messages in console

### 6. Testing Checklist

#### Basic Functionality
- [ ] Extension loads without errors
- [ ] Extension icon appears in toolbar
- [ ] Popup opens when clicking icon
- [ ] Keyboard shortcut is registered

#### Screenshot Capture
- [ ] Keyboard shortcut triggers capture
- [ ] Popup button triggers capture
- [ ] Console shows "Starting full page capture..."
- [ ] Page scrolls during capture process
- [ ] Success notification appears

#### Clipboard Integration
- [ ] Screenshot copied to clipboard
- [ ] Can paste screenshot in image editor
- [ ] No clipboard errors in console

### 7. Test Pages

#### Simple Test
```html
<!DOCTYPE html>
<html><body>
<h1>Test Page</h1>
<p>Simple content for testing</p>
</body></html>
```

#### HTTPS Test Sites
- https://example.com
- https://google.com
- https://github.com

#### Complex Test
Use the included `test-page.html` which has:
- Tall content (vertical scrolling)
- Wide content (horizontal scrolling)
- Colorful elements (visual verification)

### 8. Development Tips

#### Hot Reload
- The dev server automatically rebuilds on changes
- Refresh the extension in Chrome after changes
- Refresh test pages after extension reload

#### Console Debugging
Add more logging if needed:
```javascript
console.log("Debug info:", someVariable)
```

#### Manual Testing
1. Load extension in Chrome
2. Open test page
3. Open DevTools console
4. Try keyboard shortcut
5. Check console messages
6. Verify clipboard content

### 9. Known Limitations

- **File:// URLs**: Clipboard API may not work with local files
- **HTTP Sites**: Clipboard API requires HTTPS in production
- **Large Pages**: Very large pages may take longer to capture
- **Dynamic Content**: Pages with infinite scroll may not capture completely

### 10. Getting Help

If issues persist:

1. **Check Console**: Look for error messages in both background and content script consoles
2. **Test Environment**: Try different websites (HTTPS recommended)
3. **Extension Reload**: Reload extension and refresh test pages
4. **Chrome Version**: Ensure Chrome is up to date

#### Useful Chrome URLs
- `chrome://extensions/` - Manage extensions
- `chrome://extensions/shortcuts` - Keyboard shortcuts
- `chrome://version/` - Chrome version info

### 11. Success Indicators

When working correctly, you should see:
1. ✅ Extension loads without errors
2. ✅ Console shows "Screenshot handler content script loaded"
3. ✅ Keyboard shortcut triggers "Command received: capture-screenshot"
4. ✅ Page scrolls automatically during capture
5. ✅ Green notification: "Full page screenshot copied to clipboard!"
6. ✅ Can paste screenshot in image editor
