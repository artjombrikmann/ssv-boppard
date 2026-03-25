import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { Profile } from "../types";

interface Props {
  profile: Profile;
  onTabChange: (tab: string) => void;
}

export default function Rangliste({ profile }: Props) {
  const [members, setMembers] = useState<Profile[]>([]);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id,name,punkte,schichten_count")
      .order("punkte", { ascending: false })
      .then(({ data }) => setMembers(data ?? []));
  }, []);

  return (
    <div>
      <div style={r.sectionTitle}>Gesamtrangliste 2025</div>
      {members.map((m, i) => (
        <div
          key={m.id}
          style={{ ...r.item, ...(m.id === profile.id ? r.itemMe : {}) }}
        >
          <div style={r.rank}>
            {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
          </div>
          <div
            style={{
              ...r.avatar,
              background: m.id === profile.id ? "#1a7a4a" : "#e8e8e8",
              color: m.id === profile.id ? "#fff" : "#555",
            }}
          >
            {m.name
              ?.split(" ")
              .map((n: string) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={r.name}>
              {m.name}
              {m.id === profile.id ? " (Du)" : ""}
            </div>
            <div style={r.sub}>{m.schichten_count ?? 0} Schichten</div>
          </div>
          <div style={r.score}>{m.punkte}P</div>
        </div>
      ))}
    </div>
  );
}

const r: Record<string, React.CSSProperties> = {
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: ".04em",
    margin: "0 0 12px",
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    background: "#fff",
    borderRadius: 10,
    marginBottom: 7,
    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
  },
  itemMe: { border: "2px solid #1a7a4a" },
  rank: { fontSize: 20, minWidth: 32, textAlign: "center" },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 600,
  },
  name: { fontSize: 14, fontWeight: 500 },
  sub: { fontSize: 12, color: "#888" },
  score: { fontSize: 16, fontWeight: 700, color: "#1a7a4a" },
};
