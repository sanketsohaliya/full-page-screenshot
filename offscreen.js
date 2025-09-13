// Offscreen document for clipboard operations
console.log("Offscreen document loaded for clipboard operations")

// Listen for messages from background script
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log("Offscreen received message:", message)
  
  if (message.action === 'copy-to-clipboard-offscreen') {
    try {
      console.log("Attempting clipboard copy in offscreen document")
      
      // Convert data URL to blob
      const response = await fetch(message.dataUrl)
      const blob = await response.blob()
      
      console.log(`Offscreen created blob: ${blob.size} bytes, type: ${blob.type}`)
      
      // Check if Clipboard API is available
      if (!navigator.clipboard || !navigator.clipboard.write) {
        throw new Error("Clipboard API not available in offscreen document")
      }
      
      // Copy to clipboard
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ])
      
      console.log("Offscreen clipboard copy successful")
      sendResponse({ success: true })
      
    } catch (error) {
      console.error("Offscreen clipboard copy failed:", error)
      console.error("Offscreen error details:", {
        name: error.name,
        message: error.message,
        code: error.code,
        constructor: error.constructor.name
      })
      
      sendResponse({ 
        success: false, 
        error: error.message,
        errorName: error.name 
      })
    }
    
    // Return true to indicate we'll send response asynchronously
    return true
  }
})

// Test clipboard availability on load
document.addEventListener('DOMContentLoaded', () => {
  console.log("Offscreen document DOM loaded")
  console.log("Clipboard API available:", !!navigator.clipboard)
  console.log("Clipboard write available:", !!(navigator.clipboard && navigator.clipboard.write))
  console.log("Location:", location.href)
  console.log("Protocol:", location.protocol)
})
