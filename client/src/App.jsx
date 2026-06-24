import { useState, useCallback } from "react";
import GoldLedger from "./GoldLedger.jsx";
import Login from "./Login.jsx";

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("gl_token"));
  const [user,  setUser]  = useState(() => {
    try { return JSON.parse(localStorage.getItem("gl_user")); } catch { return null; }
  });

  const [logoutReason, setLogoutReason] = useState(null);

  const handleLogin = useCallback((token, user) => {
    localStorage.setItem("gl_token", token);
    localStorage.setItem("gl_user", JSON.stringify(user));
    setToken(token);
    setUser(user);
  }, []);

  const handleLogout = useCallback((reason = null) => {
    localStorage.removeItem("gl_token");
    localStorage.removeItem("gl_user");
    setToken(null);
    setUser(null);
    if (reason) setLogoutReason(reason);
  }, []);

  if (!token) return <Login onLogin={handleLogin} initialError={logoutReason === "outside_operating_hours" ? "Access Denied: The system is currently closed. Operating hours for your role are 7:00 AM to 8:00 PM." : null} />;
  return <GoldLedger token={token} user={user} onLogout={handleLogout} />;
}
