import { useState } from "react"

function SimplePopup() {
  const [status, setStatus] = useState("")

  const captureScreenshot = async () => {
    try {
      setStatus("Capturing screenshot...")
      
      // Send message to background script
      chrome.runtime.sendMessage({ action: "capture-visible-area" })
      
      setStatus("Screenshot capture initiated!")
      
      // Close popup after delay
      setTimeout(() => {
        window.close()
      }, 1500)
      
    } catch (error) {
      console.error("Error:", error)
      setStatus("Error: " + error.message)
    }
  }

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
      
      setStatus("✅ Clipboard test successful!")
      
    } catch (error) {
      console.error("Clipboard test error:", error)
      setStatus("❌ Clipboard test failed: " + error.message)
    }
  }

  return (
    <div style={{
      padding: 20,
      minWidth: 300,
      fontFamily: "Arial, sans-serif"
    }}>
      <h2 style={{ margin: "0 0 16px 0", fontSize: "18px", color: "#333" }}>
        Screenshot Extension
      </h2>

      <button
        onClick={captureScreenshot}
        style={{
          width: "100%",
          padding: "12px",
          backgroundColor: "#2196F3",
          color: "white",
          border: "none",
          borderRadius: "4px",
          fontSize: "16px",
          cursor: "pointer",
          marginBottom: "8px"
        }}>
        Capture Screenshot
      </button>

      <button
        onClick={testClipboard}
        style={{
          width: "100%",
          padding: "10px",
          backgroundColor: "#FF9800",
          color: "white",
          border: "none",
          borderRadius: "4px",
          fontSize: "14px",
          cursor: "pointer",
          marginBottom: "12px"
        }}>
        Test Clipboard
      </button>

      {status && (
        <div style={{
          fontSize: "12px",
          color: status.includes("Error") || status.includes("❌") ? "#f44336" : "#4CAF50",
          textAlign: "center",
          padding: "8px",
          backgroundColor: "#f5f5f5",
          borderRadius: "4px"
        }}>
          {status}
        </div>
      )}
    </div>
  )
}

export default SimplePopup
