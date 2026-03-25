import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { Profile } from "./types";
import Login from "./screens/Login";
import Home from "./screens/Home";
import Schichten from "./screens/Schichten";
import Rangliste from "./screens/Rangliste";
import Profil from "./screens/Profil";
import Verwaltung from "./screens/Verwaltung";

type TabId = "home" | "schichten" | "rangliste" | "profil" | "verwaltung";

const NAV_TABS = [
  { id: "home" as TabId, icon: "🏠", label: "Start" },
  { id: "schichten" as TabId, icon: "📅", label: "Schichten" },
  { id: "rangliste" as TabId, icon: "🏆", label: "Rangliste" },
  { id: "profil" as TabId, icon: "👤", label: "Profil" },
];

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
      else setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
      else {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    setProfile(data);
    setLoading(false);
  }

  if (loading)
    return (
      <div style={css.loading}>
        <div style={{ fontSize: 52 }}>⚽</div>
        <p style={{ color: "#888", fontSize: 14, marginTop: 12 }}>
          SSV Boppard wird geladen...
        </p>
      </div>
    );

  if (!session) return <Login />;

  const tabs = profile?.is_admin
    ? [...NAV_TABS, { id: "verwaltung" as TabId, icon: "⚙️", label: "Admin" }]
    : NAV_TABS;

  const screenProps = { profile: profile!, onTabChange: setActiveTab };

  return (
    <div style={css.app}>
      <header style={css.header}>
        <div style={css.headerLogo}>
          <SsvLogo />
          <div>
            <div style={css.headerTitle}>SSV Boppard</div>
            <div style={css.headerSub}>Schichtplaner 1920 e.V.</div>
          </div>
        </div>
        <button style={css.avatarBtn} onClick={() => setActiveTab("profil")}>
          {profile?.name
            ?.split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase() || "?"}
        </button>
      </header>

      <main style={css.main}>
        {activeTab === "home" && <Home {...screenProps} />}
        {activeTab === "schichten" && <Schichten {...screenProps} />}
        {activeTab === "rangliste" && <Rangliste {...screenProps} />}
        {activeTab === "profil" && <Profil {...screenProps} />}
        {activeTab === "verwaltung" && profile?.is_admin && (
          <Verwaltung {...screenProps} />
        )}
      </main>

      <nav style={css.nav}>
        {tabs.map((t) => (
          <button
            key={t.id}
            style={{
              ...css.navBtn,
              ...(activeTab === t.id ? css.navBtnActive : {}),
            }}
            onClick={() => setActiveTab(t.id)}
          >
            <span style={{ fontSize: 20 }}>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function SsvLogo() {
  return (
    <div
      style={{
        width: 38,
        height: 38,
        background: "#fff",
        borderRadius: "50%",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg viewBox="0 0 100 115" width="34" height="34">
        <defs>
          <clipPath id="sc">
            <path d="M50,112 Q8,95 8,60 L8,8 L92,8 L92,60 Q92,95 50,112 Z" />
          </clipPath>
        </defs>
        <path
          d="M50,112 Q8,95 8,60 L8,8 L92,8 L92,60 Q92,95 50,112 Z"
          fill="#1a7a4a"
        />
        <polygon
          points="8,42 92,8 92,75 8,110"
          fill="#fff"
          clipPath="url(#sc)"
        />
        <path
          d="M50,112 Q8,95 8,60 L8,8 L92,8 L92,60 Q92,95 50,112 Z"
          fill="none"
          stroke="#0f4f2e"
          strokeWidth="2"
        />
        <g fill="#fff">
          <rect x="18" y="14" width="7" height="26" />
          <rect x="27" y="18" width="7" height="22" />
          <rect x="36" y="14" width="7" height="26" />
          <polygon points="21.5,14 22,8 25,8 25.5,14" />
          <polygon points="30.5,18 31,12 34,12 34.5,18" />
          <polygon points="39.5,14 40,8 43,8 43.5,14" />
          <rect x="17" y="34" width="27" height="4" />
        </g>
        <text
          x="28"
          y="22"
          textAnchor="middle"
          fontSize="10"
          fontWeight="900"
          fill="#fff"
          fontFamily="Arial"
          transform="rotate(-18,28,22)"
        >
          SSV
        </text>
        <text
          x="62"
          y="68"
          textAnchor="middle"
          fontSize="8.5"
          fontWeight="900"
          fill="#1a1a1a"
          fontFamily="Arial"
          transform="rotate(-18,62,68)"
        >
          BOPPARD
        </text>
        <circle
          cx="50"
          cy="96"
          r="10"
          fill="#fff"
          stroke="#1a1a1a"
          strokeWidth="1"
        />
        <polygon points="50,87 54,90 53,95 47,95 46,90" fill="#1a1a1a" />
        <text
          x="62"
          y="88"
          textAnchor="middle"
          fontSize="7"
          fontWeight="700"
          fill="#555"
          fontFamily="Arial"
          transform="rotate(-18,62,88)"
        >
          1920 e.V.
        </text>
      </svg>
    </div>
  );
}

const css: Record<string, React.CSSProperties> = {
  app: {
    maxWidth: 420,
    margin: "0 auto",
    minHeight: "100vh",
    background: "#f0f2f5",
    fontFamily: "system-ui,sans-serif",
  },
  loading: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
  },
  header: {
    background: "#1a7a4a",
    color: "#fff",
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  headerLogo: { display: "flex", alignItems: "center", gap: 10 },
  headerTitle: { fontSize: 15, fontWeight: 700, color: "#fff" },
  headerSub: { fontSize: 11, opacity: 0.8 },
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    background: "rgba(255,255,255,.25)",
    border: "none",
    color: "#fff",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  main: { padding: "14px 12px 80px" },
  nav: {
    position: "fixed",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: "100%",
    maxWidth: 420,
    background: "#fff",
    borderTop: "1px solid #e0e0e0",
    display: "flex",
    zIndex: 100,
  },
  navBtn: {
    flex: 1,
    padding: "10px 4px 8px",
    border: "none",
    background: "none",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    color: "#888",
    fontSize: 10,
  },
  navBtnActive: { color: "#1a7a4a" },
};
