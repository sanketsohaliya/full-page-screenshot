// Content script for handling full page screenshots
import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_end",
  all_frames: false
}

interface ScreenshotData {
  dataUrl: string
  scrollPosition: { x: number; y: number }
  viewportHeight: number
  viewportWidth: number
}

class FullPageScreenshot {
  private screenshots: ScreenshotData[] = []
  private originalScrollPosition = { x: 0, y: 0 }
  private isCapturing = false
  private useSimpleMode = false // Fallback to single screenshot if rate limited
  public lastCapturedDataUrl: string | null = null

  async captureVisibleArea(): Promise<string | null> {
    if (this.isCapturing) {
      console.log("Screenshot capture already in progress")
      return null
    }

    this.isCapturing = true
    this.screenshots = []

    try {
      console.log("Capturing visible area only...")

      // Capture just the current visible area
      await this.captureCurrentView(window.scrollX, window.scrollY)

      // Copy the single screenshot to clipboard directly
      if (this.screenshots.length > 0) {
        const screenshot = this.screenshots[0]
        await this.copyToClipboard(screenshot.dataUrl)
        return screenshot.dataUrl
      }

    } catch (error) {
      console.error("Error during visible area capture:", error)
      this.showNotification("Error capturing screenshot: " + error.message, "error")
      return null
    } finally {
      this.isCapturing = false
    }

    return null
  }

