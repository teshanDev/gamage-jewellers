import { useState, useCallback } from "react";
import GoldLedger from "./GoldLedger.jsx";
import Login from "./Login.jsx";

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("gl_token"));
  const [user,  setUser]  = useState(() => {
    try { return JSON.parse(localStorage.getItem("gl_user")); } catch { return null; }
  });

  const handleLogin = useCallback((token, user) => {
    localStorage.setItem("gl_token", token);
    localStorage.setItem("gl_user", JSON.stringify(user));
    setToken(token);
    setUser(user);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("gl_token");
    localStorage.removeItem("gl_user");
    setToken(null);
    setUser(null);
  }, []);

  if (!token) return <Login onLogin={handleLogin} />;
  return <GoldLedger token={token} user={user} onLogout={handleLogout} />;
}
