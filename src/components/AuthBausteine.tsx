import { ReactNode, CSSProperties } from 'react'

// Gemeinsame Bausteine für Login und Beitreten-Screen

export function Field({ label, icon, children }: { label: string; icon: string; children: ReactNode }) {
  return (
    <div>
      <label style={{ fontSize:10, fontWeight:800, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }}>{label}</label>
      <div style={{ position:'relative' }}>
        <span className="material-symbols-outlined" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:16, color:'#d1d5db', pointerEvents:'none' }}>{icon}</span>
        <div style={{ paddingLeft:36 }}>{children}</div>
      </div>
    </div>
  )
}

export function ConsentBox({ checked, onChange, label, text }: { checked: boolean; onChange: (v: boolean) => void; label: string; text: ReactNode }) {
  return (
    <label style={{ display:'flex', gap:12, cursor:'pointer', alignItems:'flex-start' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width:16, height:16, marginTop:2, accentColor:'var(--primary)', flexShrink:0, cursor:'pointer' }} />
      <div>
        <p style={{ fontSize:12, fontWeight:700, color:'#191c1b' }}>{label} <span style={{ color:'#ef4444' }}>*</span></p>
        <p style={{ fontSize:11, color:'#5d5e61', marginTop:2, lineHeight:1.5 }}>{text}</p>
      </div>
    </label>
  )
}

export const authStyles: Record<string, CSSProperties> = {
  wrap:       { minHeight:'100vh', background:'#f8faf8', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'20px 16px' },
  headline:   { fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:26, color:'var(--primary)', textTransform:'uppercase', letterSpacing:'.08em' },
  card:       { background:'#fff', borderRadius:24, padding:24, width:'100%', boxShadow:'0 2px 16px rgba(0,0,0,.07)', border:'1px solid #f3f4f6' },
  inputStyle: { paddingLeft:36 },
  btnPrimary: { width:'100%', padding:14, background:'var(--primary)', color:'#fff', border:'none', borderRadius:12, fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:14, cursor:'pointer' },
  linkBtn:    { background:'none', border:'none', color:'var(--primary)', fontSize:13, fontWeight:700, cursor:'pointer' },
  errorBox:   { background:'#fef2f2', color:'#ef4444', borderRadius:10, padding:'10px 12px', fontSize:13, fontWeight:500, marginBottom:14, display:'flex', alignItems:'center', gap:8 },
  successBox: { background:'var(--primary-light)', color:'var(--primary)', borderRadius:10, padding:'10px 12px', fontSize:13, fontWeight:500, marginBottom:14, display:'flex', alignItems:'center', gap:8 },
  infoBox:    { background:'var(--primary-light)', borderRadius:10, padding:'10px 12px', display:'flex', alignItems:'flex-start', gap:8 },
  dsCard:     { background:'#f8faf8', borderRadius:12, padding:14, marginBottom:10, border:'1px solid #f3f4f6' },
  backBtn:    { display:'flex', alignItems:'center', gap:6, background:'none', border:'none', color:'#5d5e61', cursor:'pointer', fontSize:13, fontWeight:600, marginBottom:16, padding:0 },
}

/** Logo und Name des Vereins, für Login und Beitreten-Screen */
export function VereinKopf({ logoUrl, name, untertitel, gross }: { logoUrl: string | null; name: string; untertitel: string; gross: boolean }) {
  const kuerzel = name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 3).toUpperCase()
  const d = gross ? 96 : 64
  return (
    <div style={{ textAlign:'center', marginBottom: gross ? 32 : 20 }}>
      <div style={{ width:d, height:d, borderRadius:'50%', background:'#fff', boxShadow:'0 4px 16px rgba(0,0,0,.1)', border:'2px solid var(--primary-light)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px', overflow:'hidden', transition:'all .3s' }}>
        {logoUrl ? (
          <img src={logoUrl} alt={name} style={{ width:'88%', height:'88%', objectFit:'contain' }}
            onError={(e) => { const el = e.target as HTMLImageElement; el.style.display = 'none'; el.parentElement!.textContent = kuerzel }} />
        ) : (
          <span style={{ fontFamily:'Lexend,sans-serif', fontWeight:900, color:'var(--primary)', fontSize:18 }}>{kuerzel}</span>
        )}
      </div>
      <h1 style={authStyles.headline}>{name}</h1>
      <p style={{ color:'#5d5e61', fontSize:13, marginTop:4 }}>{untertitel}</p>
    </div>
  )
}
