import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { Profile, Veranstaltung, Schicht } from "../types";

interface Props {
  profile: Profile;
  onTabChange: (tab: string) => void;
}

export default function Home({ profile, onTabChange }: Props) {
  const [events, setEvents] = useState<Veranstaltung[]>([]);
  const [shifts, setShifts] = useState<Schicht[]>([]);
  const [rank, setRank] = useState<string>("–");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const { data: ev } = await supabase
      .from("veranstaltungen")
      .select("*")
      .in("status", ["Aktiv", "Geplant"])
      .order("datum")
      .limit(3);
    setEvents(ev ?? []);
    const { data: sh } = await supabase
      .from("schichten")
      .select("*, veranstaltungen(name,typ)")
      .order("startzeit")
      .limit(4);
    setShifts(sh ?? []);
    const { data: members } = await supabase
      .from("profiles")
      .select("punkte")
      .order("punkte", { ascending: false });
    if (members) {
      const pos = members.findIndex((m) => m.punkte <= (profile.punkte ?? 0));
      setRank("#" + (pos + 1));
    }
  }

  return (
    <div>
      <div style={s.statRow}>
        <Stat value={profile.punkte ?? 0} label="Deine Punkte" />
        <Stat value={rank} label="Rang" />
        <Stat value={profile.schichten_count ?? 0} label="Schichten" />
      </div>

      <div style={s.sectionTitle}>Nächste Veranstaltungen</div>
      {events.map((e) => (
        <EventCard key={e.id} event={e} />
      ))}

      <div style={s.sectionTitle}>Offene Schichten</div>
      {shifts
        .filter((sh) => sh.belegt < sh.plaetze)
        .map((sh) => (
          <ShiftRow key={sh.id} shift={sh} />
        ))}
      <button style={s.btnSec} onClick={() => onTabChange("schichten")}>
        Alle Schichten ansehen →
      </button>
    </div>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div style={s.stat}>
      <div style={s.statVal}>{value}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  );
}

function EventCard({ event }: { event: Veranstaltung }) {
  const isAktiv = event.status === "Aktiv";
  const isGeplant = event.status === "Geplant";
  return (
    <div style={s.card}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 8,
        }}
      >
        <div>
          <div style={s.cardTitle}>{event.name}</div>
          <div style={s.cardSub}>📍 {event.ort}</div>
        </div>
        <span
          style={{
            ...s.pill,
            background: isAktiv ? "#e8f5ee" : isGeplant ? "#e8f0fb" : "#f0f0f0",
            color: isAktiv ? "#1a7a4a" : isGeplant ? "#1a5fa8" : "#888",
          }}
        >
          {event.status}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 13, color: "#555" }}>
          📅 {formatDate(event.datum)}
        </span>
        <span style={{ ...s.pill, background: "#fff8e1", color: "#b87800" }}>
          {event.typ}
        </span>
      </div>
    </div>
  );
}

function ShiftRow({ shift }: { shift: Schicht }) {
  return (
    <div style={s.shiftItem}>
      <div style={s.time}>
        <div style={s.timeVal}>{shift.startzeit?.slice(0, 5)}</div>
        <div style={s.timeEnd}>bis {shift.endzeit?.slice(0, 5)}</div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={s.shiftTitle}>{shift.bezeichnung}</div>
        <div style={s.shiftMeta}>
          {shift.veranstaltungen?.name} · {shift.belegt}/{shift.plaetze} Plätze
        </div>
      </div>
      <span style={s.pts}>+{shift.punkte}P</span>
    </div>
  );
}

function formatDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
}

const s: Record<string, React.CSSProperties> = {
  statRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 8,
    marginBottom: 14,
  },
  stat: {
    background: "#fff",
    borderRadius: 10,
    padding: 10,
    textAlign: "center",
    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
  },
  statVal: { fontSize: 22, fontWeight: 700, color: "#1a7a4a" },
  statLabel: { fontSize: 11, color: "#888", marginTop: 2 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: ".04em",
    margin: "16px 0 8px",
  },
  card: {
    background: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    boxShadow: "0 1px 4px rgba(0,0,0,.07)",
  },
  cardTitle: { fontSize: 15, fontWeight: 600 },
  cardSub: { fontSize: 12, color: "#888", marginTop: 2 },
  pill: {
    display: "inline-block",
    padding: "3px 9px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 500,
  },
  shiftItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    background: "#fff",
    borderRadius: 10,
    marginBottom: 8,
    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
  },
  time: { minWidth: 52, textAlign: "center" },
  timeVal: { fontSize: 13, fontWeight: 700, color: "#1a7a4a" },
  timeEnd: { fontSize: 10, color: "#888" },
  shiftTitle: { fontSize: 14, fontWeight: 500 },
  shiftMeta: { fontSize: 11, color: "#888", marginTop: 2 },
  pts: {
    fontSize: 12,
    fontWeight: 600,
    color: "#b87800",
    background: "#fff8e1",
    padding: "2px 7px",
    borderRadius: 99,
  },
  btnSec: {
    width: "100%",
    padding: 10,
    background: "#e8f5ee",
    color: "#1a7a4a",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    marginTop: 4,
  },
};
