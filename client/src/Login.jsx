import { useState } from "react";
import HorseMark from "./HorseMark.jsx";

const P = { ink: "#1a1712", panel: "#211d17", line: "#3a342a", gold: "#c9a227", paper: "#f3efe6", mute: "#9b9282", red: "#d98c8c" };
const LAB = { display: "block", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: P.mute, marginBottom: 4 };
const INP = { background: P.ink, border: `1px solid ${P.line}`, color: P.paper, padding: "10px 12px", borderRadius: 8, fontFamily: "inherit", fontSize: 15, width: "100%", boxSizing: "border-box" };

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export default function Login({ onLogin, initialError }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState(initialError || null);
  const [loading,  setLoading]  = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/auth/login`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 && data.error === "outside_operating_hours") {
          throw new Error(data.message || "Access Denied: The system is currently closed. Operating hours for your role are 7:00 AM to 8:00 PM.");
        }
        throw new Error(data.error || "Request failed");
      }
      onLogin(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: P.ink, fontFamily: "Georgia, 'Times New Roman', serif" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>

        {/* brand mark above the card */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, color: P.gold }}>
          <HorseMark width={56} />
          <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase" }}>Gamage Jewellers</div>
        </div>

        <form onSubmit={submit} style={{ width: 360, background: P.panel, border: `1px solid ${P.line}`, borderRadius: 14, padding: 32 }}>
          <div style={{ fontSize: 22, color: P.paper, marginBottom: 28 }}>Sign in</div>

          {error && (
            <div style={{ background: "#3a1a1a", border: `1px solid ${P.red}`, borderRadius: 6, padding: "8px 12px", color: P.red, marginBottom: 16, fontSize: 13 }}>{error}</div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={LAB}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={INP} autoFocus />
          </div>
          <div style={{ marginBottom: 26 }}>
            <label style={LAB}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={INP} />
          </div>

          <button type="submit" disabled={loading}
            style={{ width: "100%", padding: "11px 0", background: P.gold, color: P.ink, border: "none", borderRadius: 8, cursor: loading ? "default" : "pointer", fontFamily: "inherit", fontSize: 15, opacity: loading ? 0.7 : 1 }}>
            {loading ? "Please wait…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
