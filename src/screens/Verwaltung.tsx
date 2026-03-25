import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import {
  Profile,
  Schichtbelegung,
  Veranstaltung,
  Einstellungen,
  GutscheinAnfrage,
} from "../types";

interface Props {
  profile: Profile;
  onTabChange: (tab: string) => void;
}
type AdminTab = "uebersicht" | "neu" | "gutscheine";

export default function Verwaltung(_: Props) {
  const [tab, setTab] = useState<AdminTab>("uebersicht");
  const [bookings, setBookings] = useState<Schichtbelegung[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [events, setEvents] = useState<Veranstaltung[]>([]);
  const [reqs, setReqs] = useState<GutscheinAnfrage[]>([]);
  const [settings, setSettings] = useState<Einstellungen>({
    id: 1,
    food_pts: 200,
    food_val: 10,
    shop_pts: 300,
    shop_val: 15,
  });
  const [newEv, setNewEv] = useState({
    name: "",
    typ: "Fußball-Turnier",
    datum: "",
    ort: "",
  });
  const [newSh, setNewSh] = useState({
    bezeichnung: "",
    veranstaltung_id: 0,
    startzeit: "09:00",
    endzeit: "13:00",
    plaetze: 3,
    punkte: 10,
    beschreibung: "",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [b, m, e, r, s] = await Promise.all([
      supabase
        .from("schichtbelegungen")
        .select("*, profiles(name), schichten(bezeichnung,punkte)"),
      supabase
        .from("profiles")
        .select("*")
        .order("punkte", { ascending: false }),
      supabase.from("veranstaltungen").select("*").order("datum"),
      supabase
        .from("gutschein_anfragen")
        .select("*, profiles(name)")
        .order("created_at", { ascending: false }),
      supabase.from("einstellungen").select("*").single(),
    ]);
    setBookings(b.data ?? []);
    setMembers(m.data ?? []);
    setEvents(e.data ?? []);
    setReqs(r.data ?? []);
    if (s.data) setSettings(s.data);
  }

  async function givePoints(b: Schichtbelegung) {
    await supabase
      .from("schichtbelegungen")
      .update({ punkte_vergeben: true })
      .eq("id", b.id);
    await supabase.rpc("add_punkte", {
      user_id: b.mitglied_id,
      amount: b.schichten?.punkte ?? 0,
    });
    loadAll();
  }

  async function addEvent() {
    if (!newEv.name || !newEv.datum) return;
    await supabase
      .from("veranstaltungen")
      .insert({ ...newEv, status: "Geplant" });
    setNewEv({ name: "", typ: "Fußball-Turnier", datum: "", ort: "" });
    loadAll();
  }

  async function addShift() {
    if (!newSh.bezeichnung || !newSh.veranstaltung_id) return;
    await supabase.from("schichten").insert({ ...newSh, belegt: 0 });
    setNewSh({
      bezeichnung: "",
      veranstaltung_id: 0,
      startzeit: "09:00",
      endzeit: "13:00",
      plaetze: 3,
      punkte: 10,
      beschreibung: "",
    });
    loadAll();
  }

  async function saveSettings() {
    await supabase.from("einstellungen").upsert({ id: 1, ...settings });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleReq(id: number, status: string) {
    await supabase.from("gutschein_anfragen").update({ status }).eq("id", id);
    loadAll();
  }

  const TABS: { id: AdminTab; label: string }[] = [
    { id: "uebersicht", label: "Übersicht" },
    { id: "neu", label: "Neu anlegen" },
    { id: "gutscheine", label: "Gutscheine" },
  ];

  return (
    <div>
      <div style={v.tabRow}>
        {TABS.map((t) => (
          <button
            key={t.id}
            style={{ ...v.stab, ...(tab === t.id ? v.stabActive : {}) }}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "uebersicht" && (
        <div>
          <div style={v.sectionTitle}>Schichtbelegungen</div>
          {bookings.map((b) => (
            <div key={b.id} style={v.card}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    {(b.profiles as any)?.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#888" }}>
                    {b.schichten?.bezeichnung}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span
                    style={{
                      ...v.pill,
                      background: b.punkte_vergeben ? "#e8f5ee" : "#fff8e1",
                      color: b.punkte_vergeben ? "#1a7a4a" : "#b87800",
                    }}
                  >
                    {b.punkte_vergeben ? "✓ Vergeben" : "Ausstehend"}
                  </span>
                  {!b.punkte_vergeben && (
                    <button style={v.btnSm} onClick={() => givePoints(b)}>
                      ✓ Punkte
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div style={{ ...v.sectionTitle, marginTop: 16 }}>Mitglieder</div>
          {members.map((m) => (
            <div
              key={m.id}
              style={{
                ...v.card,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{m.name}</div>
                <div style={{ fontSize: 12, color: "#888" }}>
                  {m.schichten_count ?? 0} Schichten
                </div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1a7a4a" }}>
                {m.punkte}P
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "neu" && (
        <div>
          <div style={v.sectionTitle}>Neue Veranstaltung</div>
          <div style={v.card}>
            <F label="Name">
              <input
                style={v.input}
                value={newEv.name}
                onChange={(e) => setNewEv({ ...newEv, name: e.target.value })}
                placeholder="z.B. Sommerfest 2025"
              />
            </F>
            <F label="Typ">
              <select
                style={v.input}
                value={newEv.typ}
                onChange={(e) => setNewEv({ ...newEv, typ: e.target.value })}
              >
                <option>Fußball-Turnier</option>
                <option>Vereinsfest</option>
                <option>Sonstiges</option>
              </select>
            </F>
            <F label="Datum">
              <input
                style={v.input}
                type="date"
                value={newEv.datum}
                onChange={(e) => setNewEv({ ...newEv, datum: e.target.value })}
              />
            </F>
            <F label="Ort">
              <input
                style={v.input}
                value={newEv.ort}
                onChange={(e) => setNewEv({ ...newEv, ort: e.target.value })}
                placeholder="Sportplatz Boppard"
              />
            </F>
            <button style={v.btnPrimary} onClick={addEvent}>
              Veranstaltung anlegen
            </button>
          </div>
          <div style={{ ...v.sectionTitle, marginTop: 16 }}>Neue Schicht</div>
          <div style={v.card}>
            <F label="Bezeichnung">
              <input
                style={v.input}
                value={newSh.bezeichnung}
                onChange={(e) =>
                  setNewSh({ ...newSh, bezeichnung: e.target.value })
                }
                placeholder="Kasse – Vormittag"
              />
            </F>
            <F label="Veranstaltung">
              <select
                style={v.input}
                value={newSh.veranstaltung_id}
                onChange={(e) =>
                  setNewSh({
                    ...newSh,
                    veranstaltung_id: parseInt(e.target.value),
                  })
                }
              >
                <option value={0}>– auswählen –</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </F>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              <F label="Von">
                <input
                  style={v.input}
                  type="time"
                  value={newSh.startzeit}
                  onChange={(e) =>
                    setNewSh({ ...newSh, startzeit: e.target.value })
                  }
                />
              </F>
              <F label="Bis">
                <input
                  style={v.input}
                  type="time"
                  value={newSh.endzeit}
                  onChange={(e) =>
                    setNewSh({ ...newSh, endzeit: e.target.value })
                  }
                />
              </F>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              <F label="Plätze">
                <input
                  style={v.input}
                  type="number"
                  value={newSh.plaetze}
                  onChange={(e) =>
                    setNewSh({
                      ...newSh,
                      plaetze: parseInt(e.target.value) || 1,
                    })
                  }
                />
              </F>
              <F label="Punkte">
                <input
                  style={v.input}
                  type="number"
                  value={newSh.punkte}
                  onChange={(e) =>
                    setNewSh({
                      ...newSh,
                      punkte: parseInt(e.target.value) || 1,
                    })
                  }
                />
              </F>
            </div>
            <F label="Aufgabe">
              <input
                style={v.input}
                value={newSh.beschreibung}
                onChange={(e) =>
                  setNewSh({ ...newSh, beschreibung: e.target.value })
                }
                placeholder="Kurze Beschreibung"
              />
            </F>
            <button style={v.btnPrimary} onClick={addShift}>
              Schicht anlegen
            </button>
          </div>
        </div>
      )}

      {tab === "gutscheine" && (
        <div>
          <div style={v.card}>
            <div style={v.sectionTitle}>🍺 Verzehrgutschein</div>
            <F label="Benötigte Punkte">
              <input
                style={v.input}
                type="number"
                value={settings.food_pts}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    food_pts: parseInt(e.target.value) || 0,
                  })
                }
              />
            </F>
            <F label="Wert in €">
              <input
                style={v.input}
                type="number"
                value={settings.food_val}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    food_val: parseInt(e.target.value) || 0,
                  })
                }
              />
            </F>
            <div style={{ ...v.sectionTitle, marginTop: 12 }}>
              👕 Fanshop-Gutschein
            </div>
            <F label="Benötigte Punkte">
              <input
                style={v.input}
                type="number"
                value={settings.shop_pts}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    shop_pts: parseInt(e.target.value) || 0,
                  })
                }
              />
            </F>
            <F label="Wert in €">
              <input
                style={v.input}
                type="number"
                value={settings.shop_val}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    shop_val: parseInt(e.target.value) || 0,
                  })
                }
              />
            </F>
            {saved && (
              <div style={{ color: "#1a7a4a", fontSize: 13, marginBottom: 8 }}>
                ✅ Gespeichert!
              </div>
            )}
            <button style={v.btnPrimary} onClick={saveSettings}>
              Einstellungen speichern
            </button>
          </div>
          <div style={v.sectionTitle}>Einlösungs-Anfragen</div>
          {reqs.length === 0 && (
            <div style={{ textAlign: "center", padding: 30, color: "#888" }}>
              Noch keine Anfragen
            </div>
          )}
          {reqs.map((req) => (
            <div key={req.id} style={v.card}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    {(req.profiles as any)?.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#888" }}>
                    {req.typ === "food" ? "🍺 Verzehr" : "👕 Fanshop"} ·{" "}
                    {req.punkte} Punkte
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {req.status === "offen" ? (
                    <>
                      <button
                        style={v.btnSm}
                        onClick={() => handleReq(req.id, "genehmigt")}
                      >
                        ✓
                      </button>
                      <button
                        style={{
                          ...v.btnSm,
                          background: "#fdecea",
                          color: "#c0392b",
                        }}
                        onClick={() => handleReq(req.id, "abgelehnt")}
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <span
                      style={{
                        ...v.pill,
                        background:
                          req.status === "genehmigt" ? "#e8f5ee" : "#fdecea",
                        color:
                          req.status === "genehmigt" ? "#1a7a4a" : "#c0392b",
                      }}
                    >
                      {req.status}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: "#444",
          display: "block",
          marginBottom: 5,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const v: Record<string, React.CSSProperties> = {
  tabRow: {
    display: "flex",
    borderBottom: "2px solid #e0e0e0",
    marginBottom: 14,
  },
  stab: {
    flex: 1,
    padding: 10,
    textAlign: "center",
    fontSize: 13,
    fontWeight: 500,
    color: "#888",
    cursor: "pointer",
    border: "none",
    background: "none",
    borderBottom: "2px solid transparent",
    marginBottom: -2,
  },
  stabActive: { color: "#1a7a4a", borderBottomColor: "#1a7a4a" },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: ".04em",
    margin: "0 0 8px",
  },
  card: {
    background: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    boxShadow: "0 1px 4px rgba(0,0,0,.07)",
  },
  pill: {
    display: "inline-block",
    padding: "3px 9px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 500,
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    border: "1.5px solid #e0e0e0",
    borderRadius: 8,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  },
  btnPrimary: {
    width: "100%",
    padding: 12,
    background: "#1a7a4a",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    marginTop: 4,
  },
  btnSm: {
    padding: "6px 12px",
    background: "#e8f5ee",
    color: "#1a7a4a",
    border: "none",
    borderRadius: 8,
    fontSize: 12,
    cursor: "pointer",
  },
};
