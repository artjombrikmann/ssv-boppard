import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { Profile, Schichtbelegung, Einstellungen } from "../types";

interface Props {
  profile: Profile;
  onProfileUpdate: (updated: Profile) => void;
  onTabChange: (tab: string) => void;
}

const BADGES = [
  { name: "Vereinshelfer", icon: "🟢", req: 10 },
  { name: "Schichtprofi", icon: "⭐", req: 50 },
  { name: "Vereinsheld", icon: "🏆", req: 150 },
  { name: "Legende", icon: "🦁", req: 300 },
];

const VOUCHERS = [
  { id: "food", label: "Verzehrgutschein", icon: "🍺", desc: "Am Vereinsheim & Veranstaltungen", bg: "#0a1a0f", accent: '#61de8a', ptsKey: "food_pts" as keyof Einstellungen, valKey: "food_val" as keyof Einstellungen },
  { id: "shop", label: "Fanshop-Gutschein", icon: "👕", desc: "Im SSV Boppard Online-Fanshop", bg: "#0a0a1a", accent: '#92ccff', ptsKey: "shop_pts" as keyof Einstellungen, valKey: "shop_val" as keyof Einstellungen },
];

export default function Profil({ profile, onProfileUpdate }: Props) {
  const [bookings, setBookings] = useState<Schichtbelegung[]>([]);
  const [settings, setSettings] = useState<Einstellungen>({ id:1, food_pts:200, food_val:10, shop_pts:300, shop_val:15 });
  const [redeemType, setRedeemType] = useState<(typeof VOUCHERS)[0] | null>(null);
  const [done, setDone] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [displayName, setDisplayName] = useState(profile.display_name || profile.name?.split(" ")[0] || "");
  const [newPw, setNewPw] = useState(""); const [confirmPw, setConfirmPw] = useState("");
  const [editMsg, setEditMsg] = useState(""); const [editLoading, setEditLoading] = useState(false);
  const [loeschenSchritt, setLoeschenSchritt] = useState<0|1|2>(0); const [loeschenLaed, setLoeschenLaed] = useState(false);

  useEffect(() => {
    supabase.from("schichtbelegungen").select("*, schichten(bezeichnung,punkte,veranstaltungen(name))").eq("mitglied_id", profile.id).then(({ data }) => setBookings(data ?? []));
    supabase.from("einstellungen").select("*").single().then(({ data }) => { if (data) setSettings(data); });
  }, []);

  async function handleRedeem(v: (typeof VOUCHERS)[0]) {
    const req = settings[v.ptsKey] as number;
    if ((profile.punkte ?? 0) < req) return;
    await supabase.from("gutschein_anfragen").insert({ mitglied_id: profile.id, typ: v.id, punkte: req, status: "genehmigt" });
    await supabase.rpc("punkte_abziehen", { user_id: profile.id, amount: req });
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      try {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gutschein-anfrage`, {
          method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ mitglied_id: profile.id, typ: v.id, punkte: req }),
        });
      } catch (err) { console.error(err); }
    }
    onProfileUpdate({ ...profile, punkte: (profile.punkte ?? 0) - req });
    setRedeemType(null); setDone(true);
  }

  async function saveDisplayName() {
    if (!displayName.trim()) { setEditMsg("❌ Name darf nicht leer sein."); return; }
    setEditLoading(true);
    const { error } = await supabase.from("profiles").update({ display_name: displayName.trim() }).eq("id", profile.id);
    if (error) setEditMsg("❌ Fehler: " + error.message);
    else { setEditMsg("✅ Name gespeichert!"); onProfileUpdate({ ...profile, display_name: displayName.trim() }); }
    setEditLoading(false);
  }

  async function changePassword() {
    if (newPw.length < 8) { setEditMsg("❌ Passwort min. 8 Zeichen."); return; }
    if (newPw !== confirmPw) { setEditMsg("❌ Passwörter stimmen nicht überein."); return; }
    setEditLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) setEditMsg("❌ " + error.message);
    else { setEditMsg("✅ Passwort geändert!"); setNewPw(""); setConfirmPw(""); }
    setEditLoading(false);
  }

  async function handleAccountLoeschen() {
    setLoeschenLaed(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Keine Session");
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/account-loeschen`, {
        method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok || !data.erfolg) throw new Error(data.fehler ?? "Unbekannter Fehler");
      await supabase.auth.signOut(); window.location.href = "/";
    } catch (err) { setEditMsg("❌ Fehler: " + String(err)); }
    finally { setLoeschenLaed(false); setLoeschenSchritt(0); }
  }

  const pts = profile.punkte ?? 0;
  const nextBadge = BADGES.find(b => pts < b.req);
  const progress = nextBadge ? Math.round((pts / nextBadge.req) * 100) : 100;

  const dm: Record<string, React.CSSProperties> = {
    wrap: { background:'#131313', minHeight:'100vh', padding:'0 0 20px' },
    header: { background:'linear-gradient(135deg, #0a1a0f 0%, #0d2d10 100%)', padding:20, textAlign:'center', borderBottom:'1px solid rgba(97,222,138,0.1)' },
    avatar: { width:64, height:64, borderRadius:'50%', background:'#27500a', border:'2px solid #61de8a', margin:'0 auto 10px', fontSize:26, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, color:'#61de8a' },
    name: { fontSize:18, fontWeight:700, color:'#e5e2e1' },
    ptsSub: { fontSize:14, opacity:.85, marginTop:2, color:'#61de8a' },
    progWrap: { background:'rgba(255,255,255,0.1)', borderRadius:99, height:7, overflow:'hidden', marginTop:8 },
    prog: { background:'#61de8a', height:'100%', borderRadius:99, transition:'width .3s' },
    editBtn: { marginTop:14, background:'rgba(97,222,138,0.1)', color:'#61de8a', border:'1px solid rgba(97,222,138,0.2)', padding:'6px 16px', borderRadius:8, fontSize:12, cursor:'pointer' },
    sectionTitle: { fontSize:13, fontWeight:600, color:'rgba(229,226,225,0.4)', textTransform:'uppercase' as const, letterSpacing:'.04em', margin:'16px 16px 8px' },
    shiftItem: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'#1c1b1b', borderRadius:10, marginBottom:8, marginLeft:16, marginRight:16, border:'1px solid rgba(255,255,255,0.06)' },
    pts: { fontSize:12, fontWeight:600, color:'#61de8a', background:'rgba(97,222,138,0.1)', padding:'2px 7px', borderRadius:99 },
    logoutBtn: { width:'calc(100% - 32px)', margin:'0 16px', padding:12, background:'rgba(239,68,68,0.1)', color:'#ef4444', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, fontSize:14, fontWeight:500, cursor:'pointer', marginTop:16 },
    overlay: { position:'fixed' as const, inset:0, background:'rgba(0,0,0,.7)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' },
    modal: { background:'#1c1b1b', borderRadius:'20px 20px 0 0', padding:20, width:'100%', maxWidth:480, maxHeight:'90vh', overflowY:'auto' as const, border:'1px solid rgba(255,255,255,0.08)', borderBottom:'none' },
    handle: { width:40, height:4, background:'rgba(255,255,255,0.2)', borderRadius:2, margin:'0 auto 16px' },
    btnPrimary: { width:'100%', padding:12, background:'#61de8a', color:'#00391a', border:'none', borderRadius:8, fontSize:14, fontWeight:500, cursor:'pointer', marginBottom:4 },
    input: { width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', fontSize:14, marginBottom:12, boxSizing:'border-box' as const, background:'#2a2a2a', color:'#e5e2e1', fontFamily:'Manrope,sans-serif' },
    fieldLabel: { fontSize:11, fontWeight:700, color:'rgba(229,226,225,0.4)', textTransform:'uppercase' as const, letterSpacing:'.04em', display:'block', marginBottom:6 },
    notEnough: { background:'rgba(239,68,68,0.08)', borderRadius:8, padding:12, fontSize:13, color:'#ef4444', textAlign:'center' as const, border:'1px solid rgba(239,68,68,0.15)' },
  }

  return (
    <div style={dm.wrap}>
      <div style={dm.header}>
        <div style={dm.avatar}>{profile.name?.split(" ").map((n:string) => n[0]).join("").slice(0,2).toUpperCase()}</div>
        <div style={dm.name}>{profile.display_name || profile.name}</div>
        <div style={dm.ptsSub}>⭐ {pts} Punkte</div>
        {nextBadge && (
          <div style={{ marginTop:12, padding:'0 20px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, opacity:.8, marginBottom:4, color:'rgba(229,226,225,0.6)' }}>
              <span>Nächster Badge: {nextBadge.name}</span><span>{pts}/{nextBadge.req}</span>
            </div>
            <div style={dm.progWrap}><div style={{ ...dm.prog, width:`${progress}%` }} /></div>
          </div>
        )}
        <button style={dm.editBtn} onClick={() => { setShowEdit(true); setEditMsg(""); setLoeschenSchritt(0); }}>✏️ Konto bearbeiten</button>
      </div>

      {done && <div style={{ background:'rgba(97,222,138,0.08)', color:'#61de8a', padding:'10px 16px', margin:'12px 16px', borderRadius:8, fontSize:13, border:'1px solid rgba(97,222,138,0.2)' }}>✅ Gutschein wird vorbereitet – der Admin bringt ihn dir mit!</div>}

      <div style={dm.sectionTitle}>Punkte einlösen</div>
      {VOUCHERS.map(v => {
        const req = settings[v.ptsKey] as number;
        const val = settings[v.valKey] as number;
        return (
          <div key={v.id} style={{ background:v.bg, borderRadius:12, padding:16, marginBottom:10, marginLeft:16, marginRight:16, border:`1px solid ${v.accent}22` }}>
            <div style={{ fontSize:16, fontWeight:700, color:'#e5e2e1' }}>{v.icon} {v.label}</div>
            <div style={{ fontSize:12, opacity:.7, marginTop:2, color:'rgba(229,226,225,0.5)' }}>{v.desc}</div>
            <div style={{ fontSize:22, fontWeight:800, margin:'10px 0 4px', color:v.accent }}>{req} Punkte = {val} € Gutschein</div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10 }}>
              <span style={{ fontSize:12, opacity:.8, color:'rgba(229,226,225,0.5)' }}>Guthaben: <strong style={{ color:'#e5e2e1' }}>{pts} Punkte</strong></span>
              <button style={{ background:`${v.accent}22`, color:v.accent, border:`1px solid ${v.accent}33`, padding:'6px 14px', borderRadius:8, fontSize:12, cursor:'pointer' }} onClick={() => setRedeemType(v)}>Einlösen</button>
            </div>
          </div>
        );
      })}

      <div style={dm.sectionTitle}>Meine Abzeichen</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, padding:'0 16px', marginBottom:14 }}>
        {BADGES.map(b => (
          <div key={b.name} style={{ background:'#1c1b1b', borderRadius:10, padding:'12px 8px', textAlign:'center', border:'1px solid rgba(255,255,255,0.06)', ...(pts < b.req ? { opacity:.3, filter:'grayscale(1)' } : {}) }}>
            <div style={{ fontSize:28, marginBottom:4 }}>{b.icon}</div>
            <div style={{ fontSize:10, fontWeight:600, color:'#e5e2e1' }}>{b.name}</div>
            <div style={{ fontSize:9, color:'rgba(229,226,225,0.4)' }}>{b.req} P</div>
          </div>
        ))}
      </div>

      <div style={dm.sectionTitle}>Meine Schichten</div>
      {bookings.length === 0 && <p style={{ fontSize:13, color:'rgba(229,226,225,0.3)', textAlign:'center', padding:'16px 0' }}>Noch keine Schichten.</p>}
      {bookings.map(b => (
        <div key={b.id} style={dm.shiftItem}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:500, color:'#e5e2e1' }}>{b.schichten?.bezeichnung}</div>
            <div style={{ fontSize:11, color:'rgba(229,226,225,0.4)' }}>{b.schichten?.veranstaltungen?.name}</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <span style={dm.pts}>+{b.schichten?.punkte}P</span>
            <div style={{ fontSize:10, marginTop:3, color: b.punkte_vergeben ? '#61de8a' : 'rgba(245,158,11,0.8)' }}>{b.punkte_vergeben ? '✓ Vergeben' : 'Ausstehend'}</div>
          </div>
        </div>
      ))}

      <button style={dm.logoutBtn} onClick={() => supabase.auth.signOut()}>Abmelden</button>

      {redeemType && (
        <div style={dm.overlay} onClick={() => setRedeemType(null)}>
          <div style={dm.modal} onClick={e => e.stopPropagation()}>
            <div style={dm.handle} />
            <div style={{ fontSize:17, fontWeight:700, marginBottom:12, color:'#e5e2e1' }}>{redeemType.icon} {redeemType.label} einlösen</div>
            {[['Benötigte Punkte', `${settings[redeemType.ptsKey]} Punkte`], ['Gutscheinwert', `${settings[redeemType.valKey]} €`], ['Deine Punkte', `${pts} Punkte`]].map(([l, v]) => (
              <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.06)', fontSize:13 }}>
                <span style={{ color:'rgba(229,226,225,0.4)' }}>{l}</span><span style={{ fontWeight:500, color:'#e5e2e1' }}>{v}</span>
              </div>
            ))}
            <div style={{ height:16 }} />
            {pts >= (settings[redeemType.ptsKey] as number)
              ? <button style={dm.btnPrimary} onClick={() => handleRedeem(redeemType)}>Gutschein anfordern</button>
              : <div style={dm.notEnough}>Nicht genug Punkte. Dir fehlen noch <strong>{(settings[redeemType.ptsKey] as number) - pts} Punkte</strong>.</div>
            }
          </div>
        </div>
      )}

      {showEdit && (
        <div style={dm.overlay} onClick={() => setShowEdit(false)}>
          <div style={dm.modal} onClick={e => e.stopPropagation()}>
            <div style={dm.handle} />
            <div style={{ fontSize:17, fontWeight:700, marginBottom:16, color:'#e5e2e1' }}>✏️ Konto bearbeiten</div>
            <label style={dm.fieldLabel}>Anzeigename</label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} style={dm.input} placeholder="Dein Name" />
            <button style={{ ...dm.btnPrimary, marginBottom:20 }} onClick={saveDisplayName} disabled={editLoading}>Name speichern</button>
            <label style={dm.fieldLabel}>E-Mail</label>
            <input value={profile.email} disabled style={{ ...dm.input, background:'#1c1b1b', color:'rgba(229,226,225,0.3)' }} />
            <p style={{ fontSize:11, color:'rgba(229,226,225,0.3)', marginTop:-8, marginBottom:20 }}>Nur der Admin kann die E-Mail ändern.</p>
            <label style={dm.fieldLabel}>Neues Passwort</label>
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} style={{ ...dm.input, marginBottom:8 }} placeholder="Mindestens 8 Zeichen" />
            <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} style={dm.input} placeholder="Passwort bestätigen" />
            <button style={{ ...dm.btnPrimary, marginBottom:24 }} onClick={changePassword} disabled={editLoading}>Passwort ändern</button>
            {editMsg && <p style={{ marginTop:-16, marginBottom:16, fontSize:13, color: editMsg.startsWith('✅') ? '#61de8a' : '#ef4444', textAlign:'center' }}>{editMsg}</p>}
            <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:20 }}>
              <p style={{ fontSize:12, fontWeight:700, color:'rgba(229,226,225,0.4)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:6 }}>Account löschen</p>
              <p style={{ fontSize:12, color:'rgba(229,226,225,0.3)', marginBottom:14, lineHeight:1.5 }}>Alle Punkte, Schichthistorie und Belegungen werden unwiderruflich gelöscht.</p>
              {loeschenSchritt === 0 && <button onClick={() => setLoeschenSchritt(1)} style={{ width:'100%', padding:'10px', borderRadius:8, border:'1px solid rgba(239,68,68,0.3)', color:'#ef4444', background:'none', fontSize:13, cursor:'pointer' }}>Account löschen</button>}
              {loeschenSchritt === 1 && (
                <div style={{ background:'rgba(239,68,68,0.05)', border:'1px solid rgba(239,68,68,0.15)', borderRadius:10, padding:14 }}>
                  <p style={{ fontSize:13, fontWeight:700, color:'#ef4444', marginBottom:8 }}>Bist du sicher?</p>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => setLoeschenSchritt(2)} style={{ flex:1, padding:'9px', borderRadius:8, border:'none', background:'#ef4444', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>Ja, weiter</button>
                    <button onClick={() => setLoeschenSchritt(0)} style={{ flex:1, padding:'9px', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'none', color:'rgba(229,226,225,0.6)', fontSize:12, cursor:'pointer' }}>Abbrechen</button>
                  </div>
                </div>
              )}
              {loeschenSchritt === 2 && (
                <div style={{ background:'rgba(239,68,68,0.08)', border:'2px solid #ef4444', borderRadius:10, padding:14 }}>
                  <p style={{ fontSize:13, fontWeight:700, color:'#ef4444', marginBottom:8 }}>Letzte Bestätigung</p>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={handleAccountLoeschen} disabled={loeschenLaed} style={{ flex:1, padding:'9px', borderRadius:8, border:'none', background:'#c0392b', color:'#fff', fontSize:12, fontWeight:700, cursor: loeschenLaed ? 'not-allowed' : 'pointer', opacity: loeschenLaed ? .7 : 1 }}>{loeschenLaed ? 'Wird gelöscht…' : 'Endgültig löschen'}</button>
                    <button onClick={() => setLoeschenSchritt(0)} style={{ flex:1, padding:'9px', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'none', color:'rgba(229,226,225,0.6)', fontSize:12, cursor:'pointer' }}>Abbrechen</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