  async captureFullPage(copyToClipboard: boolean = true): Promise<string | null> {
    if (this.isCapturing) {
      console.log("Screenshot capture already in progress")
      return null
    }

    this.isCapturing = true
    this.screenshots = []

    try {
      // Store original scroll position
      this.originalScrollPosition = {
        x: window.scrollX,
        y: window.scrollY
      }

      // Get page dimensions
      const pageHeight = Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.clientHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      )

      const pageWidth = Math.max(
        document.body.scrollWidth,
        document.body.offsetWidth,
        document.documentElement.clientWidth,
        document.documentElement.scrollWidth,
        document.documentElement.offsetWidth
      )

      const viewportHeight = window.innerHeight
      const viewportWidth = window.innerWidth

      console.log(`Page dimensions: ${pageWidth}x${pageHeight}`)
      console.log(`Viewport dimensions: ${viewportWidth}x${viewportHeight}`)

      // Calculate number of screenshots needed
      const verticalScreenshots = Math.ceil(pageHeight / viewportHeight)
      const horizontalScreenshots = Math.ceil(pageWidth / viewportWidth)

      const totalScreenshots = verticalScreenshots * horizontalScreenshots
      console.log(`Will take ${verticalScreenshots}x${horizontalScreenshots} = ${totalScreenshots} screenshots`)

      // Check if we're within reasonable limits to avoid rate limiting
      if (totalScreenshots > 6) {
        this.showNotification(`Large page detected. Switching to visible area capture to avoid rate limits.`, "error")
        await this.sleep(1000)
        // Fall back to visible area capture
        const visibleDataUrl = await this.captureVisibleArea()
        return visibleDataUrl
      }

      // Capture screenshots by scrolling with rate limiting
      for (let row = 0; row < verticalScreenshots; row++) {
        for (let col = 0; col < horizontalScreenshots; col++) {
          const scrollX = col * viewportWidth
          const scrollY = row * viewportHeight

          // Scroll to position
          window.scrollTo(scrollX, scrollY)

          // Wait for scroll to complete and page to render
          await this.waitForScroll(scrollX, scrollY)
          await this.sleep(300) // Wait for rendering

          // Request screenshot from background script
          await this.captureCurrentView(scrollX, scrollY)

          // Add delay between captures to respect Chrome's rate limit
          // Chrome allows max 2 captures per second, so wait at least 600ms
          await this.sleep(700)
        }
      }

      // Restore original scroll position
      window.scrollTo(this.originalScrollPosition.x, this.originalScrollPosition.y)

      // Combine screenshots and optionally copy to clipboard
      const dataUrl = await this.combineAndCopyScreenshots(pageWidth, pageHeight, viewportWidth, viewportHeight, copyToClipboard)
      return dataUrl

    } catch (error) {
      console.error("Error during full page capture:", error)

      // If full page capture fails due to rate limiting, try visible area capture
      if (error.message.includes("MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND") ||
          error.message.includes("rate limit")) {
        console.log("Full page capture failed due to rate limiting, trying visible area capture...")
        this.showNotification("Rate limit reached. Capturing visible area instead...", "error")

        try {
          // Reset and try visible area capture
          this.screenshots = []
          await this.sleep(2000) // Wait for rate limit to reset
          await this.captureVisibleArea()
          return null
        } catch (fallbackError) {
          console.error("Fallback capture also failed:", fallbackError)
          this.showNotification("Error capturing screenshot: " + fallbackError.message, "error")
          return null
        }
      } else {
        this.showNotification("Error capturing screenshot: " + error.message, "error")
        return null
      }
    } finally {
      this.isCapturing = false
    }
  }

  private async captureCurrentView(scrollX: number, scrollY: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Screenshot capture timeout"))
      }, 15000) // Increased timeout for rate-limited captures

      const messageHandler = (message: any) => {
        if (message.action === "screenshot-captured" &&
            message.scrollPosition.x === scrollX &&
            message.scrollPosition.y === scrollY) {
          clearTimeout(timeout)
          chrome.runtime.onMessage.removeListener(messageHandler)

          this.screenshots.push({
            dataUrl: message.dataUrl,
            scrollPosition: { x: scrollX, y: scrollY },
            viewportHeight: window.innerHeight,
            viewportWidth: window.innerWidth
          })

          resolve()
        } else if (message.action === "screenshot-error") {
          clearTimeout(timeout)
          chrome.runtime.onMessage.removeListener(messageHandler)

          // Check if it's a rate limiting error
          if (message.error.includes("MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND")) {
            console.log("Rate limit hit, retrying after delay...")
            // Retry after a longer delay
            setTimeout(() => {
              this.captureCurrentView(scrollX, scrollY).then(resolve).catch(reject)
            }, 2000)
          } else {
            reject(new Error(message.error))
          }
        }
      }

      chrome.runtime.onMessage.addListener(messageHandler)

      // Request screenshot from background script
      try {
        chrome.runtime.sendMessage({
          action: "capture-visible-area",
          scrollPosition: { x: scrollX, y: scrollY }
        })
      } catch (error) {
        clearTimeout(timeout)
        chrome.runtime.onMessage.removeListener(messageHandler)
        reject(new Error("Extension context invalidated"))
      }
    })
  }

  public async copyToClipboard(dataUrl: string) {
    try {
      console.log("Content script requesting clipboard copy from background")

      // Store the dataUrl for potential fallback use
      this.lastCapturedDataUrl = dataUrl

      // Send clipboard request to background script
      // Background script has better clipboard access in Manifest V3
      chrome.runtime.sendMessage({
        action: "copy-to-clipboard",
        dataUrl: dataUrl
      })

      // Show loading notification
      this.showNotification("Copying to clipboard...", "info")

      // The background script will send back success/error messages
      // which are handled in the message listener

    } catch (error) {
      console.error("Error sending clipboard request to background:", error)
      this.showNotification("Error requesting clipboard copy: " + error.message, "error")
    }
  }



  private async tryAlternativeClipboard(dataUrl: string) {
    try {
      // Create a temporary image element and try to copy it
      const img = new Image()
      img.crossOrigin = "anonymous"

      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = dataUrl
      })

      // Create a canvas and draw the image
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        throw new Error("Could not get canvas context")
      }

      ctx.drawImage(img, 0, 0)

      // Try to copy canvas content
      canvas.toBlob(async (blob) => {
        if (!blob) {
          throw new Error("Could not create blob from canvas")
        }

        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob })
          ])
          console.log("Alternative clipboard method succeeded")
          this.showNotification("Screenshot copied to clipboard (alternative method)!", "success")
        } catch (altError) {
          console.error("Alternative clipboard method also failed:", altError)
          console.error("Alternative error details:", {
            name: altError.name,
            message: altError.message,
            code: altError.code,
            constructor: altError.constructor.name
          })

          let altErrorMessage = "Unknown error"
          if (altError instanceof DOMException) {
            altErrorMessage = `${altError.name}: ${altError.message}`
          } else if (altError.message) {
            altErrorMessage = altError.message
          }

          this.showNotification(`Alternative clipboard failed: ${altErrorMessage}. Try manual copy.`, "error")
        }
      }, 'image/png')

    } catch (error) {
      console.error("Alternative clipboard method failed:", error)
      // Show instructions for manual copy
      this.showManualCopyInstructions(dataUrl)
    }
  }

  private showManualCopyInstructions(dataUrl: string) {
    // Create a temporary image element that user can right-click to copy
    const tempImg = document.createElement('img')
    tempImg.src = dataUrl
    tempImg.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      max-width: 80vw;
      max-height: 80vh;
      border: 3px solid #007bff;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 10000;
      cursor: pointer;
    `

    // Add click handler to remove the image
    tempImg.onclick = () => {
      document.body.removeChild(tempImg)
      document.body.removeChild(overlay)
    }

    // Create overlay
    const overlay = document.createElement('div')
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.7);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
    `

    overlay.onclick = () => {
      document.body.removeChild(tempImg)
      document.body.removeChild(overlay)
    }

    document.body.appendChild(overlay)
    document.body.appendChild(tempImg)

    this.showNotification("Right-click the image and select 'Copy Image' to copy to clipboard", "error")
  }

  private async combineAndCopyScreenshots(pageWidth: number, pageHeight: number, viewportWidth: number, viewportHeight: number, copyToClipboard: boolean = true): Promise<string> {
    // Create canvas to combine screenshots
    const canvas = document.createElement("canvas")
    canvas.width = pageWidth
    canvas.height = pageHeight
    const ctx = canvas.getContext("2d")

    if (!ctx) {
      throw new Error("Could not get canvas context")
    }

    // Load and draw each screenshot
    for (const screenshot of this.screenshots) {
      const img = new Image()
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = screenshot.dataUrl
      })

      ctx.drawImage(
        img,
        screenshot.scrollPosition.x,
        screenshot.scrollPosition.y,
        viewportWidth,
        viewportHeight
      )
    }

    // Convert canvas to data URL
    const finalDataUrl = canvas.toDataURL("image/png")

    // Optionally copy to clipboard
    if (copyToClipboard) {
      await this.copyToClipboard(finalDataUrl)
    }

    return finalDataUrl
  }

  private async waitForScroll(targetX: number, targetY: number): Promise<void> {
    return new Promise((resolve) => {
      const checkScroll = () => {
        if (Math.abs(window.scrollX - targetX) < 5 && Math.abs(window.scrollY - targetY) < 5) {
          resolve()
        } else {
          requestAnimationFrame(checkScroll)
        }
      }
      checkScroll()
    })
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  public showNotification(message: string, type: "success" | "error" | "info") {
    // Create a simple notification
    const notification = document.createElement("div")
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: ${type === "success" ? "#4CAF50" : type === "info" ? "#2196F3" : "#f44336"};
      color: white;
      border-radius: 4px;
      z-index: 10000;
      font-family: Arial, sans-serif;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `
    notification.textContent = message
    document.body.appendChild(notification)

    // Remove notification after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification)
      }
    }, 3000)
  }
}

// Create instance and listen for messages
const screenshotHandler = new FullPageScreenshot()

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Content script received message:", message)

  if (message.action === "capture-full-page") {
    console.log("Starting full page capture...")
    screenshotHandler.captureFullPage()
  } else if (message.action === "capture-visible-area") {
    console.log("Starting visible area capture...")
    screenshotHandler.captureVisibleArea()
  } else if (message.action === "clipboard-success") {
    console.log("Clipboard copy successful:", message.message)
    screenshotHandler.showNotification(message.message, "success")
  } else if (message.action === "clipboard-error") {
    console.log("Clipboard copy failed:", message.error)
    screenshotHandler.showNotification("Please click the extension icon and use 'Quick Capture' button for clipboard access", "error")
  } else if (message.action === "capture-full-page-return-data") {
    console.log("Content script received full page capture request for popup")

    // Capture full page and return data directly (no clipboard copy)
    screenshotHandler.captureFullPage(false).then(dataUrl => {
      if (dataUrl) {
        sendResponse({ success: true, dataUrl: dataUrl })
      } else {
        sendResponse({ success: false, error: "Full page capture failed" })
      }
    }).catch(error => {
      console.error("Full page capture for popup failed:", error)
      sendResponse({ success: false, error: error.message })
    })

    return true // Keep message channel open for async response
  }
})

console.log("Screenshot handler content script loaded")

export {}
