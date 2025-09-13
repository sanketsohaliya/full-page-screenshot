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

  const initiateCapture = async (mode: "visible" | "full" | "region" = "visible") => {
    if (isCapturing) return
    setIsCapturing(true)
    setMode(mode)
    // Close regardless of success so selecting an option always dismisses popup
    const closeSoon = () => { try { window.close() } catch(_) {} }
    setTimeout(closeSoon, 30)
    try {
      if (mode === 'visible') {
        setStatus('Capturing visible area...')
        chrome.runtime.sendMessage({ action: 'capture-visible-area' }).catch(()=>{})
      } else if (mode === 'full') {
        setStatus('Capturing full page...')
        chrome.runtime.sendMessage({ action: 'capture-full-page' }).catch(()=>{})
      } else if (mode === 'region') {
        setStatus('Select region on page...')
        chrome.runtime.sendMessage({ action: 'capture-region' }).catch(()=>{})
      }
    } catch (error) {
      // Even on error we already scheduled close
      console.error('Capture initiation failed:', error)
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
          onClick={() => initiateCapture('visible')}
          compact={compact}
        />
        <ActionButton
          label="Capture Full Page"
          icon="📄"
          color="neutral"
          loading={isCapturing && mode==='full'}
          disabled={isCapturing}
          onClick={() => initiateCapture('full')}
          compact={compact}
        />
        <ActionButton
          label="Capture Region"
          icon="✂️"
          color="neutral"
          loading={isCapturing && mode==='region'}
          disabled={isCapturing}
          onClick={() => initiateCapture('region')}
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
