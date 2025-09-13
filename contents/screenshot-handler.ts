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
  private expectedScreenshots = 0 // Track how many screenshots we expect
  private capturedScreenshots = 0 // Track how many we've received

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
      console.log("Screenshot capture already in progress, resetting...")
      this.isCapturing = false // Reset the flag to allow new captures
    }

    this.isCapturing = true
    this.screenshots = []
    this.capturedScreenshots = 0

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
      console.log(`Loop will go: row 0 to ${verticalScreenshots-1}, col 0 to ${horizontalScreenshots-1}`)

      // No artificial limits - capture the entire page regardless of size
      console.log(`Will capture entire page with ${verticalScreenshots}x${horizontalScreenshots} = ${totalScreenshots} screenshots`)
      this.showNotification(`Starting full page capture (${totalScreenshots} screenshots)...`, "info")

      // Set expected screenshot count
      this.expectedScreenshots = totalScreenshots

      // Send progress to popup
      try {
        chrome.runtime.sendMessage({
          action: "capture-progress",
          message: `Capturing ${totalScreenshots} screenshots...`
        })
      } catch (e) {
        // Popup might be closed, that's ok
      }

      // Set up a global message handler for this capture session
      const expectedScreenshots = totalScreenshots
      let capturedCount = 0

      const globalHandler = (message: any) => {
        if (message.action === "screenshot-captured" && this.isCapturing) {
          console.log(`Global handler: Screenshot ${capturedCount + 1}/${expectedScreenshots} captured`)
          this.screenshots.push({
            dataUrl: message.dataUrl,
            scrollPosition: message.scrollPosition,
            viewportHeight: window.innerHeight,
            viewportWidth: window.innerWidth
          })
          capturedCount++
        }
      }

      chrome.runtime.onMessage.addListener(globalHandler)

      try {
        // Capture screenshots by scrolling with rate limiting
        for (let row = 0; row < verticalScreenshots; row++) {
          console.log(`Starting row ${row}/${verticalScreenshots-1}`)
          for (let col = 0; col < horizontalScreenshots; col++) {
            try {
              const scrollX = col * viewportWidth
              const scrollY = row * viewportHeight

              console.log(`Processing row ${row}, col ${col}: scrolling to ${scrollX},${scrollY}`)

              // Scroll to position
              window.scrollTo(scrollX, scrollY)

              // Wait for scroll to complete and page to render
              await this.waitForScroll(scrollX, scrollY)
              await this.sleep(300) // Wait for rendering

              // Request screenshot from background script
              console.log(`Requesting screenshot ${row * horizontalScreenshots + col + 1}/${expectedScreenshots} at ${scrollX},${scrollY}`)
              chrome.runtime.sendMessage({
                action: "capture-visible-area",
                scrollPosition: { x: scrollX, y: scrollY }
              })

              // Add delay between captures to respect Chrome's rate limit
              // Chrome allows max 2 captures per second, so wait at least 600ms
              await this.sleep(700)
            } catch (error) {
              console.error(`Error in screenshot loop at row ${row}, col ${col}:`, error)
              // Continue with next screenshot
            }
          }
          console.log(`Completed row ${row}`)
        }
        console.log(`All ${verticalScreenshots} rows completed`)

        // Wait for all screenshots to be captured
        console.log("Waiting for all screenshots to be captured...")
        let waitTime = 0
        while (capturedCount < expectedScreenshots && waitTime < 30000) {
          await this.sleep(500)
          waitTime += 500
          console.log(`Waiting... ${capturedCount}/${expectedScreenshots} captured`)
        }

        if (capturedCount < expectedScreenshots) {
          throw new Error(`Timeout: Only captured ${capturedCount}/${expectedScreenshots} screenshots`)
        }

      } catch (outerError) {
        console.error("Error in screenshot capture process:", outerError)
        throw outerError
      } finally {
        chrome.runtime.onMessage.removeListener(globalHandler)
      }

      console.log(`All screenshots captured! Total: ${this.screenshots.length}`)

      // Restore original scroll position
      window.scrollTo(this.originalScrollPosition.x, this.originalScrollPosition.y)

      console.log("About to combine screenshots...")
      // Combine screenshots and optionally copy to clipboard
      const dataUrl = await this.combineAndCopyScreenshots(pageWidth, pageHeight, viewportWidth, viewportHeight, copyToClipboard)
      console.log("Screenshots combined successfully!")
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
        console.log(`Received message:`, message.action, `Expected scroll: ${scrollX},${scrollY}, Got: ${message.scrollPosition?.x},${message.scrollPosition?.y}`)

        if (message.action === "screenshot-captured" &&
            Math.abs(message.scrollPosition.x - scrollX) <= 5 &&
            Math.abs(message.scrollPosition.y - scrollY) <= 5) {
          console.log(`Screenshot matched for position ${scrollX},${scrollY}`)
          clearTimeout(timeout)
          chrome.runtime.onMessage.removeListener(messageHandler)

          this.screenshots.push({
            dataUrl: message.dataUrl,
            scrollPosition: { x: scrollX, y: scrollY },
            viewportHeight: window.innerHeight,
            viewportWidth: window.innerWidth
          })

          console.log(`Screenshot added to collection. Total: ${this.screenshots.length}`)
          resolve()
        } else if (message.action === "screenshot-captured") {
          console.log(`Screenshot position mismatch: expected ${scrollX},${scrollY} but got ${message.scrollPosition?.x},${message.scrollPosition?.y}`)
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
        console.log(`Requesting screenshot for position ${scrollX},${scrollY}`)
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

  private downloadImage(dataUrl: string, filename: string) {
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }



  private async tryAlternativeClipboard(dataUrl: string) {
    try {
      // Ensure document is focused before clipboard operation
      window.focus()
      document.body.focus()

      // Wait a moment for focus to take effect
      await this.sleep(100)

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
          // Double-check focus before clipboard write
          window.focus()
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

    // For full page screenshots, download the image instead of clipboard (more reliable for large images)
    if (copyToClipboard) {
      console.log("Downloading full page screenshot...")
      this.downloadImage(finalDataUrl, `full-page-screenshot-${Date.now()}.png`)
      this.showNotification("Full page screenshot downloaded!", "success")
    }

    return finalDataUrl
  }

  private async waitForScroll(targetX: number, targetY: number): Promise<void> {
    return new Promise((resolve) => {
      let attempts = 0
      const maxAttempts = 60 // Max 1 second at 60fps

      const checkScroll = () => {
        const currentX = window.scrollX
        const currentY = window.scrollY

        // Check if we're close enough OR if we've reached the maximum scroll position
        const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
        const maxScrollX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth)

        const xMatches = Math.abs(currentX - targetX) < 10 || currentX >= maxScrollX
        const yMatches = Math.abs(currentY - targetY) < 10 || currentY >= maxScrollY

        console.log(`Scroll check: target(${targetX},${targetY}) current(${currentX},${currentY}) max(${maxScrollX},${maxScrollY}) attempts:${attempts}`)

        if (xMatches && yMatches) {
          console.log(`Scroll completed: reached target or max scroll position`)
          resolve()
        } else if (attempts >= maxAttempts) {
          console.log(`Scroll timeout: giving up after ${maxAttempts} attempts`)
          resolve() // Don't fail, just continue
        } else {
          attempts++
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

    // Also send message to popup if it's open
    try {
      if (type === "success" && message.includes("clipboard")) {
        chrome.runtime.sendMessage({ action: "capture-complete" })
      } else if (type === "error") {
        chrome.runtime.sendMessage({ action: "capture-failed", error: message })
      }
    } catch (e) {
      // Popup might be closed, that's ok
    }
  }


}

// Create instance and listen for messages
const screenshotHandler = new FullPageScreenshot()

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Content script received message:", message)

  if (message.action === "capture-full-page") {
    console.log("Starting full page capture...")
    // Send progress update to popup
    try {
      chrome.runtime.sendMessage({ action: "capture-progress", message: "Starting full page capture..." })
    } catch (e) {
      // Popup might be closed, that's ok
    }
    screenshotHandler.captureFullPage(true) // Enable clipboard copying
  } else if (message.action === "capture-visible-area") {
    console.log("Starting visible area capture...")
    screenshotHandler.captureVisibleArea()
  } else if (message.action === "clipboard-success") {
    console.log("Clipboard copy successful:", message.message)
    screenshotHandler.showNotification(message.message, "success")
  } else if (message.action === "clipboard-error") {
    console.log("Clipboard copy failed:", message.error)
    screenshotHandler.showNotification("Please click the extension icon and use 'Quick Capture' button for clipboard access", "error")
  }
})

console.log("Screenshot handler content script loaded")

export {}
