import { useState } from "react";
import { supabase } from "../supabaseClient";

type Mode = "login" | "register" | "reset";

export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function reset() {
    setError("");
    setMessage("");
  }

  async function handleLogin() {
    setLoading(true);
    reset();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) setError("E-Mail oder Passwort falsch.");
    setLoading(false);
  }

  async function handleRegister() {
    if (!name.trim()) {
      setError("Bitte Namen eingeben.");
      return;
    }
    setLoading(true);
    reset();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error || !data.user) {
      setError(error?.message ?? "Fehler.");
      setLoading(false);
      return;
    }
    await supabase
      .from("profiles")
      .insert({
        id: data.user.id,
        email,
        name,
        punkte: 0,
        schichten_count: 0,
        is_admin: false,
      });
    setMessage("Registrierung erfolgreich! Bitte E-Mail bestätigen.");
    setLoading(false);
  }

  async function handleReset() {
    setLoading(true);
    reset();
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) setError(error.message);
    else setMessage("Reset-Link wurde gesendet!");
    setLoading(false);
  }

  const submit =
    mode === "login"
      ? handleLogin
      : mode === "register"
      ? handleRegister
      : handleReset;

  return (
    <div style={s.wrap}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: 12,
          }}
        >
          <img
            src="/LOGO-SSV-BOPPARD-_1_.png"
            alt="SSV Boppard Logo"
            style={{ width: 140, height: 140, objectFit: "contain" }}
          />
        </div>
        <h1 style={s.title}>SSV Boppard</h1>
        <p style={s.sub}>Schichtplaner 1920 e.V.</p>
      </div>

      <div style={s.card}>
        <h2 style={s.cardTitle}>
          {mode === "login"
            ? "Anmelden"
            : mode === "register"
            ? "Registrieren"
            : "Passwort zurücksetzen"}
        </h2>

        {mode === "register" && (
          <div style={s.field}>
            <label style={s.label}>Vor- und Nachname</label>
            <input
              style={s.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Max Mustermann"
            />
          </div>
        )}
        <div style={s.field}>
          <label style={s.label}>E-Mail</label>
          <input
            style={s.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="max@beispiel.de"
          />
        </div>
        {mode !== "reset" && (
          <div style={s.field}>
            <label style={s.label}>Passwort</label>
            <input
              style={s.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
        )}

        {error && <div style={s.error}>{error}</div>}
        {message && <div style={s.success}>{message}</div>}

        <button style={s.btnPrimary} onClick={submit} disabled={loading}>
          {loading
            ? "Bitte warten..."
            : mode === "login"
            ? "Anmelden"
            : mode === "register"
            ? "Konto erstellen"
            : "Reset-Link senden"}
        </button>

        <div style={s.links}>
          {mode === "login" && (
            <>
              <button
                style={s.link}
                onClick={() => {
                  setMode("register");
                  reset();
                }}
              >
                Noch kein Konto? Registrieren
              </button>
              <button
                style={s.link}
                onClick={() => {
                  setMode("reset");
                  reset();
                }}
              >
                Passwort vergessen?
              </button>
            </>
          )}
          {mode !== "login" && (
            <button
              style={s.link}
              onClick={() => {
                setMode("login");
                reset();
              }}
            >
              ← Zurück zur Anmeldung
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100vh",
    background: "#f0f2f5",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  title: { fontSize: 26, fontWeight: 700, color: "#1a7a4a", margin: 0 },
  sub: { fontSize: 13, color: "#888", margin: "4px 0 0" },
  card: {
    background: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    boxShadow: "0 2px 12px rgba(0,0,0,.08)",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 20,
    color: "#1a1a1a",
  },
  field: { marginBottom: 14 },
  label: {
    fontSize: 13,
    fontWeight: 500,
    color: "#444",
    display: "block",
    marginBottom: 5,
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
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 4,
  },
  error: {
    background: "#fdecea",
    color: "#c0392b",
    padding: "10px 12px",
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 12,
  },
  success: {
    background: "#e8f5ee",
    color: "#1a7a4a",
    padding: "10px 12px",
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 12,
  },
  links: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
  },
  link: {
    background: "none",
    border: "none",
    color: "#1a5fa8",
    fontSize: 13,
    cursor: "pointer",
    textDecoration: "underline",
  },
};
