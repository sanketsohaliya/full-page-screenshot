// Background script for screenshot extension
import type { PlasmoMessaging } from "@plasmohq/messaging"

// Listen for keyboard shortcut commands
chrome.commands.onCommand.addListener(async (command) => {
  console.log("Command received:", command)

  if (command === "capture-screenshot") {
    try {
      // Get the active tab
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })

      if (!activeTab?.id) {
        console.error("No active tab found")
        return
      }

      console.log("Sending capture message to tab:", activeTab.id)

      // The content script is already registered in manifest, so we don't need to inject it
      // Just send the message directly

      // Send message to content script to start screenshot process
      chrome.tabs.sendMessage(activeTab.id, { action: "capture-full-page" })

    } catch (error) {
      console.error("Error capturing screenshot:", error)
    }
  }
})

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === "capture-full-page") {
    // Handle message from popup - trigger screenshot capture
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })

      if (!activeTab?.id) {
        console.error("No active tab found")
        return
      }

      // The content script is already registered in manifest, so we don't need to inject it
      // Just send the message directly

      // Send message to content script to start screenshot process
      chrome.tabs.sendMessage(activeTab.id, { action: "capture-full-page" })

    } catch (error) {
      console.error("Error capturing screenshot:", error)
    }
  } else if (message.action === "capture-visible-area" && !sender.tab) {
    // Handle message from popup - trigger visible area capture
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })

      if (!activeTab?.id) {
        console.error("No active tab found")
        return
      }

      console.log("Sending visible area capture message to tab:", activeTab.id)

      // Send message to content script to start visible area capture
      chrome.tabs.sendMessage(activeTab.id, { action: "capture-visible-area" })

    } catch (error) {
      console.error("Error capturing screenshot:", error)
    }
  } else if (message.action === "capture-visible-area" && sender.tab) {
    try {
      // Capture the visible area of the tab (from content script)
      const dataUrl = await chrome.tabs.captureVisibleTab(
        sender.tab?.windowId,
        { format: "png", quality: 100 }
      )
      
      // Send the captured image back to content script
      if (sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          action: "screenshot-captured",
          dataUrl: dataUrl,
          scrollPosition: message.scrollPosition
        })
      }
    } catch (error) {
      console.error("Error capturing visible area:", error)
      if (sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          action: "screenshot-error",
          error: error.message
        })
      }
    }
  } else if (message.action === "copy-to-clipboard") {
    try {
      console.log("Background script handling clipboard copy request")

      // Handle clipboard copy in background script where we have proper permissions
      const success = await copyToClipboardInBackground(message.dataUrl)

      if (sender.tab?.id) {
        if (success) {
          chrome.tabs.sendMessage(sender.tab.id, {
            action: "clipboard-success",
            message: "Screenshot copied to clipboard!"
          })
        } else {
          chrome.tabs.sendMessage(sender.tab.id, {
            action: "clipboard-error",
            error: "Clipboard access failed. Please click the extension icon and use 'Quick Capture' button for reliable clipboard access."
          })
        }
      }
    } catch (error) {
      console.error("Error handling clipboard request:", error)
      if (sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          action: "clipboard-error",
          error: error.message
        })
      }
    }
  } else if (message.action === "capture-full-page-for-popup") {
    console.log("Background script received full page capture request for popup")

    try {
      const tabId = message.tabId || sender.tab?.id

      if (!tabId) {
        sendResponse({ success: false, error: "No tab ID provided" })
        return
      }

      // Inject and execute the screenshot handler
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["contents/screenshot-handler.js"]
      })

      // Send message to content script to start full page capture
      const response = await chrome.tabs.sendMessage(tabId, {
        action: "capture-full-page-return-data"
      })

      if (response?.success && response?.dataUrl) {
        sendResponse({ success: true, dataUrl: response.dataUrl })
      } else {
        sendResponse({ success: false, error: response?.error || "Full page capture failed" })
      }

    } catch (error) {
      console.error("Full page capture for popup failed:", error)
      sendResponse({ success: false, error: error.message })
    }

    return true // Keep message channel open for async response
  }
})

// Function to handle clipboard operations in background script
async function copyToClipboardInBackground(dataUrl: string): Promise<boolean> {
  try {
    console.log("Attempting clipboard copy in background script")
    console.log("Background context check:", {
      hasNavigator: typeof navigator !== 'undefined',
      hasClipboard: typeof navigator !== 'undefined' && !!navigator.clipboard,
      hasClipboardWrite: typeof navigator !== 'undefined' && !!navigator.clipboard?.write,
      hasOffscreen: !!chrome.offscreen
    })

    // Convert data URL to blob
    const response = await fetch(dataUrl)
    const blob = await response.blob()

    console.log(`Created blob: ${blob.size} bytes, type: ${blob.type}`)

    // In Manifest V3 service workers, navigator.clipboard is usually not available
    // Try offscreen document approach
    console.log("Using offscreen document for clipboard access...")
    return await createOffscreenForClipboard(dataUrl)

  } catch (error) {
    console.error("Background clipboard copy failed:", error)
    console.error("Error details:", {
      name: error.name,
      message: error.message,
      code: error.code,
      constructor: error.constructor.name
    })
    return false
  }
}

// Create offscreen document for clipboard access
async function createOffscreenForClipboard(dataUrl: string): Promise<boolean> {
  try {
    console.log("Creating offscreen document for clipboard access")

    // Check if offscreen API is available
    if (!chrome.offscreen) {
      console.error("Offscreen API not available - this might be an older Chrome version")
      return false
    }

    // Check if offscreen document already exists
    let existingContexts = []
    try {
      existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
      })
    } catch (e) {
      console.log("Could not check existing contexts:", e.message)
    }

    // Close existing offscreen document if any
    if (existingContexts.length > 0) {
      console.log("Closing existing offscreen document")
      try {
        await chrome.offscreen.closeDocument()
      } catch (e) {
        console.log("Could not close existing offscreen document:", e.message)
      }
    }

    console.log("Creating new offscreen document...")

    // Create offscreen document
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: 'Copy screenshot to clipboard'
    })

    console.log("Offscreen document created, sending clipboard message...")

    // Send message to offscreen document with timeout
    const response = await Promise.race([
      chrome.runtime.sendMessage({
        action: 'copy-to-clipboard-offscreen',
        dataUrl: dataUrl
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Offscreen clipboard timeout')), 10000)
      )
    ])

    console.log("Offscreen response:", response)

    // Close offscreen document
    try {
      await chrome.offscreen.closeDocument()
      console.log("Offscreen document closed")
    } catch (e) {
      console.log("Could not close offscreen document:", e.message)
    }

    return response?.success || false

  } catch (error) {
    console.error("Offscreen clipboard copy failed:", error)
    console.error("Offscreen error details:", {
      name: error.name,
      message: error.message,
      stack: error.stack
    })

    // Try to clean up offscreen document
    try {
      await chrome.offscreen.closeDocument()
    } catch (e) {
      // Ignore cleanup errors
    }

    return false
  }
}



export {}
