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
  {
    id: "food",
    label: "Verzehrgutschein",
    icon: "🍺",
    desc: "Am Vereinsheim & Veranstaltungen",
    bg: "#1a7a4a",
    ptsKey: "food_pts" as keyof Einstellungen,
    valKey: "food_val" as keyof Einstellungen,
    defaultPts: 200,
    defaultVal: 10,
  },
  {
    id: "shop",
    label: "Fanshop-Gutschein",
    icon: "👕",
    desc: "Im SSV Boppard Online-Fanshop",
    bg: "#1a3a7a",
    ptsKey: "shop_pts" as keyof Einstellungen,
    valKey: "shop_val" as keyof Einstellungen,
    defaultPts: 300,
    defaultVal: 15,
  },
];

export default function Profil({ profile, onProfileUpdate, onTabChange }: Props) {
  const [bookings, setBookings] = useState<Schichtbelegung[]>([]);
  const [settings, setSettings] = useState<Einstellungen>({
    id: 1,
    food_pts: 200,
    food_val: 10,
    shop_pts: 300,
    shop_val: 15,
  });
  const [redeemType, setRedeemType] = useState<(typeof VOUCHERS)[0] | null>(null);
  const [done, setDone] = useState(false);

  const [showEdit, setShowEdit]       = useState(false);
  const [displayName, setDisplayName] = useState(profile.display_name || profile.name?.split(" ")[0] || "");
  const [newPw, setNewPw]             = useState("");
  const [confirmPw, setConfirmPw]     = useState("");
  const [editMsg, setEditMsg]         = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const [loeschenSchritt, setLoeschenSchritt] = useState<0 | 1 | 2>(0);
  const [loeschenLaed, setLoeschenLaed]       = useState(false);

  useEffect(() => {
    supabase
      .from("schichtbelegungen")
      .select("*, schichten(bezeichnung,punkte,veranstaltungen(name))")
      .eq("mitglied_id", profile.id)
      .then(({ data }) => setBookings(data ?? []));
    supabase
      .from("einstellungen")
      .select("*")
      .single()
      .then(({ data }) => { if (data) setSettings(data); });
  }, []);

  async function handleRedeem(v: (typeof VOUCHERS)[0]) {
    const req = settings[v.ptsKey] as number;
    if ((profile.punkte ?? 0) < req) return;

    await supabase.from("gutschein_anfragen").insert({
      mitglied_id: profile.id,
      typ: v.id,
      punkte: req,
      status: "offen",
    });

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      try {
        await fetch(`${supabaseUrl}/functions/v1/gutschein-anfrage`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mitglied_id: profile.id,
            typ: v.id,
            punkte: req,
          }),
        });
      } catch (err) {
        console.error("Gutschein-Mail Fehler:", err);
      }
    }

    setRedeemType(null);
    setDone(true);
  }

  async function saveDisplayName() {
    if (!displayName.trim()) { setEditMsg("❌ Name darf nicht leer sein."); return; }
    setEditLoading(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() })
      .eq("id", profile.id);
    if (error) {
      setEditMsg("❌ Fehler: " + error.message);
    } else {
      setEditMsg("✅ Name gespeichert!");
      onProfileUpdate({ ...profile, display_name: displayName.trim() });
    }
    setEditLoading(false);
  }

  async function changePassword() {
    if (newPw.length < 8)    { setEditMsg("❌ Passwort min. 8 Zeichen."); return; }
    if (newPw !== confirmPw) { setEditMsg("❌ Passwörter stimmen nicht überein."); return; }
    setEditLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) {
      setEditMsg("❌ " + error.message);
    } else {
      setEditMsg("✅ Passwort geändert!");
      setNewPw(""); setConfirmPw("");
    }
    setEditLoading(false);
  }

  async function handleAccountLoeschen() {
    setLoeschenLaed(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Keine Session");
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(
        `${supabaseUrl}/functions/v1/account-loeschen`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );
      const data = await res.json();
      if (!res.ok || !data.erfolg) throw new Error(data.fehler ?? "Unbekannter Fehler");
      await supabase.auth.signOut();
      window.location.href = "/";
    } catch (err) {
      setEditMsg("❌ Fehler: " + String(err));
    } finally {
      setLoeschenLaed(false);
      setLoeschenSchritt(0);
    }
  }

  const pts = profile.punkte ?? 0;
  const nextBadge = BADGES.find((b) => pts < b.req);
  const progress  = nextBadge ? Math.round((pts / nextBadge.req) * 100) : 100;

  return (
    <div>
      <div style={p.header}>
        <div style={p.avatar}>
          {profile.name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
        </div>
        <div style={p.name}>{profile.display_name || profile.name}</div>
        <div style={p.ptsSub}>⭐ {pts} Punkte</div>
        {nextBadge && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
              <span>Nächster Badge: {nextBadge.name}</span>
              <span>{pts}/{nextBadge.req}</span>
            </div>
            <div style={p.progWrap}>
              <div style={{ ...p.prog, width: `${progress}%` }} />
            </div>
          </div>
        )}
        <button style={p.editBtn} onClick={() => { setShowEdit(true); setEditMsg(""); setLoeschenSchritt(0); }}>
          ✏️ Konto bearbeiten
        </button>
      </div>

      {done && (
        <div style={{ background: "#e8f5ee", color: "#1a7a4a", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          ✅ Anfrage gesendet – der Admin prüft sie!
        </div>
      )}

      <div style={p.sectionTitle}>Punkte einlösen</div>
      {VOUCHERS.map((v) => {
        const req = settings[v.ptsKey] as number;
        const val = settings[v.valKey] as number;
        return (
          <div key={v.id} style={{ ...p.voucherCard, background: v.bg }}>
            <div style={p.voucherTitle}>{v.icon} {v.label}</div>
            <div style={p.voucherSub}>{v.desc}</div>
            <div style={p.voucherPts}>{req} Punkte = {val} € Gutschein</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>Guthaben: <strong>{pts} Punkte</strong></span>
              <button style={p.voucherBtn} onClick={() => setRedeemType(v)}>Einlösen</button>
            </div>
          </div>
        );
      })}

      <div style={p.sectionTitle}>Meine Abzeichen</div>
      <div style={p.badgeGrid}>
        {BADGES.map((b) => (
          <div key={b.name} style={{ ...p.badgeCard, ...(pts < b.req ? { opacity: 0.35, filter: "grayscale(1)" } : {}) }}>
            <div style={{ fontSize: 28, marginBottom: 4 }}>{b.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 600 }}>{b.name}</div>
            <div style={{ fontSize: 10, color: "#888" }}>{b.req} Punkte</div>
          </div>
        ))}
      </div>

      <div style={p.sectionTitle}>Meine Schichten</div>
      {bookings.map((b) => (
        <div key={b.id} style={p.shiftItem}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{b.schichten?.bezeichnung}</div>
            <div style={{ fontSize: 11, color: "#888" }}>{b.schichten?.veranstaltungen?.name}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={p.pts}>+{b.schichten?.punkte}P</span>
            <div style={{ fontSize: 10, marginTop: 3, color: b.punkte_vergeben ? "#1a7a4a" : "#b87800" }}>
              {b.punkte_vergeben ? "✓ Vergeben" : "Ausstehend"}
            </div>
          </div>
        </div>
      ))}

      <button style={p.logoutBtn} onClick={() => supabase.auth.signOut()}>
        Abmelden
      </button>

      {redeemType && (
        <div style={p.overlay} onClick={() => setRedeemType(null)}>
          <div style={p.modal} onClick={(e) => e.stopPropagation()}>
            <div style={p.handle} />
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>
              {redeemType.icon} {redeemType.label} einlösen
            </div>
            <IRow label="Benötigte Punkte" value={`${settings[redeemType.ptsKey]} Punkte`} />
            <IRow label="Gutscheinwert"    value={`${settings[redeemType.valKey]} €`} />
            <IRow label="Deine Punkte"     value={`${pts} Punkte`} color={pts < (settings[redeemType.ptsKey] as number) ? "#c0392b" : undefined} />
            <div style={{ height: 16 }} />
            {pts >= (settings[redeemType.ptsKey] as number) ? (
              <button style={p.btnPrimary} onClick={() => handleRedeem(redeemType)}>Anfrage senden</button>
            ) : (
              <div style={p.notEnough}>
                Nicht genug Punkte. Dir fehlen noch <strong>{(settings[redeemType.ptsKey] as number) - pts} Punkte</strong>.
              </div>
            )}
          </div>
        </div>
      )}

      {showEdit && (
        <div style={p.overlay} onClick={() => setShowEdit(false)}>
          <div style={p.modal} onClick={(e) => e.stopPropagation()}>
            <div style={p.handle} />
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>✏️ Konto bearbeiten</div>

            <label style={p.fieldLabel}>Anzeigename</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={p.input} placeholder="Dein Name" />
            <button style={{ ...p.btnPrimary, marginBottom: 20 }} onClick={saveDisplayName} disabled={editLoading}>
              Name speichern
            </button>

            <label style={p.fieldLabel}>E-Mail</label>
            <input value={profile.email} disabled style={{ ...p.input, background: "#f0f0f0", color: "#999" }} />
            <p style={{ fontSize: 11, color: "#aaa", marginTop: -8, marginBottom: 20 }}>
              Nur der Admin kann die E-Mail ändern.
            </p>

            <label style={p.fieldLabel}>Neues Passwort</label>
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} style={{ ...p.input, marginBottom: 8 }} placeholder="Mindestens 8 Zeichen" />
            <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} style={p.input} placeholder="Passwort bestätigen" />
            <button style={{ ...p.btnPrimary, marginBottom: 24 }} onClick={changePassword} disabled={editLoading}>
              Passwort ändern
            </button>

            {editMsg && (
              <p style={{ marginTop: -16, marginBottom: 16, fontSize: 13, color: editMsg.startsWith("✅") ? "#1a7a4a" : "#c0392b", textAlign: "center" }}>
                {editMsg}
              </p>
            )}

            <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 20, marginTop: 4 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>
                Account löschen
              </p>
              <p style={{ fontSize: 12, color: "#aaa", marginBottom: 14, lineHeight: 1.5 }}>
                Alle deine Punkte, Schichthistorie und Belegungen werden unwiderruflich gelöscht.
              </p>

              {loeschenSchritt === 0 && (
                <button onClick={() => setLoeschenSchritt(1)}
                  style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #e74c3c", color: "#e74c3c", background: "none", fontSize: 13, cursor: "pointer" }}>
                  Account löschen
                </button>
              )}

              {loeschenSchritt === 1 && (
                <div style={{ background: "#fff5f5", border: "1px solid #fcc", borderRadius: 10, padding: 14 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#c0392b", marginBottom: 8 }}>Bist du sicher?</p>
                  <p style={{ fontSize: 12, color: "#555", marginBottom: 14, lineHeight: 1.5 }}>
                    Deine <strong>Punkte</strong>, <strong>Schichthistorie</strong> und alle <strong>Anmeldungen</strong> werden dauerhaft gelöscht.
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setLoeschenSchritt(2)}
                      style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", background: "#e74c3c", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      Ja, weiter
                    </button>
                    <button onClick={() => setLoeschenSchritt(0)}
                      style={{ flex: 1, padding: "9px", borderRadius: 8, border: "1px solid #ccc", background: "none", color: "#555", fontSize: 12, cursor: "pointer" }}>
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}

              {loeschenSchritt === 2 && (
                <div style={{ background: "#fff5f5", border: "2px solid #e74c3c", borderRadius: 10, padding: 14 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#c0392b", marginBottom: 8 }}>Letzte Bestätigung</p>
                  <p style={{ fontSize: 12, color: "#555", marginBottom: 14, lineHeight: 1.5 }}>
                    Nach dem Klick wird dein Account <strong>sofort und unwiderruflich</strong> gelöscht.
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={handleAccountLoeschen} disabled={loeschenLaed}
                      style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", background: "#c0392b", color: "#fff", fontSize: 12, fontWeight: 700, cursor: loeschenLaed ? "not-allowed" : "pointer", opacity: loeschenLaed ? 0.7 : 1 }}>
                      {loeschenLaed ? "Wird gelöscht…" : "Endgültig löschen"}
                    </button>
                    <button onClick={() => setLoeschenSchritt(0)} disabled={loeschenLaed}
                      style={{ flex: 1, padding: "9px", borderRadius: 8, border: "1px solid #ccc", background: "none", color: "#555", fontSize: 12, cursor: "pointer" }}>
                      Abbrechen
                    </button>
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

function IRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13 }}>
      <span style={{ color: "#888" }}>{label}</span>
      <span style={{ fontWeight: 500, color: color ?? "inherit" }}>{value}</span>
    </div>
  );
}

const p: Record<string, React.CSSProperties> = {
  header:      { background: "#1a7a4a", color: "#fff", borderRadius: 12, padding: 20, textAlign: "center", marginBottom: 12 },
  avatar:      { width: 64, height: 64, borderRadius: "50%", background: "rgba(255,255,255,.25)", margin: "0 auto 10px", fontSize: 26, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 },
  name:        { fontSize: 18, fontWeight: 700 },
  ptsSub:      { fontSize: 14, opacity: 0.85, marginTop: 2 },
  progWrap:    { background: "rgba(255,255,255,.3)", borderRadius: 99, height: 7, overflow: "hidden" },
  prog:        { background: "#fff", height: "100%", borderRadius: 99, transition: "width .3s" },
  editBtn:     { marginTop: 14, background: "rgba(255,255,255,.2)", color: "#fff", border: "1px solid rgba(255,255,255,.4)", padding: "6px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer" },
  fieldLabel:  { fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase" as const, letterSpacing: ".04em", display: "block", marginBottom: 6 },
  input:       { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e0e0e0", fontSize: 14, marginBottom: 12, boxSizing: "border-box" as const },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: "#888", textTransform: "uppercase" as const, letterSpacing: ".04em", margin: "16px 0 8px" },
  voucherCard:  { borderRadius: 12, padding: 16, marginBottom: 10, color: "#fff" },
  voucherTitle: { fontSize: 16, fontWeight: 700 },
  voucherSub:   { fontSize: 12, opacity: 0.8, marginTop: 2 },
  voucherPts:   { fontSize: 22, fontWeight: 800, margin: "10px 0 4px" },
  voucherBtn:   { background: "rgba(255,255,255,.25)", color: "#fff", border: "1px solid rgba(255,255,255,.4)", padding: "6px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer" },
  badgeGrid:    { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 },
  badgeCard:    { background: "#fff", borderRadius: 10, padding: "12px 8px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,.06)" },
  shiftItem:    { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "#fff", borderRadius: 10, marginBottom: 8, boxShadow: "0 1px 3px rgba(0,0,0,.06)" },
  pts:          { fontSize: 12, fontWeight: 600, color: "#b87800", background: "#fff8e1", padding: "2px 7px", borderRadius: 99 },
  logoutBtn:    { width: "100%", padding: 12, background: "#fdecea", color: "#c0392b", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer", marginTop: 16 },
  overlay:      { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  modal:        { background: "#fff", borderRadius: "20px 20px 0 0", padding: 20, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto" },
  handle:       { width: 40, height: 4, background: "#ddd", borderRadius: 2, margin: "0 auto 16px" },
  btnPrimary:   { width: "100%", padding: 12, background: "#1a7a4a", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer", marginBottom: 4 },
  notEnough:    { background: "#fdecea", borderRadius: 8, padding: 12, fontSize: 13, color: "#c0392b", textAlign: "center" },
};
