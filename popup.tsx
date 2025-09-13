import { useState } from "react"

function IndexPopup() {
  const [isCapturing, setIsCapturing] = useState(false)
  const [status, setStatus] = useState("")

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

  const captureScreenshot = async (mode: "full" | "visible" = "full") => {
    if (isCapturing) return

    setIsCapturing(true)
    setStatus(mode === "full" ? "Capturing full page..." : "Capturing visible area...")

    try {
      // Send message to background script to start capture
      const action = mode === "full" ? "capture-full-page" : "capture-visible-area"

      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action })
        setStatus("Screenshot capture initiated! Check the page for progress.")

        // Close popup after a short delay
        setTimeout(() => {
          window.close()
        }, 1500)
      } else {
        setStatus("Error: Chrome extension API not available")
      }

    } catch (error) {
      console.error("Error:", error)
      setStatus("Error: " + error.message)
    } finally {
      setIsCapturing(false)
    }
  }

  const captureAndCopyDirectly = async () => {
    if (isCapturing) return

    setIsCapturing(true)
    setStatus("Capturing screenshot...")

    try {
      // Get the active tab
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })

      if (!activeTab?.id) {
        setStatus("Error: No active tab found")
        return
      }

      // Capture the visible area directly
      const dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, { format: 'png' })

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

    } catch (error) {
      console.error("Direct capture error:", error)
      setStatus("❌ Direct capture failed: " + error.message)
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
        Capture a full page screenshot and copy it to your clipboard.
      </p>

      <div style={{ marginBottom: "16px" }}>
        <strong>Keyboard Shortcut:</strong>
        <br />
        <code style={{ background: "#f5f5f5", padding: "2px 6px", borderRadius: "3px" }}>
          Ctrl+Shift+S (Cmd+Shift+S on Mac)
        </code>
      </div>

      <button
        onClick={() => captureScreenshot("full")}
        disabled={isCapturing}
        style={{
          width: "100%",
          padding: "12px",
          backgroundColor: isCapturing ? "#ccc" : "#4CAF50",
          color: "white",
          border: "none",
          borderRadius: "4px",
          fontSize: "16px",
          cursor: isCapturing ? "not-allowed" : "pointer",
          marginBottom: "8px"
        }}>
        {isCapturing ? "Capturing..." : "Capture Full Page"}
      </button>

      <button
        onClick={() => captureScreenshot("visible")}
        disabled={isCapturing}
        style={{
          width: "100%",
          padding: "10px",
          backgroundColor: isCapturing ? "#ccc" : "#2196F3",
          color: "white",
          border: "none",
          borderRadius: "4px",
          fontSize: "14px",
          cursor: isCapturing ? "not-allowed" : "pointer",
          marginBottom: "8px"
        }}>
        {isCapturing ? "Capturing..." : "Quick Capture (Visible Area)"}
      </button>

      <button
        onClick={captureAndCopyDirectly}
        disabled={isCapturing}
        style={{
          width: "100%",
          padding: "10px",
          backgroundColor: isCapturing ? "#ccc" : "#9C27B0",
          color: "white",
          border: "none",
          borderRadius: "4px",
          fontSize: "14px",
          cursor: isCapturing ? "not-allowed" : "pointer",
          marginBottom: "8px",
          fontWeight: "bold"
        }}>
        {isCapturing ? "Capturing..." : "🎯 Direct Capture & Copy"}
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
          marginBottom: "12px"
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
