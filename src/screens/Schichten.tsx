import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { Profile, Schicht } from "../types";

interface Props {
  profile: Profile;
  onTabChange: (tab: string) => void;
}
type Filter = "alle" | "offen" | "meins" | "Fußball-Turnier" | "Vereinsfest";

export default function Schichten({ profile }: Props) {
  const [shifts, setShifts] = useState<Schicht[]>([]);
  const [myBookings, setMyBookings] = useState<number[]>([]);
  const [filter, setFilter] = useState<Filter>("alle");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Schicht | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [{ data: sh }, { data: bk }] = await Promise.all([
      supabase
        .from("schichten")
        .select("*, veranstaltungen(name,typ)")
        .order("startzeit"),
      supabase
        .from("schichtbelegungen")
        .select("schicht_id")
        .eq("mitglied_id", profile.id),
    ]);
    setShifts(sh ?? []);
    setMyBookings((bk ?? []).map((b: any) => b.schicht_id));
  }

  async function joinShift(s: Schicht) {
    setSaving(true);
    await supabase
      .from("schichtbelegungen")
      .insert({
        schicht_id: s.id,
        mitglied_id: profile.id,
        status: "Angemeldet",
      });
    await supabase
      .from("schichten")
      .update({ belegt: s.belegt + 1 })
      .eq("id", s.id);
    await loadData();
    setSaving(false);
    setSelected(null);
  }

  async function leaveShift(s: Schicht) {
    setSaving(true);
    await supabase
      .from("schichtbelegungen")
      .delete()
      .eq("schicht_id", s.id)
      .eq("mitglied_id", profile.id);
    await supabase
      .from("schichten")
      .update({ belegt: Math.max(0, s.belegt - 1) })
      .eq("id", s.id);
    await loadData();
    setSaving(false);
    setSelected(null);
  }

  const FILTERS: { id: Filter; label: string }[] = [
    { id: "alle", label: "Alle" },
    { id: "offen", label: "Offen" },
    { id: "meins", label: "Meine" },
    { id: "Fußball-Turnier", label: "Turnier" },
    { id: "Vereinsfest", label: "Vereinsfest" },
  ];

  const filtered = shifts
    .filter((s) => {
      if (filter === "offen") return s.belegt < s.plaetze;
      if (filter === "meins") return myBookings.includes(s.id);
      if (filter === "Fußball-Turnier")
        return s.veranstaltungen?.typ === "Fußball-Turnier";
      if (filter === "Vereinsfest")
        return s.veranstaltungen?.typ === "Vereinsfest";
      return true;
    })
    .filter(
      (s) =>
        !search || s.bezeichnung.toLowerCase().includes(search.toLowerCase())
    );

  const isMine = (s: Schicht) => myBookings.includes(s.id);
  const isFull = (s: Schicht) => s.belegt >= s.plaetze;

  return (
    <div>
      <input
        style={s.search}
        placeholder="🔍  Schicht suchen..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div style={s.filterRow}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            style={{ ...s.ftab, ...(filter === f.id ? s.ftabActive : {}) }}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {filtered.length === 0 && (
        <div style={s.empty}>📭 Keine Schichten gefunden</div>
      )}
      {filtered.map((sh) => (
        <div key={sh.id} style={s.shiftItem} onClick={() => setSelected(sh)}>
          <div style={s.time}>
            <div style={s.timeVal}>{sh.startzeit?.slice(0, 5)}</div>
            <div style={s.timeEnd}>bis {sh.endzeit?.slice(0, 5)}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={s.title}>{sh.bezeichnung}</div>
            <div style={s.meta}>
              {sh.veranstaltungen?.name} · {sh.belegt}/{sh.plaetze} Plätze
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 5,
            }}
          >
            <span style={s.pts}>+{sh.punkte}P</span>
            {isMine(sh) && <span style={s.pillGreen}>✓ Dabei</span>}
            {!isMine(sh) && isFull(sh) && <span style={s.pillRed}>Voll</span>}
          </div>
        </div>
      ))}

      {selected && (
        <div style={s.overlay} onClick={() => setSelected(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.handle} />
            <div style={s.modalTitle}>{selected.bezeichnung}</div>
            <div style={{ marginBottom: 14 }}>
              <span
                style={{ ...s.pill, background: "#e8f0fb", color: "#1a5fa8" }}
              >
                {selected.veranstaltungen?.name}
              </span>{" "}
              <span
                style={{ ...s.pill, background: "#fff8e1", color: "#b87800" }}
              >
                +{selected.punkte} Punkte
              </span>
            </div>
            <IRow
              label="Uhrzeit"
              value={`${selected.startzeit?.slice(
                0,
                5
              )} – ${selected.endzeit?.slice(0, 5)} Uhr`}
            />
            <IRow
              label="Freie Plätze"
              value={`${selected.plaetze - selected.belegt} von ${
                selected.plaetze
              }`}
            />
            <IRow label="Aufgabe" value={selected.beschreibung ?? "–"} />
            <div style={{ height: 16 }} />
            {isMine(selected) ? (
              <button
                style={s.btnRed}
                onClick={() => leaveShift(selected)}
                disabled={saving}
              >
                Schicht abmelden
              </button>
            ) : isFull(selected) ? (
              <button style={{ ...s.btnOutline, opacity: 0.4 }} disabled>
                Schicht ist voll
              </button>
            ) : (
              <button
                style={s.btnPrimary}
                onClick={() => joinShift(selected)}
                disabled={saving}
              >
                Ich bin dabei! (+{selected.punkte} Punkte)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function IRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "8px 0",
        borderBottom: "1px solid #f0f0f0",
        fontSize: 13,
      }}
    >
      <span style={{ color: "#888" }}>{label}</span>
      <span style={{ fontWeight: 500, maxWidth: "60%", textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  search: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 99,
    border: "1.5px solid #e0e0e0",
    fontSize: 14,
    background: "#fff",
    outline: "none",
    marginBottom: 12,
    boxSizing: "border-box",
  },
  filterRow: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
    paddingBottom: 4,
    marginBottom: 12,
    scrollbarWidth: "none",
  },
  ftab: {
    padding: "6px 14px",
    borderRadius: 99,
    border: "1.5px solid #e0e0e0",
    background: "#fff",
    fontSize: 12,
    fontWeight: 500,
    color: "#555",
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  ftabActive: { background: "#1a7a4a", color: "#fff", borderColor: "#1a7a4a" },
  shiftItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    background: "#fff",
    borderRadius: 10,
    marginBottom: 8,
    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
    cursor: "pointer",
  },
  time: { minWidth: 52, textAlign: "center" },
  timeVal: { fontSize: 13, fontWeight: 700, color: "#1a7a4a" },
  timeEnd: { fontSize: 10, color: "#888" },
  title: { fontSize: 14, fontWeight: 500 },
  meta: { fontSize: 11, color: "#888", marginTop: 2 },
  pts: {
    fontSize: 12,
    fontWeight: 600,
    color: "#b87800",
    background: "#fff8e1",
    padding: "2px 7px",
    borderRadius: 99,
  },
  pillGreen: {
    fontSize: 10,
    background: "#e8f5ee",
    color: "#1a7a4a",
    padding: "2px 7px",
    borderRadius: 99,
    fontWeight: 500,
  },
  pillRed: {
    fontSize: 10,
    background: "#fdecea",
    color: "#c0392b",
    padding: "2px 7px",
    borderRadius: 99,
    fontWeight: 500,
  },
  pill: {
    display: "inline-block",
    padding: "3px 9px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 500,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.5)",
    zIndex: 200,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  modal: {
    background: "#fff",
    borderRadius: "20px 20px 0 0",
    padding: 20,
    width: "100%",
    maxWidth: 420,
    maxHeight: "90vh",
    overflowY: "auto",
  },
  handle: {
    width: 40,
    height: 4,
    background: "#ddd",
    borderRadius: 2,
    margin: "0 auto 16px",
  },
  modalTitle: { fontSize: 17, fontWeight: 700, marginBottom: 4 },
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
  },
  btnOutline: {
    width: "100%",
    padding: 12,
    background: "#fff",
    color: "#1a7a4a",
    border: "1.5px solid #1a7a4a",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  btnRed: {
    width: "100%",
    padding: 12,
    background: "#fdecea",
    color: "#c0392b",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  empty: { textAlign: "center", padding: "40px 20px", color: "#888" },
};
