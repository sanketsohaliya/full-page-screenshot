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

  const captureAndCopyDirectly = async (mode: "visible" | "full" = "visible") => {
    if (isCapturing) return

    setIsCapturing(true)
    setStatus(mode === "full" ? "Capturing full page..." : "Capturing visible area...")

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
      } else {
        // For full page, we'll use the background script but handle clipboard in popup
        setStatus("Initiating full page capture...")

        // Send message to background script for full page capture
        const response = await chrome.runtime.sendMessage({
          action: "capture-full-page-for-popup",
          tabId: activeTab.id
        })

        if (!response?.success || !response?.dataUrl) {
          throw new Error(response?.error || "Full page capture failed")
        }

        dataUrl = response.dataUrl
      }

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
        Capture screenshots with reliable clipboard copying. Choose visible area for quick capture or full page for complete screenshots.
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
