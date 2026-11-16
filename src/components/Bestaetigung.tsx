import { useCallback, useRef, useState } from 'react'

// Bestätigungsdialog im App-Design, Ersatz für window.confirm (Browser-Popup).
//
// Nutzung:
//   const [fragen, dialog] = useBestaetigung()
//   ...
//   if (!await fragen('Wirklich löschen?', { ok: 'Löschen', gefahr: true })) return
//   ...
//   return (<div> ... {dialog} </div>)
//
// Der Text darf Zeilenumbrüche (\n) enthalten. Es ist immer nur ein Dialog offen.

interface Optionen { titel?: string; ok?: string; abbrechen?: string; gefahr?: boolean }
interface Offen extends Optionen { text: string }

export function useBestaetigung(): [(text: string, optionen?: Optionen) => Promise<boolean>, React.ReactNode] {
  const [offen, setOffen] = useState<Offen | null>(null)
  const aufloesen = useRef<((ok: boolean) => void) | null>(null)

  const fragen = useCallback((text: string, optionen: Optionen = {}) => {
    // Ein noch offener Dialog gilt als abgebrochen
    aufloesen.current?.(false)
    return new Promise<boolean>(resolve => {
      aufloesen.current = resolve
      setOffen({ text, ...optionen })
    })
  }, [])

  function antworten(ok: boolean) {
    aufloesen.current?.(ok)
    aufloesen.current = null
    setOffen(null)
  }

  const dialog = offen ? (
    <div role="dialog" aria-modal="true" onClick={() => antworten(false)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 340, width: '100%' }}>
        <p style={{ fontFamily: 'Lexend,sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 8, color: '#1a1a1a' }}>{offen.titel ?? 'Bitte bestätigen'}</p>
        <p style={{ fontSize: 13, color: '#555', marginBottom: 20, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{offen.text}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => antworten(false)}
            style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #e5e7eb', background: 'none', fontSize: 13, cursor: 'pointer', color: '#555' }}>
            {offen.abbrechen ?? 'Abbrechen'}
          </button>
          <button onClick={() => antworten(true)} autoFocus
            style={{ flex: 1, padding: 10, borderRadius: 10, border: 'none', background: offen.gefahr ? '#ef4444' : 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Lexend,sans-serif' }}>
            {offen.ok ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return [fragen, dialog]
}
