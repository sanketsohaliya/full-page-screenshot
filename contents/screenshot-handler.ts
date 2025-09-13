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
  private progressOverlay?: { update: (count:number,total:number)=>void; remove:()=>void }

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
  // Removed start notification (user requested no notification for full page capture)

      // Set expected screenshot count
      this.expectedScreenshots = totalScreenshots

      // Initialize progress overlay (playful dot eater). Avoid trademark imagery; use generic emoji.
      try {
        this.progressOverlay = this.showProgressOverlay(totalScreenshots, 'Capturing full page…')
      } catch(e) {
        console.warn('Progress overlay failed to initialize', e)
      }

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
          try { this.progressOverlay?.update(capturedCount, expectedScreenshots) } catch(_) {}
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
  // Force final 100% progress update before combining
  try { this.progressOverlay?.update(this.expectedScreenshots, this.expectedScreenshots) } catch(_) {}

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
      // Delay removal slightly so user perceives 100% state
      try {
        if (this.progressOverlay) {
          const ref = this.progressOverlay
          setTimeout(()=>{ try { ref.remove() } catch(_) {} }, 450)
        }
      } catch(_) {}
    }
  }

  private showProgressOverlay(total: number, titleText: string = 'Capturing full page…') {
    // Cap displayed dots to a reasonable number
    const maxDots = 40
    const useDots = Math.min(total, maxDots)
    const overlay = document.createElement('div')
    overlay.setAttribute('data-screenshot-progress','')
    overlay.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483646;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;pointer-events:none;'
    const panel = document.createElement('div')
    panel.style.cssText = 'background:rgba(17,20,22,.88);backdrop-filter:blur(6px);padding:10px 14px 12px;border:1px solid #1e2429;border-radius:14px;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:220px;box-shadow:0 4px 18px rgba(0,0,0,.45);'
  const title = document.createElement('div')
  title.textContent = titleText
    title.style.cssText = 'font-size:12px;font-weight:600;letter-spacing:.3px;color:#e7eaec;'
  const meterWrap = document.createElement('div')
  meterWrap.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:center;width:100%;'
  const dotsRow = document.createElement('div')
  dotsRow.style.cssText = 'display:flex;gap:4px;flex-wrap:nowrap;'
    const dots: HTMLSpanElement[] = []
    for (let i=0;i<useDots;i++) {
      const s = document.createElement('span')
      s.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#232a30;display:inline-block;transition:background .25s, transform .25s'
      dots.push(s); dotsRow.appendChild(s)
    }
    meterWrap.append(dotsRow)
    const pct = document.createElement('div')
    pct.style.cssText = 'font-size:11px;color:#7f8a93;letter-spacing:.2px;min-height:14px;'
    panel.append(title, meterWrap, pct)
    overlay.append(panel)
    document.body.appendChild(overlay)

    const update = (count:number, total:number) => {
      if (total <= 0) return
      const ratio = count / total
      // Floor mapping for more intuitive step progression
      const dotsToFill = Math.floor(ratio * useDots)
      for (let i=0; i<useDots; i++) {
        if (i < dotsToFill) {
          dots[i].style.background = '#3b82f6'
          dots[i].style.transform = 'scale(1.18)'
        } else {
          dots[i].style.background = '#232a30'
          dots[i].style.transform = 'scale(1)'
        }
      }
      if (useDots > 0 && count >= total) {
        // Replace last dot with a check indicator
        const last = dots[useDots - 1]
        last.style.background = '#16a34a'
        last.style.transform = 'scale(1.25)'
        last.innerHTML = ''
        last.style.display = 'flex'
        last.style.alignItems = 'center'
        last.style.justifyContent = 'center'
        last.style.color = '#fff'
        last.style.fontSize = '8px'
        last.textContent = '✓'
      }
      pct.textContent = count >= total ? 'Combining screenshots…' : `${count}/${total} (${Math.round(ratio * 100)}%)`
    }

  const remove = () => { overlay.remove() }

    // Initial state
    update(0,total)
    return { update, remove }
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

  private showInteractiveClipboardOption(dataUrl: string) {
    this.showResultOverlay('Full Page Screenshot', dataUrl, 'full-page-screenshot')
  }

  private async copyImageDirectlyToClipboard(dataUrl: string): Promise<void> {
    console.log(`Copying image to clipboard - dataUrl length: ${dataUrl.length}`)
    console.log(`DataUrl preview: ${dataUrl.substring(0, 100)}...`)

    // Convert to blob
    const response = await fetch(dataUrl)
    let blob = await response.blob()

    console.log(`Original blob size: ${(blob.size / (1024 * 1024)).toFixed(2)} MB`)
    console.log(`Original blob type: ${blob.type}`)

    // Compress if too large
    if (blob.size > 8 * 1024 * 1024) {
      console.log("Compressing large image for clipboard...")
      const compressedDataUrl = await this.compressImageForClipboard(dataUrl, blob.size / (1024 * 1024))
      const compressedResponse = await fetch(compressedDataUrl)
      blob = await compressedResponse.blob()
      console.log(`Compressed blob size: ${(blob.size / (1024 * 1024)).toFixed(2)} MB`)
    }

    console.log(`About to copy blob of size ${blob.size} bytes to clipboard`)

    // Copy to clipboard (user interaction context)
    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type]: blob })
    ])

    console.log("Successfully copied to clipboard!")
  }

  private showDebugImage(dataUrl: string, width: number, height: number) {
    // Create a small preview image to verify the combination worked
    const debugImg = document.createElement('img')
    debugImg.src = dataUrl
    debugImg.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      max-width: 200px;
      max-height: 300px;
      border: 2px solid red;
      z-index: 9999;
      background: white;
    `
    debugImg.title = `Combined image: ${width}x${height}`

    document.body.appendChild(debugImg)

    // Remove after 5 seconds
    setTimeout(() => {
      if (debugImg.parentNode) {
        document.body.removeChild(debugImg)
      }
    }, 5000)

    console.log("Debug image shown in top-right corner for 5 seconds")
  }

  private async copyLargeImageToClipboard(dataUrl: string): Promise<void> {
    // Ensure document focus before any clipboard operation
    await this.ensureDocumentFocus()

    // Convert dataUrl to blob to check size
    const response = await fetch(dataUrl)
    const originalBlob = await response.blob()
    const originalSizeMB = originalBlob.size / (1024 * 1024)

    console.log(`Original image size: ${originalSizeMB.toFixed(2)} MB`)

    // If image is larger than 8MB, compress it
    if (originalSizeMB > 8) {
      console.log("Image too large for clipboard, compressing...")
      const compressedDataUrl = await this.compressImageForClipboard(dataUrl, originalSizeMB)
      const compressedResponse = await fetch(compressedDataUrl)
      const compressedBlob = await compressedResponse.blob()
      const compressedSizeMB = compressedBlob.size / (1024 * 1024)

      console.log(`Compressed image size: ${compressedSizeMB.toFixed(2)} MB`)

      // Ensure focus again before clipboard write
      await this.ensureDocumentFocus()

      // Copy compressed image to clipboard
      await navigator.clipboard.write([
        new ClipboardItem({ [compressedBlob.type]: compressedBlob })
      ])
    } else {
      // Image is small enough, copy directly
      console.log("Image size acceptable, copying directly to clipboard")

      // Ensure focus again before clipboard write
      await this.ensureDocumentFocus()

      await navigator.clipboard.write([
        new ClipboardItem({ [originalBlob.type]: originalBlob })
      ])
    }
  }

  private async ensureDocumentFocus(): Promise<void> {
    // Multiple focus attempts to ensure document is focused
    window.focus()
    document.body.focus()

    // Click on the document to ensure focus
    const clickEvent = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true
    })
    document.body.dispatchEvent(clickEvent)

    // Wait for focus to take effect
    await this.sleep(200)

    // Verify focus
    if (!document.hasFocus()) {
      console.log("Document still not focused, trying alternative focus method...")

      // Create a temporary input element and focus it
      const tempInput = document.createElement('input')
      tempInput.style.position = 'fixed'
      tempInput.style.top = '-1000px'
      tempInput.style.opacity = '0'
      document.body.appendChild(tempInput)
      tempInput.focus()
      await this.sleep(100)
      document.body.removeChild(tempInput)
    }

    console.log(`Document focus status: ${document.hasFocus()}`)
  }

  private async compressImageForClipboard(dataUrl: string, originalSizeMB: number): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')!

        // Calculate compression ratio based on original size
        let compressionRatio = 1
        if (originalSizeMB > 20) {
          compressionRatio = 0.4  // Aggressive compression for very large images
        } else if (originalSizeMB > 15) {
          compressionRatio = 0.5
        } else if (originalSizeMB > 10) {
          compressionRatio = 0.6
        } else {
          compressionRatio = 0.7
        }

        const newWidth = Math.floor(img.width * compressionRatio)
        const newHeight = Math.floor(img.height * compressionRatio)

        canvas.width = newWidth
        canvas.height = newHeight

        // Draw compressed image
        ctx.drawImage(img, 0, 0, newWidth, newHeight)

        // Use JPEG with quality based on size
        const quality = originalSizeMB > 15 ? 0.6 : 0.7
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality)

        console.log(`Compressed from ${img.width}x${img.height} to ${newWidth}x${newHeight} (${(compressionRatio * 100).toFixed(0)}% scale, ${(quality * 100).toFixed(0)}% quality)`)
        resolve(compressedDataUrl)
      }
      img.src = dataUrl
    })
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

    // Load and draw each screenshot at correct positions
    console.log(`Combining ${this.screenshots.length} screenshots into ${pageWidth}x${pageHeight} canvas`)

    for (let i = 0; i < this.screenshots.length; i++) {
      const screenshot = this.screenshots[i]
      const img = new Image()
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = screenshot.dataUrl
      })

      // Calculate the correct position in the combined image
      // For vertical stacking: each screenshot goes at y = i * viewportHeight
      const canvasX = 0  // Always start at left edge
      const canvasY = i * viewportHeight  // Stack vertically

      console.log(`Drawing screenshot ${i + 1} at canvas position (${canvasX}, ${canvasY})`)

      ctx.drawImage(
        img,
        canvasX,
        canvasY,
        viewportWidth,
        viewportHeight
      )
    }

    // Convert canvas to data URL
    const finalDataUrl = canvas.toDataURL("image/png")

    // Debug: Log canvas and final image info
    console.log(`Final canvas dimensions: ${canvas.width}x${canvas.height}`)
    console.log(`Final dataUrl length: ${finalDataUrl.length} characters`)
    console.log(`Final dataUrl starts with: ${finalDataUrl.substring(0, 50)}...`)

    // Debug: Temporarily show the combined image to verify it's correct
    this.showDebugImage(finalDataUrl, canvas.width, canvas.height)

    // For full page screenshots, show interactive clipboard option
    if (copyToClipboard) {
      console.log("Showing interactive clipboard option for full page screenshot...")
      this.showInteractiveClipboardOption(finalDataUrl)
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

    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification)
      }
    }, 3000)

    try {
      if (type === "success" && message.includes("clipboard")) {
        chrome.runtime.sendMessage({ action: "capture-complete" })
      } else if (type === "error") {
        chrome.runtime.sendMessage({ action: "capture-failed", error: message })
      }
    } catch (e) {}
  }

  // ================= REGION CAPTURE FEATURE =================
  private regionOverlay: HTMLDivElement | null = null
  private regionSelectionBox: HTMLDivElement | null = null
  private regionStart: { x: number; y: number } | null = null
  private regionCurrent: { x: number; y: number } | null = null
  private regionLabel: HTMLDivElement | null = null
  private regionActive = false
  private regionUsesPageCoords = true

  public startRegionSelection() {
    if (this.regionActive) return
    this.regionActive = true
    this.createRegionOverlay()
    this.showNotification("Drag to select area. Press ESC to cancel.", "info")
  }

  private createRegionOverlay() {
    const pageWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
      document.documentElement.clientWidth
    )
    const pageHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      document.documentElement.clientHeight
    )

    this.regionOverlay = document.createElement('div')
    this.regionOverlay.style.cssText = `
      position: absolute;
      top:0; left:0;
      width:${pageWidth}px; height:${pageHeight}px;
      background: rgba(0,0,0,0.08);
      cursor: crosshair;
      z-index: 2147483646;
      pointer-events:none;
    `

    this.regionSelectionBox = document.createElement('div')
    this.regionSelectionBox.style.cssText = `
      position: absolute;
      border: 2px solid #9C27B0;
      background: rgba(156,39,176,0.18);
      box-shadow: 0 0 0 1px rgba(255,255,255,0.35);
      pointer-events: none;
      z-index: 2147483647;
    `

    this.regionLabel = document.createElement('div')
    this.regionLabel.style.cssText = `
      position: absolute;
      padding: 4px 8px;
      background: #9C27B0;
      color: white;
      font: 12px/1 system-ui, sans-serif;
      border-radius: 4px;
      transform: translate(-50%, -140%);
      pointer-events: none;
      z-index: 2147483648;
      white-space: nowrap;
    `

    document.body.appendChild(this.regionOverlay)
    document.body.appendChild(this.regionSelectionBox)
    document.body.appendChild(this.regionLabel)

    // Prevent page text selection / cursor artifacts while dragging
    const selectionBlockStyleId = '__fps_region_selection_block__'
    let styleEl = document.getElementById(selectionBlockStyleId) as HTMLStyleElement | null
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = selectionBlockStyleId
      styleEl.textContent = `*{user-select:none!important;-webkit-user-select:none!important;} body{cursor:crosshair!important;} html{cursor:crosshair!important;}`
      document.head.appendChild(styleEl)
    }

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      // pageX/pageY allow selection larger than viewport while scrolling
      this.regionStart = { x: e.pageX, y: e.pageY }
      this.regionCurrent = { ...this.regionStart }
      this.updateRegionUI()
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!this.regionStart) return
      this.regionCurrent = { x: e.pageX, y: e.pageY }
      this.updateRegionUI()
      this.maybeAutoScroll(e)
    }

    const onMouseUp = async () => {
      if (!this.regionStart || !this.regionCurrent) return
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('mousemove', onMouseMove, true)
      document.removeEventListener('mouseup', onMouseUp, true)
      document.removeEventListener('keydown', onKeyDown, true)

      const rect = this.getNormalizedRegion()
      this.cleanupRegionUI()
      this.regionActive = false

      // Important: wait a frame so Chrome repaints without overlay/border before capture
      await this.sleep(80)

  // Restore selection ability
  const styleNode = document.getElementById(selectionBlockStyleId)
  if (styleNode) styleNode.remove()

      if (rect.width < 5 || rect.height < 5) {
        this.showNotification('Selection too small, cancelled.', 'error')
        return
      }
      try {
        await this.captureRegion(rect)
      } catch (err: any) {
        console.error('Region capture failed:', err)
        this.showNotification('Region capture failed: ' + err.message, 'error')
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('mousedown', onMouseDown, true)
        document.removeEventListener('mousemove', onMouseMove, true)
        document.removeEventListener('mouseup', onMouseUp, true)
        document.removeEventListener('keydown', onKeyDown, true)
        this.cleanupRegionUI()
        this.regionActive = false
        this.showNotification('Region capture cancelled', 'error')
        const styleNode = document.getElementById(selectionBlockStyleId)
        if (styleNode) styleNode.remove()
      }
    }

    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('mousemove', onMouseMove, true)
    document.addEventListener('mouseup', onMouseUp, true)
    document.addEventListener('keydown', onKeyDown, true)
  }

  // Auto-scroll when dragging near viewport edges
  private autoScrollInterval: number | null = null
  private lastAutoScrollCheck = 0
  private maybeAutoScroll(e: MouseEvent) {
    const edgeThreshold = 60
    const maxStep = 35
    const now = performance.now()
    if (now - this.lastAutoScrollCheck < 16) return
    this.lastAutoScrollCheck = now

    const viewportTop = window.scrollY
    const viewportBottom = viewportTop + window.innerHeight
    const y = e.clientY // viewport coordinates

    let deltaY = 0
    if (y < edgeThreshold) {
      deltaY = -Math.min(maxStep, (edgeThreshold - y) * 0.6)
    } else if (window.innerHeight - y < edgeThreshold) {
      deltaY = Math.min(maxStep, (edgeThreshold - (window.innerHeight - y)) * 0.6)
    }

    if (deltaY !== 0) {
      window.scrollBy({ top: deltaY, behavior: 'auto' })
      // After scrolling, refresh current pointer position to keep rectangle accurate
      if (this.regionCurrent) {
        this.regionCurrent = { x: e.pageX, y: e.pageY + (deltaY) }
        this.updateRegionUI()
      }
    }
  }

  private updateRegionUI() {
    if (!this.regionStart || !this.regionCurrent || !this.regionSelectionBox || !this.regionLabel) return
    const rect = this.getNormalizedRegion()
    this.regionSelectionBox.style.left = rect.x + 'px'
    this.regionSelectionBox.style.top = rect.y + 'px'
    this.regionSelectionBox.style.width = rect.width + 'px'
    this.regionSelectionBox.style.height = rect.height + 'px'
    this.regionLabel.style.left = (rect.x + rect.width / 2) + 'px'
    this.regionLabel.style.top = rect.y + 'px'
    this.regionLabel.textContent = `${rect.width} x ${rect.height}`
  }

  private getNormalizedRegion() {
    const x1 = this.regionStart!.x
    const y1 = this.regionStart!.y
    const x2 = this.regionCurrent!.x
    const y2 = this.regionCurrent!.y
    const left = Math.min(x1, x2)
    const top = Math.min(y1, y2)
    const width = Math.abs(x1 - x2)
    const height = Math.abs(y1 - y2)
    return { x: left, y: top, width, height }
  }

  private cleanupRegionUI() {
    this.regionSelectionBox?.remove()
    this.regionOverlay?.remove()
    this.regionLabel?.remove()
    this.regionSelectionBox = null
    this.regionOverlay = null
    this.regionLabel = null
    this.regionStart = null
    this.regionCurrent = null
  }

  private async captureRegion(rect: { x: number; y: number; width: number; height: number }) {
    const scrollX = window.scrollX
    const scrollY = window.scrollY
    // Safety: small delay to ensure any transient UI is gone
    await this.sleep(20)

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const currentScrollX = window.scrollX
    const currentScrollY = window.scrollY

    const fullyVisible =
      rect.x >= currentScrollX &&
      rect.y >= currentScrollY &&
      rect.x + rect.width <= currentScrollX + viewportWidth &&
      rect.y + rect.height <= currentScrollY + viewportHeight

    if (fullyVisible && rect.width <= viewportWidth && rect.height <= viewportHeight) {
      // Single capture path with progress overlay (1 step)
      let localOverlay: {update:(c:number,t:number)=>void;remove:()=>void}|undefined
      try { localOverlay = this.showProgressOverlay(1, 'Capturing region…') } catch(_) {}
      try {
        const dataUrl: string = await new Promise((resolve, reject) => {
          const handler = (message: any) => {
            if (message.action === 'screenshot-captured') {
              chrome.runtime.onMessage.removeListener(handler)
              resolve(message.dataUrl)
            } else if (message.action === 'screenshot-error') {
              chrome.runtime.onMessage.removeListener(handler)
              reject(new Error(message.error))
            }
          }
          chrome.runtime.onMessage.addListener(handler)
          chrome.runtime.sendMessage({ action: 'capture-visible-area', scrollPosition: { x: currentScrollX, y: currentScrollY } })
        })
        localOverlay?.update(1,1)
        const relativeViewportRect = { x: rect.x - currentScrollX, y: rect.y - currentScrollY, width: rect.width, height: rect.height }
        const cropped = await this.cropDataUrl(dataUrl, relativeViewportRect)
        this.showRegionResultOptions(cropped)
      } finally {
        try { if (localOverlay) { const ref = localOverlay; setTimeout(()=>{ try { ref.remove() } catch(_){} }, 400) } } catch(_) {}
      }
    } else {
      await this.captureRegionMultiScroll(rect)
    }
  }

  private async captureRegionMultiScroll(rect: { x: number; y: number; width: number; height: number }) {
    const original = { x: window.scrollX, y: window.scrollY }
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const dpr = devicePixelRatio || 1
    const xTiles: number[] = []
    const yTiles: number[] = []

    const startX = Math.floor(rect.x / viewportWidth) * viewportWidth
    const startY = Math.floor(rect.y / viewportHeight) * viewportHeight
    for (let x = startX; x < rect.x + rect.width; x += viewportWidth) xTiles.push(x)
    for (let y = startY; y < rect.y + rect.height; y += viewportHeight) yTiles.push(y)

    const tiles: { dataUrl: string; x: number; y: number }[] = []

    const captureTile = (scrollX: number, scrollY: number) => new Promise<void>(async (resolve) => {
      window.scrollTo(scrollX, scrollY)
      await this.waitForScroll(scrollX, scrollY)
      await this.sleep(250)
      const dataUrl: string = await new Promise((res, rej) => {
        const handler = (message: any) => {
          if (message.action === 'screenshot-captured' && Math.abs(message.scrollPosition.x - scrollX) < 5 && Math.abs(message.scrollPosition.y - scrollY) < 5) {
            chrome.runtime.onMessage.removeListener(handler)
            res(message.dataUrl)
          } else if (message.action === 'screenshot-error') {
            chrome.runtime.onMessage.removeListener(handler)
            rej(new Error(message.error))
          }
        }
        chrome.runtime.onMessage.addListener(handler)
        chrome.runtime.sendMessage({ action: 'capture-visible-area', scrollPosition: { x: scrollX, y: scrollY } })
      })
      tiles.push({ dataUrl, x: scrollX, y: scrollY })
      await this.sleep(650) // rate-limit buffer
      resolve()
    })

    // Region progress overlay across tiles
    const totalTiles = xTiles.length * yTiles.length
    let regionOverlayRef: {update:(c:number,t:number)=>void;remove:()=>void}|undefined
    try { regionOverlayRef = this.showProgressOverlay(totalTiles, 'Capturing region…') } catch(_) {}

    let capturedTiles = 0
    for (const y of yTiles) {
      for (const x of xTiles) {
        try {
          await captureTile(x, y)
          capturedTiles++
          try { regionOverlayRef?.update(capturedTiles, totalTiles) } catch(_) {}
        } catch (e) {
          console.error('Tile capture failed', x, y, e)
        }
      }
    }

    window.scrollTo(original.x, original.y)

    // Compose only the region
    const canvas = document.createElement('canvas')
    canvas.width = rect.width
    canvas.height = rect.height
    const ctx = canvas.getContext('2d')!

    for (const tile of tiles) {
      const overlapX1 = Math.max(rect.x, tile.x)
      const overlapY1 = Math.max(rect.y, tile.y)
      const overlapX2 = Math.min(rect.x + rect.width, tile.x + viewportWidth)
      const overlapY2 = Math.min(rect.y + rect.height, tile.y + viewportHeight)
      const ow = overlapX2 - overlapX1
      const oh = overlapY2 - overlapY1
      if (ow <= 0 || oh <= 0) continue
      const img = new Image()
      await new Promise((res, rej) => { img.onload = () => res(null); img.onerror = rej; img.src = tile.dataUrl })
      const sx = (overlapX1 - tile.x) * dpr
      const sy = (overlapY1 - tile.y) * dpr
      ctx.drawImage(img, sx, sy, ow * dpr, oh * dpr, overlapX1 - rect.x, overlapY1 - rect.y, ow, oh)
    }

    const finalDataUrl = canvas.toDataURL('image/png')
    try { regionOverlayRef?.update(totalTiles,totalTiles) } catch(_) {}
    this.showRegionResultOptions(finalDataUrl)
    try { if (regionOverlayRef) { const ref = regionOverlayRef; setTimeout(()=>{ try { ref.remove() } catch(_){} }, 450) } } catch(_) {}
  }

  private async cropDataUrl(dataUrl: string, rect: { x: number; y: number; width: number; height: number }): Promise<string> {
    const img = new Image()
    img.src = dataUrl
    await new Promise((res, rej) => { img.onload = () => res(null); img.onerror = rej })
    const canvas = document.createElement('canvas')
    canvas.width = rect.width
    canvas.height = rect.height
    const ctx = canvas.getContext('2d')!
    const scale = devicePixelRatio || 1
    ctx.drawImage(
      img,
      rect.x * scale,
      rect.y * scale,
      rect.width * scale,
      rect.height * scale,
      0,
      0,
      rect.width,
      rect.height
    )
    return canvas.toDataURL('image/png')
  }

  private showRegionResultOptions(dataUrl: string) {
    this.showResultOverlay('Region Screenshot', dataUrl, 'region-screenshot')
  }

  private showResultOverlay(titleText: string, dataUrl: string, filenameBase: string) {
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;'
    const panel = document.createElement('div')
    panel.style.cssText = 'background:#111416;border:1px solid #1e2429;border-radius:14px;max-width:560px;max-height:80vh;display:flex;flex-direction:column;gap:14px;padding:16px 18px;box-shadow:0 6px 24px rgba(0,0,0,.45);width:min(90vw,560px);'
    const title = document.createElement('div')
    title.textContent = titleText
    title.style.cssText = 'font-size:14px;font-weight:600;letter-spacing:.3px;color:#e7eaec;'
    const preview = document.createElement('img')
    preview.src = dataUrl
    preview.style.cssText = 'max-width:100%;max-height:50vh;border:1px solid #232a30;border-radius:10px;background:#0f1214;object-fit:contain;'
    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;gap:10px;'
    const status = document.createElement('div')
    status.style.cssText = 'font-size:11px;min-height:16px;color:#7f8a93;letter-spacing:.2px;'
    const mkBtn = (label:string)=>{ const b=document.createElement('button'); b.textContent=label; b.style.cssText='flex:1;background:#151b20;border:none;border-radius:10px;color:#e7eaec;font-size:12.5px;font-weight:500;padding:10px 12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:background .15s;box-shadow:0 1px 2px rgba(0,0,0,.35)'; b.onmouseenter=()=>{if(!b.disabled)b.style.background='#1b2329'}; b.onmouseleave=()=>{if(!b.disabled)b.style.background='#151b20'}; b.onmousedown=()=>{if(!b.disabled)b.style.background='#202a31'}; b.onmouseup=()=>{if(!b.disabled)b.style.background='#1b2329'}; return b }
    const copyBtn = mkBtn('Copy')
    const downloadBtn = mkBtn('Download')
    const closeBtn = mkBtn('Close')
    actions.append(copyBtn, downloadBtn, closeBtn)
    panel.append(title, preview, actions, status)
    overlay.append(panel)
    document.body.appendChild(overlay)
    copyBtn.onclick = async ()=>{ copyBtn.disabled=true; copyBtn.textContent='Copying…'; status.textContent='Copying to clipboard...'; try { await this.copyImageDirectlyToClipboard(dataUrl); copyBtn.textContent='Copied'; status.textContent='Copied.'; setTimeout(()=>overlay.remove(),650) } catch(e:any){ copyBtn.textContent='Failed'; status.textContent='Copy failed'; copyBtn.disabled=false } }
    downloadBtn.onclick = ()=>{ this.downloadImage(dataUrl, `${filenameBase}-${Date.now()}.png`); status.textContent='Downloaded.' }
    closeBtn.onclick = ()=> overlay.remove()
    overlay.onclick = (e)=>{ if(e.target===overlay) overlay.remove() }
  }

  public async captureVisibleAreaOverlay(): Promise<void> {
    if (this.isCapturing) return
    this.isCapturing = true
    this.screenshots = []
    try {
      await this.captureCurrentView(window.scrollX, window.scrollY)
      if (this.screenshots.length) {
        const dataUrl = this.screenshots[0].dataUrl
        this.showResultOverlay('Visible Area Screenshot', dataUrl, 'visible-area-screenshot')
      }
    } catch(e:any) {
      this.showNotification('Visible area capture failed: '+ e.message, 'error')
    } finally {
      this.isCapturing = false
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
    screenshotHandler.captureVisibleAreaOverlay()
  } else if (message.action === 'capture-region') {
    console.log('Starting region selection mode...')
    screenshotHandler.startRegionSelection()
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
