import { useState, useEffect } from "react"

function IndexPopup() {
  const [isCapturing, setIsCapturing] = useState(false)
  const [status, setStatus] = useState("")

  // Listen for messages from content script
  useEffect(() => {
    const messageListener = (message: any) => {
      if (message.action === "capture-complete") {
        setIsCapturing(false)
        setStatus("✅ Screenshot captured and copied to clipboard!")
        // Close popup after success
        setTimeout(() => {
          window.close()
        }, 2000)
      } else if (message.action === "capture-failed") {
        setIsCapturing(false)
        setStatus("❌ Capture failed: " + (message.error || "Unknown error"))
      } else if (message.action === "capture-progress") {
        setStatus(message.message || "Capturing...")
      }
    }

    chrome.runtime.onMessage.addListener(messageListener)

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener)
    }
  }, [])

  const testClipboard = async () => {
    try {
      setStatus("Testing clipboard...")

      // Create simple test image
      const canvas = document.createElement('canvas')
      canvas.width = 100
      canvas.height = 100
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        throw new Error("Could not get canvas context")
      }

      ctx.fillStyle = '#4CAF50'
      ctx.fillRect(0, 0, 100, 100)
      ctx.fillStyle = 'white'
      ctx.font = '16px Arial'
      ctx.fillText('TEST', 30, 55)

      const dataUrl = canvas.toDataURL('image/png')

      // Convert to blob
      const response = await fetch(dataUrl)
      const blob = await response.blob()

      // Copy to clipboard
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ])

      setStatus("✅ Clipboard test successful! Try pasting (Ctrl+V)")

    } catch (error) {
      console.error("Clipboard test error:", error)
      setStatus("❌ Clipboard test failed: " + error.message)
    }
  }

  const captureAndCopyDirectly = async (mode: "visible" | "full" | "region" = "visible") => {
    if (isCapturing) return

    setIsCapturing(true)
    setStatus(
      mode === "full"
        ? "Capturing full page..."
        : mode === "region"
          ? "Select an area on the page..."
          : "Capturing visible area..."
    )

    try {
      // Get the active tab
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })

      if (!activeTab?.id) {
        setStatus("Error: No active tab found")
        return
      }

      let dataUrl: string

      if (mode === "visible") {
        // Capture the visible area directly
        dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, { format: 'png' })
      } else if (mode === "full") {
        // For full page, we'll send a message to trigger the existing full page capture
        setStatus("Initiating full page capture...")

        try {
          // Send message to background script to start full page capture
          await chrome.runtime.sendMessage({ action: "capture-full-page" })

          setStatus("Full page capture in progress... This may take a moment for large pages.")

          // Don't close popup immediately - let the user see the progress
          // The content script will handle the capture and clipboard copying

          return null // Don't try to copy to clipboard here, the content script will handle it

        } catch (error) {
          console.error("Full page capture error:", error)

          if (error.message.includes("Could not establish connection")) {
            setStatus("❌ Please refresh the page and try again. The extension needs to load on the page first.")
          } else {
            setStatus("❌ Full page capture failed: " + error.message)
          }

          return null
        }

      } else if (mode === "region") {
        // Trigger region selection mode in content script
        try {
          await chrome.runtime.sendMessage({ action: "capture-region" })
          setStatus("Region selection activated. Switch to the page.")
          // Do not close popup immediately; allow user to read instructions
          return null
        } catch (error) {
          console.error("Region capture init failed:", error)
          setStatus("❌ Region capture failed: " + error.message)
          return null
        }
      }

      // Only copy to clipboard if we have dataUrl (visible area capture)
      if (dataUrl) {
        setStatus("Copying to clipboard...")

        // Convert to blob and copy to clipboard directly in popup
        const response = await fetch(dataUrl)
        const blob = await response.blob()

        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ])

        setStatus("✅ Screenshot copied to clipboard!")

        // Close popup after success
        setTimeout(() => {
          window.close()
        }, 2000)
      }
      // For full page capture, the popup already closed and content script handles clipboard

    } catch (error) {
      console.error("Direct capture error:", error)
      setStatus("❌ Capture failed: " + error.message)
    } finally {
      setIsCapturing(false)
    }
  }

  return (
    <div
      style={{
        padding: 20,
        minWidth: 300,
        fontFamily: "Arial, sans-serif"
      }}>
      <h2 style={{ margin: "0 0 16px 0", fontSize: "18px", color: "#333" }}>
        Full Page Screenshot
      </h2>

      <p style={{ margin: "0 0 16px 0", fontSize: "14px", color: "#666" }}>
        <strong>📸 Visible Area:</strong> Instant capture & clipboard copy<br/>
        <strong>📄 Full Page:</strong> Complete page capture (refresh page if error occurs)
      </p>

      <div style={{ marginBottom: "16px" }}>
        <strong>Keyboard Shortcut:</strong>
        <br />
        <code style={{ background: "#f5f5f5", padding: "2px 6px", borderRadius: "3px" }}>
          Ctrl+Shift+S (Cmd+Shift+S on Mac)
        </code>
      </div>

      <button
        onClick={() => captureAndCopyDirectly("visible")}
        disabled={isCapturing}
        style={{
          width: "100%",
          padding: "14px",
          backgroundColor: isCapturing ? "#ccc" : "#2196F3",
          color: "white",
          border: "none",
          borderRadius: "6px",
          fontSize: "16px",
          cursor: isCapturing ? "not-allowed" : "pointer",
          marginBottom: "10px",
          fontWeight: "bold"
        }}>
        {isCapturing ? "Capturing..." : "📸 Capture Visible Area"}
      </button>

      <button
        onClick={() => captureAndCopyDirectly("full")}
        disabled={isCapturing}
        style={{
          width: "100%",
          padding: "14px",
          backgroundColor: isCapturing ? "#ccc" : "#4CAF50",
          color: "white",
          border: "none",
          borderRadius: "6px",
          fontSize: "16px",
          cursor: isCapturing ? "not-allowed" : "pointer",
          marginBottom: "16px",
          fontWeight: "bold"
        }}>
        {isCapturing ? "Capturing..." : "📄 Capture Full Page"}
      </button>

      <button
        onClick={() => captureAndCopyDirectly("region")}
        disabled={isCapturing}
        style={{
          width: "100%",
          padding: "14px",
          backgroundColor: isCapturing ? "#ccc" : "#9C27B0",
          color: "white",
          border: "none",
          borderRadius: "6px",
          fontSize: "16px",
          cursor: isCapturing ? "not-allowed" : "pointer",
          marginBottom: "16px",
          fontWeight: "bold"
        }}>
        {isCapturing ? "Activating..." : "✂️ Capture Region"}
      </button>

      <button
        onClick={testClipboard}
        disabled={isCapturing}
        style={{
          width: "100%",
          padding: "8px",
          backgroundColor: "#FF9800",
          color: "white",
          border: "none",
          borderRadius: "4px",
          fontSize: "12px",
          cursor: "pointer",
          marginBottom: "12px",
          opacity: 0.8
        }}>
        Test Clipboard Access
      </button>

      {status && (
        <div style={{
          fontSize: "12px",
          color: status.includes("Error") ? "#f44336" : "#4CAF50",
          textAlign: "center"
        }}>
          {status}
        </div>
      )}

      <footer style={{ fontSize: "12px", color: "#999", textAlign: "center", marginTop: "16px" }}>
        Full Page Screenshot Extension
      </footer>
    </div>
  )
}

export default IndexPopup
