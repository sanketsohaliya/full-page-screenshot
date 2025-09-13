import { useState, useEffect } from "react"

function IndexPopup() {
  const [isCapturing, setIsCapturing] = useState(false)
  const [status, setStatus] = useState("")
  const [mode, setMode] = useState<"visible" | "full" | "region" | null>(null)
  // Force dark minimal mode
  const dark = true
  const compact = false

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
    setMode(mode)

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

  const rootStyle: React.CSSProperties = {
    '--bg': '#111416',
    '--border': '#1e2429',
    '--border-soft': '#232a30',
    '--text': '#e7eaec',
    '--text-dim': '#7f8a93',
    '--focus': '#2563eb',
    background: '#111416',
    color: '#e7eaec',
    padding: 14,
    minWidth: 280,
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
  } as React.CSSProperties

  // Removed toggle button styles (no toggles now)

  return (
    <div style={rootStyle}>
      <style>{`html,body{margin:0;padding:0;background:#111416 !important;} body{min-width:0;} ::selection{background:#2563eb33;} `}</style>
      <style>{`
        button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
        .grid { display:grid; gap:8px; }
        .status-line { font-size:11px; min-height:18px; margin-top:8px; letter-spacing:.2px; }
        .action-btn:hover:not([disabled]) { background:#1b2329; }
        .action-btn:active:not([disabled]) { background:#202a31; }
      `}</style>
      <div style={{fontSize:13, fontWeight:600, marginBottom:8, letterSpacing:.4}}>Screenshot</div>
      <div className="grid" aria-label="Capture actions">
        <ActionButton
          label="Capture Visible Area"
          icon="📸"
          color="neutral"
          loading={isCapturing && mode==='visible'}
          disabled={isCapturing}
          onClick={() => captureAndCopyDirectly('visible')}
          compact={compact}
        />
        <ActionButton
          label="Capture Full Page"
          icon="📄"
          color="neutral"
          loading={isCapturing && mode==='full'}
          disabled={isCapturing}
          onClick={() => captureAndCopyDirectly('full')}
          compact={compact}
        />
        <ActionButton
          label="Capture Region"
          icon="✂️"
          color="neutral"
          loading={isCapturing && mode==='region'}
          disabled={isCapturing}
          onClick={() => captureAndCopyDirectly('region')}
          compact={compact}
        />
      </div>

      <div className="status-line" role="status" aria-live="polite" style={{color: status.startsWith('❌')? '#d32f2f': status.startsWith('✅')? '#2e7d32':'var(--text-dim)'}}>
        {status || 'Ready'}
      </div>
    </div>
  )
}

interface ActionButtonProps { label: string; icon: string | null; color: 'neutral'; onClick: () => void; disabled?: boolean; loading?: boolean; compact?: boolean }
const ActionButton = ({ label, icon, color, onClick, disabled, loading, compact }: ActionButtonProps) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-busy={loading}
      style={{
        width:'100%',
        padding:'9px 10px',
        background: disabled? '#1a2126': '#151b20',
        color:'var(--text)',
        border:'none',
        borderRadius:10,
        fontSize:12.5,
        fontWeight:500,
        letterSpacing:'.2px',
        display:'flex',
        alignItems:'center',
        gap:10,
        justifyContent:'flex-start',
        cursor: disabled? 'not-allowed':'pointer',
        position:'relative',
        overflow:'hidden',
        transition:'background .15s, filter .15s'
      }}
      className="action-btn"
    >
  {icon && <span style={{opacity: loading? .55:1, fontSize:14, width:18, textAlign:'center'}}>{icon}</span>}
  <span style={{flex:1, textAlign:'left', whiteSpace:'nowrap'}}>{loading? 'Working...' : label}</span>
    </button>
  )
}

export default IndexPopup
