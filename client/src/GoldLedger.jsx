import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import HorseMark from "./HorseMark.jsx";
import {
  AreaChart, Area, BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Cell,
} from "recharts";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

const getPhotoUrl = (photo) => {
  if (!photo) return null;
  const path = photo.startsWith('/') ? photo : `/uploads/${photo}`;
  return `${API_BASE}${path}`;
};

// ── display helpers ──────────────────────────────────────────────────────────
const mgToG = (mg) =>
  (mg / 1000).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const centsToRs = (c) =>
  "Rs " + (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function lastEditor(r) {
  const fmtDate = (d) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  if (r.history?.length) {
    const last = r.history[r.history.length - 1];
    return `Edited by ${last.changedBy?.name ?? "unknown"} · ${fmtDate(last.changedAt)}`;
  }
  return `Added by ${r.createdBy?.name ?? "unknown"} · ${fmtDate(r.createdAt)}`;
}

function describe(r) {
  switch (r.type) {
    case "SALE":         return `${mgToG(r.weightMg)} g @ ${r.ratePct}%`;
    case "RETURN":       return `${mgToG(r.weightMg)} g @ ${r.ratePct}% (22kt)`;
    case "GOLD_PAYMENT": return `${mgToG(r.weightMg)} g 24kt`;
    case "CASH_PAYMENT": return `${centsToRs(r.cashCents)} @ ${centsToRs(r.pricePerGramCents)}/g`;
    default: return "";
  }
}

function downloadCSV(account, rows) {
  const header = ["Date","Type","Details","Weight (g)","Rate (%)","Cash (Rs)","Price (Rs/g)","Change (g 24kt)","Balance (g 24kt)"];
  const fmtMg = (mg) => mg != null ? (mg / 1000).toFixed(3) : "";
  const fmtC  = (c)  => c  != null ? (c  / 100).toFixed(2)  : "";
  const q     = (s)  => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((r) => [
    new Date(r.date).toLocaleDateString("en-GB"), r.type, q(r.details),
    fmtMg(r.weightMg), r.ratePct ?? "", fmtC(r.cashCents), fmtC(r.pricePerGramCents),
    (r.amountMg / 1000).toFixed(3), (r.runningBalanceMg / 1000).toFixed(3),
  ].join(","));
  const csv  = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `${account.name.replace(/\s+/g,"-")}-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function validateEntry(type, date, details, f) {
  const e = {};
  if (!details.trim()) e.details = "Required";
  if (type === "SALE" || type === "RETURN" || type === "GOLD_PAYMENT") {
    const w = parseFloat(f.weight);
    if (!f.weight || isNaN(w) || w <= 0) e.weight = "Enter a positive number";
  }
  if (type === "SALE" || type === "RETURN") {
    const r = parseFloat(f.rate);
    if (!f.rate || isNaN(r) || r <= 0) e.rate = "Enter a valid percentage";
  }
  if (type === "CASH_PAYMENT") {
    const c = parseFloat(f.cash);
    if (!f.cash || isNaN(c) || c <= 0) e.cash = "Enter a positive amount";
    const p = parseFloat(f.price);
    if (!f.price || isNaN(p) || p <= 0) e.price = "Enter a positive price";
  }
  return e;
}

// ── palette & style helpers ──────────────────────────────────────────────────
const P = { ink: "#1a1712", panel: "#211d17", line: "#3a342a", gold: "#c9a227", paper: "#f3efe6", mute: "#9b9282", red: "#d98c8c", green: "#7fb685" };
const LAB      = { fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: P.mute, display: "block", marginBottom: 4 };
const iconBtn  = (color) => ({ background: "none", border: "none", color, cursor: "pointer", fontSize: 14, padding: "2px 5px", opacity: 0.75 });
function inp(extra = {}) {
  return { background: P.ink, border: `1px solid ${P.line}`, color: P.paper, padding: "8px 10px", borderRadius: 6, fontFamily: "inherit", fontSize: 14, width: "100%", ...extra };
}

const TYPE_META = {
  SALE:         { label: "Sale",         color: "#c9a227" },
  RETURN:       { label: "Return",       color: "#8fa9c0" },
  GOLD_PAYMENT: { label: "Gold payment", color: P.green   },
  CASH_PAYMENT: { label: "Cash payment", color: P.green   },
};

// ── root component ───────────────────────────────────────────────────────────
export default function GoldLedger({ token, user, onLogout }) {
  const isAdmin = user?.role === "admin";

  const [view,             setView]             = useState("overview"); // "overview"|"accounts"|"users"|"profile"
  const [accounts,         setAccounts]         = useState([]);
  const [archivedAccounts, setArchivedAccounts] = useState([]);
  const [showArchived,     setShowArchived]     = useState(false);
  const [stats,            setStats]            = useState([]);
  const [activeId,         setActiveId]         = useState(null);
  const [activeAccount,    setActiveAccount]    = useState(null);
  const [loadingList,      setLoadingList]      = useState(true);
  const [loadingLedger,    setLoadingLedger]    = useState(false);
  const [listError,        setListError]        = useState(null);
  const [error,            setError]            = useState(null);
  const [showAddEntry,     setShowAddEntry]     = useState(false);
  const [showNewAcct,      setShowNewAcct]      = useState(false);
  const [editTarget,       setEditTarget]       = useState(null);
  const [search,           setSearch]           = useState("");
  const [lightboxPhoto,    setLightboxPhoto]    = useState(null);
  const [isCollapsed,      setIsCollapsed]      = useState(false);
  const [showProfileMenu,  setShowProfileMenu]  = useState(false);
  const [activeActionMenu, setActiveActionMenu] = useState(null);

  useEffect(() => {
    function handleClickOutside(event) {
      try {
        const el = event.target.nodeType === 3 ? event.target.parentNode : event.target;
        if (el && typeof el.closest === 'function' && !el.closest('.action-menu-container')) {
          setActiveActionMenu(prev => (prev ? null : prev));
        }
      } catch (e) {
        // ignore safely
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const api = useMemo(() => {
    const apiFetch = async (path, opts = {}) => {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: {
          ...(opts.body != null ? { "Content-Type": "application/json" } : {}),
          Authorization: `Bearer ${token}`,
        },
        ...opts,
        body: opts.body != null ? JSON.stringify(opts.body) : undefined,
      });
      if (res.status === 401) { onLogout(); throw new Error("Session expired"); }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      return data;
    };
    const apiMultipart = async (path, method, fields, photo) => {
      const fd = new FormData();
      Object.entries(fields).forEach(([k, v]) => { if (v != null) fd.append(k, String(v)); });
      if (photo) fd.append("photo", photo);
      const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.status === 401) { onLogout(); throw new Error("Session expired"); }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      return data;
    };
    return {
      getAccounts:         ()         => apiFetch("/accounts"),
      getArchivedAccounts: ()         => apiFetch("/accounts/archived"),
      getStats:            ()         => apiFetch("/accounts/stats"),
      createAccount:       (d)        => apiFetch("/accounts",               { method: "POST",  body: d }),
      getAccount:          (id)       => apiFetch(`/accounts/${id}`),
      archiveAccount:      (id)       => apiFetch(`/accounts/${id}/archive`,  { method: "PATCH" }),
      unarchiveAccount:    (id)       => apiFetch(`/accounts/${id}/unarchive`,{ method: "PATCH" }),
      createEntry:         (aid, d)   => { const { photo, ...fields } = d; return apiMultipart(`/accounts/${aid}/entries`, "POST", fields, photo); },
      updateEntry:         (id, d)    => { const { photo, removePhoto, ...fields } = d; if (removePhoto) fields.removePhoto = "true"; return apiMultipart(`/entries/${id}`, "PATCH", fields, photo); },
      voidEntry:           (id)       => apiFetch(`/entries/${id}/void`,      { method: "PATCH" }),
      getUsers:            ()         => apiFetch("/users"),
      createUser:          (d)        => apiFetch("/auth/register",           { method: "POST",  body: d }),
      updateUserRole:      (id, role) => apiFetch(`/users/${id}/role`,        { method: "PATCH", body: { role } }),
      deactivateUser:      (id)       => apiFetch(`/users/${id}/deactivate`,  { method: "PATCH" }),
      reactivateUser:      (id)       => apiFetch(`/users/${id}/reactivate`,  { method: "PATCH" }),
    };
  }, [token, onLogout]);

  const loadAccounts = useCallback(async () => {
    try {
      setLoadingList(true); setListError(null);
      setAccounts(await api.getAccounts());
    } catch (e) {
      if (e.message !== "Session expired") setListError(e.message);
    } finally { setLoadingList(false); }
  }, [api]);

  const loadArchivedAccounts = useCallback(async () => {
    try { setArchivedAccounts(await api.getArchivedAccounts()); }
    catch (e) { if (e.message !== "Session expired") setError(e.message); }
  }, [api]);

  const loadStats = useCallback(async () => {
    try { setStats(await api.getStats()); }
    catch { /* non-critical, charts just won't render */ }
  }, [api]);

  const loadLedger = useCallback(async (id) => {
    if (!id) return;
    try {
      setLoadingLedger(true);
      setActiveAccount(await api.getAccount(id));
    } catch (e) {
      if (e.message !== "Session expired") setError(e.message);
    } finally { setLoadingLedger(false); }
  }, [api]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { if (isAdmin) loadArchivedAccounts(); }, [isAdmin, loadArchivedAccounts]);
  useEffect(() => { setActiveAccount(null); loadLedger(activeId); }, [activeId, loadLedger]);

  const navigate = (newView) => {
    setView(newView);
    setError(null);
    if (newView === "accounts") {
      setActiveId(null);
    }
    if (newView !== "accounts") {
      setShowAddEntry(false);
      setEditTarget(null);
      setShowNewAcct(false);
    }
  };

  const selectAccount = (id) => {
    setActiveId(id);
    setView("accounts");
    setShowAddEntry(false);
    setEditTarget(null);
    setError(null);
  };

  const handleCreateAccount = async (data) => {
    try {
      const acc = await api.createAccount(data);
      await loadAccounts();
      setShowNewAcct(false);
      selectAccount(acc._id);
    } catch (e) { if (e.message !== "Session expired") setError(e.message); }
  };

  const handleAddEntry = async (data) => {
    try {
      await api.createEntry(activeId, data);
      await Promise.all([loadAccounts(), loadLedger(activeId), loadStats()]);
      setShowAddEntry(false);
    } catch (e) { if (e.message !== "Session expired") setError(e.message); }
  };

  const handleEditEntry = async (id, data) => {
    try {
      await api.updateEntry(id, data);
      await Promise.all([loadAccounts(), loadLedger(activeId)]);
      setEditTarget(null);
    } catch (e) { if (e.message !== "Session expired") setError(e.message); }
  };

  const handleVoidEntry = async (id) => {
    if (!window.confirm("Void this entry? It will be excluded from the balance.")) return;
    try {
      await api.voidEntry(id);
      await Promise.all([loadAccounts(), loadLedger(activeId), loadStats()]);
    } catch (e) { if (e.message !== "Session expired") setError(e.message); }
  };

  const handleArchiveAccount = async () => {
    if (!window.confirm("Archive this account? It will be hidden from the active list but all entries are kept.")) return;
    try {
      await api.archiveAccount(activeId);
      await Promise.all([loadAccounts(), loadArchivedAccounts()]);
      setActiveId(null);
    } catch (e) { if (e.message !== "Session expired") setError(e.message); }
  };

  const handleUnarchiveAccount = async () => {
    try {
      await api.unarchiveAccount(activeId);
      await Promise.all([loadAccounts(), loadArchivedAccounts()]);
    } catch (e) { if (e.message !== "Session expired") setError(e.message); }
  };

  const rows    = activeAccount?.ledger ?? [];
  const balance = rows.length ? rows[rows.length - 1].runningBalanceMg : 0;

  const q = search.trim().toLowerCase();
  const allAccountsToFilter = [...accounts, ...(isAdmin ? archivedAccounts : [])];
  const filteredAccounts = q
    ? allAccountsToFilter.filter((a) => a.name.toLowerCase().includes(q) || (a.place ?? "").toLowerCase().includes(q))
    : allAccountsToFilter;

  // ── nav item renderer ──────────────────────────────────────────────────────
  const NAV_ICONS = {
    overview: () => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
        <rect x="3" y="3" width="7" height="9" />
        <rect x="14" y="3" width="7" height="5" />
        <rect x="14" y="12" width="7" height="9" />
        <rect x="3" y="16" width="7" height="5" />
      </svg>
    ),
    accounts: () => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
    users: () => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    profile: () => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    )
  };

  const NavItem = ({ id, label }) => {
    const active = view === id;
    const IconComponent = NAV_ICONS[id];
    return (
      <button onClick={() => navigate(id)}
        className={`nav-item ${active ? "active" : ""} ${isCollapsed ? "collapsed" : ""}`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: isCollapsed ? "center" : "flex-start",
          width: "100%",
          padding: isCollapsed ? "11px 0" : "11px 14px",
          background: active ? P.ink : "transparent",
          border: "none",
          borderRadius: 8,
          borderLeft: `3px solid ${active ? P.gold : "transparent"}`,
          color: active ? P.paper : P.mute,
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 14,
          transition: "all 0.2s ease-in-out",
          WebkitTapHighlightColor: "transparent",
        }}>
        <span style={{
          fontSize: 16,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: isCollapsed ? 24 : "auto",
          color: active ? P.gold : P.mute,
          transition: "color 0.2s ease-in-out"
        }}>
          {IconComponent ? <IconComponent /> : "•"}
        </span>
        {!isCollapsed && (
          <span className="nav-label" style={{ marginLeft: 10, display: "inline-block" }}>
            {label}
          </span>
        )}
      </button>
    );
  };

  return (
    <div style={{ display: "flex", height: "100vh", background: P.ink, color: P.paper, fontFamily: "Georgia, 'Times New Roman', serif", overflow: "hidden" }}>
      <style>{`
        .nav-item {
          transition: all 0.2s ease-in-out;
        }
        .nav-item:hover {
          background: rgba(201, 162, 39, 0.08) !important;
          color: #f3efe6 !important;
        }
        .nav-item:hover .nav-label {
          transform: translateX(4px);
        }
        .nav-label {
          transition: transform 0.2s ease-in-out;
        }
        .brand-header {
          transition: all 0.2s ease-in-out;
        }
        .brand-header:hover {
          filter: brightness(1.2);
          opacity: 0.95;
        }
        .signout-btn {
          transition: all 0.2s ease;
        }
        .signout-btn:hover {
          border-color: #c9a227 !important;
          color: #c9a227 !important;
          background: rgba(201, 162, 39, 0.04) !important;
        }
        .dropdown-item {
          transition: all 0.2s ease-in-out;
        }
        .dropdown-item:hover {
          background: #1a1712 !important;
          color: #c9a227 !important;
        }
        .dropdown-item-danger {
          transition: all 0.2s ease-in-out;
        }
        .dropdown-item-danger:hover {
          background: #1a1712 !important;
          color: #d98c8c !important;
        }
        .ledger-row-action {
          opacity: 0.4;
          transition: all 0.2s;
        }
        .ledger-row:hover .ledger-row-action {
          opacity: 1 !important;
        }
        .ledger-row-action:hover {
          color: #c9a227 !important;
        }
      `}</style>

      {/* ── persistent nav ── */}
      <nav style={{
        width: isCollapsed ? 76 : 190,
        background: P.panel,
        borderRight: `1px solid ${P.line}`,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        transition: "width 0.3s ease-in-out",
        position: "relative",
        overflow: isCollapsed ? "visible" : "hidden"
      }}>
        <div onClick={() => { setIsCollapsed(!isCollapsed); setShowProfileMenu(false); }}
          className="brand-header"
          style={{
            padding: "18px 16px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: isCollapsed ? "center" : "flex-start",
            gap: 10,
            color: P.gold,
            cursor: "pointer",
            userSelect: "none",
            transition: "all 0.2s ease-in-out"
          }}>
          <HorseMark width={22} style={{ flexShrink: 0 }} />
          {!isCollapsed && (
            <span style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", fontWeight: "bold" }}>
              Gamage Jewellers
            </span>
          )}
        </div>

        <div style={{ flex: 1, padding: "0 10px", display: "flex", flexDirection: "column", gap: 2 }}>
          <NavItem id="overview" label="Overview" />
          <NavItem id="accounts" label="Accounts" />
          {isAdmin && <NavItem id="users" label="Users & Access" />}
          <NavItem id="profile" label="My Profile" />
        </div>

        {!isCollapsed ? (
          <div style={{ padding: "16px 18px", borderTop: `1px solid ${P.line}`, overflow: "hidden" }}>
            <div style={{ fontSize: 12, color: P.paper, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.name}</div>
            <div style={{ fontSize: 10, color: P.mute, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.role}</div>
            <button onClick={onLogout}
              className="signout-btn"
              style={{ width: "100%", padding: "7px 0", background: "transparent", color: P.mute, border: `1px solid ${P.line}`, borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Sign out
            </button>
          </div>
        ) : (
          <div style={{ padding: "16px 0", borderTop: `1px solid ${P.line}`, display: "flex", justifyContent: "center", position: "relative" }}>
            <button onClick={() => setShowProfileMenu(!showProfileMenu)}
              style={{
                width: 36, height: 36, borderRadius: "50%", background: P.line, color: P.gold,
                border: `1px solid ${P.gold}`, display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", fontSize: 14, fontWeight: "bold", fontFamily: "inherit", position: "relative"
              }}>
              {user?.name ? user.name[0].toUpperCase() : "U"}
            </button>
            
            {showProfileMenu && (
              <div style={{
                position: "absolute", bottom: 60, left: 12, width: 150,
                background: P.panel, border: `1px solid ${P.line}`, borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)", padding: 10, zIndex: 50,
                display: "flex", flexDirection: "column", gap: 6
              }}>
                <div style={{ fontSize: 11, color: P.paper, fontWeight: "bold", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{user?.name}</div>
                <div style={{ fontSize: 9, color: P.mute, textTransform: "uppercase", letterSpacing: 1 }}>{user?.role}</div>
                <hr style={{ border: "none", borderTop: `1px solid ${P.line}`, margin: "4px 0" }} />
                <button onClick={onLogout}
                  className="signout-btn"
                  style={{
                    padding: "6px 0", width: "100%", background: "transparent", color: P.red,
                    border: `1px solid ${P.red}`, borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: "inherit"
                  }}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </nav>



      {/* ── main content ── */}
      <main style={{ flex: 1, overflowY: "auto", padding: 28, minWidth: 0 }}>

        {error && (
          <div style={{ background: "#3a1a1a", border: `1px solid ${P.red}`, borderRadius: 8, padding: "10px 14px", color: P.red, marginBottom: 16, fontSize: 14, display: "flex", justifyContent: "space-between" }}>
            <span>{error}</span>
            <button onClick={() => setError(null)} style={iconBtn(P.red)}>✕</button>
          </div>
        )}

        {/* Overview */}
        {view === "overview" && (
          loadingList
            ? <div style={{ color: P.mute, fontStyle: "italic", marginTop: 80, textAlign: "center" }}>Loading…</div>
            : <OverviewPanel accounts={accounts} onSelect={selectAccount} stats={stats} />
        )}

        {/* Accounts view */}
        {view === "accounts" && (
          !activeId ? (
            // View A: Accounts Directory
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search accounts…"
                  style={{ ...inp(), width: 320, fontSize: 14 }}
                />
                <button onClick={() => setShowNewAcct(true)}
                  style={{ padding: "10px 18px", background: P.gold, color: P.ink, border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: "bold" }}>
                  + New Account
                </button>
              </div>
              
              {showNewAcct && (
                <div style={{ background: P.panel, border: `1px solid ${P.line}`, borderRadius: 10, padding: 18 }}>
                  <CreateAccountForm
                    onSubmit={(data) => { handleCreateAccount(data); setShowNewAcct(false); }}
                    onCancel={() => setShowNewAcct(false)}
                  />
                </div>
              )}

              {filteredAccounts.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: P.mute, fontStyle: "italic", border: `1px dashed ${P.line}`, borderRadius: 10 }}>
                  {q ? "No accounts match your search." : "No accounts found. Create one above."}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                  {filteredAccounts.map((a) => {
                    const bal = a.balanceMg ?? 0;
                    return (
                      <div key={a._id} onClick={() => selectAccount(a._id)}
                        style={{ background: P.panel, border: `1px solid ${P.line}`, borderRadius: 10, padding: 20, cursor: "pointer", transition: "transform 0.2s, background 0.2s, borderColor 0.2s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.transform = "scale(1.02)"; e.currentTarget.style.borderColor = P.gold; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = P.panel; e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.borderColor = P.line; }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                          <div style={{ fontSize: 18, color: P.paper, fontFamily: "Georgia, serif", fontWeight: "bold" }}>{a.name}</div>
                          {a.archived && (
                            <span style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: P.mute, border: `1px solid ${P.line}`, borderRadius: 4, padding: "2px 6px" }}>Archived</span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: P.mute, fontStyle: "italic", marginBottom: 16 }}>{a.place || "No location"}</div>
                        <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: P.mute, marginBottom: 6 }}>Balance Owed</div>
                        <div style={{ fontFamily: "'SF Mono', Menlo, monospace", fontSize: 22, color: bal < 0 ? P.red : bal === 0 ? P.mute : P.gold }}>
                          {bal < 0 ? "−" : ""}{mgToG(Math.abs(bal))} <span style={{ fontSize: 13, color: P.mute }}>g</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            // View B: Dedicated Ledger View
            loadingLedger ? (
              <div style={{ color: P.mute, fontStyle: "italic", marginTop: 80, textAlign: "center" }}>Loading…</div>
            ) : activeAccount ? (
              <>
                <button onClick={() => setActiveId(null)}
                  style={{ background: "none", border: "none", color: P.gold, fontSize: 14, fontFamily: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 0", marginBottom: 24 }}>
                  <span>←</span> Back to Accounts
                </button>
                
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 26 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ color: P.paper, fontSize: 28, lineHeight: 1.1, fontFamily: "inherit", fontWeight: "bold" }}>
                        {activeAccount.name}
                      </div>
                      {activeAccount?.archived && (
                        <span style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: P.mute, border: `1px solid ${P.line}`, borderRadius: 4, padding: "2px 6px" }}>Archived</span>
                      )}
                    </div>
                    <div style={{ color: P.mute, fontStyle: "italic", fontSize: 14, marginTop: 6 }}>
                      {activeAccount.place}{activeAccount.phone ? ` · ${activeAccount.phone}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: P.mute }}>Balance owed</div>
                    <div style={{ fontFamily: "'SF Mono', Menlo, monospace", fontSize: 32, color: balance >= 0 ? P.gold : P.red }}>
                      {balance < 0 ? "−" : ""}{mgToG(Math.abs(balance))} <span style={{ fontSize: 14, color: P.mute }}>g · 24kt</span>
                    </div>
                  </div>
                </div>

                {/* toolbar */}
                <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
                  {!activeAccount.archived && (
                    <button onClick={() => setShowAddEntry((s) => !s)}
                      style={{ padding: "9px 16px", background: showAddEntry ? "transparent" : P.gold, color: showAddEntry ? P.gold : P.ink, border: `1px solid ${P.gold}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>
                      {showAddEntry ? "Cancel" : "+ New entry"}
                    </button>
                  )}
                  {rows.length > 0 && (
                    <button onClick={() => downloadCSV(activeAccount, rows)}
                      style={{ padding: "9px 14px", background: "transparent", color: P.mute, border: `1px solid ${P.line}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
                      ↓ Export CSV
                    </button>
                  )}
                  {isAdmin && !activeAccount.archived && (
                    <button onClick={handleArchiveAccount}
                      style={{ marginLeft: "auto", padding: "9px 14px", background: "transparent", color: P.mute, border: `1px solid ${P.line}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
                      Archive
                    </button>
                  )}
                  {isAdmin && activeAccount.archived && (
                    <button onClick={handleUnarchiveAccount}
                      style={{ marginLeft: "auto", padding: "9px 14px", background: "transparent", color: P.gold, border: `1px solid ${P.gold}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
                      Unarchive
                    </button>
                  )}
                </div>

                {showAddEntry && <EntryForm onSubmit={handleAddEntry} onCancel={() => setShowAddEntry(false)} />}

                {/* ledger table */}
                <div style={{ border: `1px solid ${P.line}`, borderRadius: 10, overflow: "visible" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "88px 70px 1fr 120px 110px 130px 64px", padding: "10px 14px", background: P.panel, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: P.mute, borderTopLeftRadius: 9, borderTopRightRadius: 9 }}>
                    <span>Date</span><span>Photo</span><span>Detail</span><span>Type</span>
                    <span style={{ textAlign: "right" }}>Change (g)</span>
                    <span style={{ textAlign: "right" }}>Balance (g)</span>
                    <span />
                  </div>
                  {rows.length === 0 && (
                    <div style={{ padding: 24, textAlign: "center", color: P.mute, fontStyle: "italic" }}>No entries yet.</div>
                  )}
                  {rows.map((r, idx) => {
                    const isBottomRow = idx >= rows.length - 2 && rows.length > 3;
                    const m = TYPE_META[r.type];
                    return (
                      <div key={r._id} className="ledger-row" style={{ display: "grid", gridTemplateColumns: "88px 70px 1fr 120px 110px 130px 64px", padding: "12px 14px", borderTop: `1px solid ${P.line}`, alignItems: "center" }}>
                        <span style={{ color: P.mute, fontFamily: "Georgia, serif", fontSize: 13 }}>
                          {new Date(r.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                        </span>
                        
                        {/* Photo Column */}
                        <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center" }}>
                          {r.photo ? (
                            <button
                              onClick={() => setLightboxPhoto(getPhotoUrl(r.photo))}
                              style={{
                                background: "none", border: "none", padding: 0, cursor: "pointer",
                                width: 48, height: 48, position: "relative"
                              }}
                            >
                              <img
                                src={getPhotoUrl(r.photo)}
                                alt="Item preview"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  e.currentTarget.nextSibling.style.display = 'flex';
                                }}
                                style={{
                                  width: "100%", height: "100%", objectFit: "cover",
                                  border: `1px solid ${P.gold}`, borderRadius: 6,
                                  transition: "transform 0.15s ease-in-out"
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.08)"}
                                onMouseLeave={(e) => e.currentTarget.style.transform = "none"}
                              />
                              <div
                                style={{
                                  display: "none", width: "100%", height: "100%",
                                  background: P.ink, border: `1px solid ${P.line}`, borderRadius: 6,
                                  alignItems: "center", justifyContent: "center", color: P.mute
                                }}
                                title="Image failed to load"
                              >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                                  <circle cx="12" cy="13" r="4"></circle>
                                </svg>
                              </div>
                            </button>
                          ) : (
                            <span style={{ color: P.mute, marginLeft: 16 }}>—</span>
                          )}
                        </div>

                        <span style={{ fontFamily: "Georgia, serif", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                          <span style={{ color: P.paper, fontSize: 15, fontWeight: 600 }}>{r.details}</span>
                          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{describe(r)}</div>
                          <div style={{ fontSize: 10, color: "#737373", marginTop: 2 }}>{lastEditor(r)}</div>
                        </span>
                        <span style={{ color: m.color, fontFamily: "Georgia, serif", fontSize: 12 }}>{m.label}</span>
                        <span style={{ textAlign: "right", fontFamily: "'SF Mono', Menlo, monospace", fontSize: 13, color: r.amountMg >= 0 ? P.gold : P.green }}>
                          {r.amountMg >= 0 ? "+" : ""}{mgToG(r.amountMg)}
                        </span>
                        <span style={{ textAlign: "right", fontFamily: "'SF Mono', Menlo, monospace", fontSize: 13, color: r.runningBalanceMg < 0 ? P.red : P.paper }}>
                          {r.runningBalanceMg < 0 ? "−" : ""}{mgToG(Math.abs(r.runningBalanceMg))}
                        </span>
                        <span style={{ textAlign: "right", position: "relative" }} className="action-menu-container">
                          {(user?.role !== "operator" || isAdmin) && (
                            <button
                              className="ledger-row-action"
                              onClick={() => setActiveActionMenu(activeActionMenu === r._id ? null : r._id)}
                              style={{
                                background: "none", border: "none", cursor: "pointer", padding: "4px 0",
                                color: activeActionMenu === r._id ? P.gold : P.mute,
                                display: "inline-flex", alignItems: "center", justifyContent: "center"
                              }}
                            >
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="1"></circle>
                                <circle cx="12" cy="5" r="1"></circle>
                                <circle cx="12" cy="19" r="1"></circle>
                              </svg>
                            </button>
                          )}
                          
                          {activeActionMenu === r._id && (
                            <div style={{
                              position: "absolute", right: 0,
                              ...(isBottomRow ? { bottom: "100%", marginBottom: 4 } : { top: "100%", marginTop: 4 }),
                              zIndex: 50,
                              background: P.panel, border: `1px solid ${P.line}`, borderRadius: 8,
                              boxShadow: "0 4px 12px rgba(0,0,0,0.5)", padding: "6px 0",
                              display: "flex", flexDirection: "column", minWidth: 120
                            }}>
                              {user?.role !== "operator" && (
                                <button
                                  className="dropdown-item"
                                  onClick={() => { setEditTarget(r); setActiveActionMenu(null); }}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
                                    background: "transparent", border: "none", color: P.paper, cursor: "pointer",
                                    fontFamily: "inherit", fontSize: 13, width: "100%", textAlign: "left"
                                  }}
                                >
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 20h9"></path>
                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                                  </svg>
                                  Edit
                                </button>
                              )}
                              {isAdmin && (
                                <button
                                  className="dropdown-item-danger"
                                  onClick={() => { handleVoidEntry(r._id); setActiveActionMenu(null); }}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
                                    background: "transparent", border: "none", color: P.red, cursor: "pointer",
                                    fontFamily: "inherit", fontSize: 13, width: "100%", textAlign: "left"
                                  }}
                                >
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  </svg>
                                  Delete
                                </button>
                              )}
                            </div>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div style={{ color: P.mute, fontStyle: "italic", marginTop: 80, textAlign: "center" }}>
                Account not found.
              </div>
            )
          )
        )}

        {/* Users & Access */}
        {view === "users" && (
          <UserManagement api={api} currentUserId={user?.sub ?? user?._id} />
        )}

        {/* My Profile */}
        {view === "profile" && <MyProfile user={user} />}

      </main>

      {editTarget && (
        <EditModal entry={editTarget} onSubmit={(d) => handleEditEntry(editTarget._id, d)} onClose={() => setEditTarget(null)} />
      )}
      {lightboxPhoto && (
        <PhotoLightbox src={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />
      )}
    </div>
  );
}

// ── OverviewPanel ─────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, unit = "g" }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: P.panel, border: `1px solid ${P.line}`, borderRadius: 8, padding: "10px 14px", fontSize: 12, fontFamily: "Georgia, serif" }}>
      <div style={{ color: P.mute, marginBottom: 6 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color, marginTop: 2 }}>
          {p.name}: {Number(p.value).toFixed(3)} {unit}
        </div>
      ))}
    </div>
  );
}

function OverviewPanel({ accounts, onSelect, stats }) {
  const owed   = accounts.filter((a) => a.balanceMg > 0).reduce((s, a) => s + a.balanceMg, 0);
  const credit = accounts.filter((a) => a.balanceMg < 0).reduce((s, a) => s + a.balanceMg, 0);
  const net    = owed + credit;
  const sorted = [...accounts].sort((a, b) => b.balanceMg - a.balanceMg);

  // Top accounts by positive balance for bar chart — reads from computeBalance results
  const topAccounts = sorted
    .filter((a) => a.balanceMg > 0)
    .slice(0, 8)
    .map((a) => ({ name: a.name.length > 16 ? a.name.slice(0, 14) + "…" : a.name, balanceG: a.balanceMg / 1000 }))
    .reverse(); // recharts horizontal bar reads bottom-to-top

  // Monthly chart data — reads from entryAmountMg results via /accounts/stats
  const monthlyData = stats.map(({ month, salesMg, settlementsMg }) => ({
    month: new Date(month + "-02").toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
    salesG:       salesMg       / 1000,
    settlementsG: settlementsMg / 1000,
  }));

  // Rate margin — last 12 months, continuous (zero-filled for months with no data).
  // Bucketed by entry `date` field on the server, not createdAt.
  // Server computes per month (integer mg throughout):
  //   SALE:   marginMg += round(weightMg × ratePct / 100) − weightMg
  //   RETURN: marginMg −= round(weightMg × ratePct / 100) − weightMg
  // Division by 1000 happens only at display time — all accumulation stays in mg.
  const now = new Date();
  const last12Keys = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 1));
    return d.toISOString().slice(0, 7); // "YYYY-MM"
  });
  const marginChartData = last12Keys.map((key) => {
    const entry = stats.find((s) => s.month === key);
    return {
      month:   new Date(key + "-02").toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
      marginG: (entry?.marginMg ?? 0) / 1000,
    };
  });

  const statCard = (label, valueMg, color) => (
    <div style={{ background: P.panel, border: `1px solid ${P.line}`, borderRadius: 10, padding: "16px 20px" }}>
      <div style={{ ...LAB, marginBottom: 10 }}>{label}</div>
      <div style={{ fontFamily: "'SF Mono', Menlo, monospace", fontSize: 22, color }}>
        {valueMg < 0 ? "−" : ""}{mgToG(Math.abs(valueMg))}
        <span style={{ fontSize: 11, color: P.mute, marginLeft: 5 }}>g · 24kt</span>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
        <div style={{ fontSize: 22 }}>Overview</div>
        <div style={{ fontSize: 12, color: P.mute }}>{accounts.length} account{accounts.length !== 1 ? "s" : ""}</div>
      </div>

      {accounts.length === 0 ? (
        <div style={{ color: P.mute, fontStyle: "italic", marginTop: 40, textAlign: "center" }}>
          No accounts yet — go to Accounts to create one.
        </div>
      ) : (
        <>
          {/* stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
            {statCard("Total owed",   owed,             P.gold)}
            {statCard("Total credit", Math.abs(credit), "#8fa9c0")}
            {statCard("Net balance",  net,              net >= 0 ? P.gold : P.red)}
          </div>

          {/* rate margin — 12-month line chart, full width */}
          <div style={{ background: P.panel, border: `1px solid ${P.line}`, borderRadius: 10, padding: "18px 20px", marginBottom: 20 }}>
            <div style={{ ...LAB, marginBottom: 14 }}>Rate Margin per Month (g · 24kt)</div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={marginChartData} margin={{ left: 0, right: 10, top: 8, bottom: 0 }}>
                <CartesianGrid stroke={P.line} strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fill: P.mute, fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: P.mute, fontSize: 10 }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => v.toFixed(2)} unit=" g" width={56} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="marginG" name="Margin"
                  stroke={P.green} strokeWidth={2} dot={{ fill: P.green, r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* charts */}
          <div style={{ display: "grid", gridTemplateColumns: topAccounts.length > 0 ? "1fr 1fr" : "1fr", gap: 20, marginBottom: 28 }}>

            {/* top accounts by balance */}
            {topAccounts.length > 0 && (
              <div style={{ background: P.panel, border: `1px solid ${P.line}`, borderRadius: 10, padding: "18px 20px" }}>
                <div style={{ ...LAB, marginBottom: 16 }}>Top accounts by balance owed</div>
                <ResponsiveContainer width="100%" height={Math.max(topAccounts.length * 36, 120)}>
                  <BarChart data={topAccounts} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
                    <CartesianGrid horizontal={false} stroke={P.line} />
                    <XAxis type="number" dataKey="balanceG" tick={{ fill: P.mute, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => v.toFixed(1)} unit=" g" />
                    <YAxis type="category" dataKey="name" tick={{ fill: P.mute, fontSize: 11, fontFamily: "Georgia, serif" }} tickLine={false} axisLine={false} width={90} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="balanceG" name="Balance" radius={[0, 4, 4, 0]}>
                      {topAccounts.map((_, i) => <Cell key={i} fill={P.gold} fillOpacity={0.7 + (i / topAccounts.length) * 0.3} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* monthly sales vs settlements */}
            {monthlyData.length > 0 && (
              <div style={{ background: P.panel, border: `1px solid ${P.line}`, borderRadius: 10, padding: "18px 20px" }}>
                <div style={{ ...LAB, marginBottom: 16 }}>Monthly sales vs settlements</div>
                <ResponsiveContainer width="100%" height={Math.max(topAccounts.length * 36, 120)}>
                  <AreaChart data={monthlyData} margin={{ left: 0, right: 10, top: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={P.gold}  stopOpacity={0.3} />
                        <stop offset="95%" stopColor={P.gold}  stopOpacity={0}   />
                      </linearGradient>
                      <linearGradient id="settleGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={P.green} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={P.green} stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={P.line} strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fill: P.mute, fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: P.mute, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => v.toFixed(1)} unit=" g" width={52} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="salesG"       name="Sales"       stroke={P.gold}  strokeWidth={2} fill="url(#salesGrad)"  />
                    <Area type="monotone" dataKey="settlementsG" name="Settlements" stroke={P.green} strokeWidth={2} fill="url(#settleGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* accounts table */}
          <div style={{ border: `1px solid ${P.line}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 160px", padding: "10px 16px", background: P.panel, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: P.mute }}>
              <span>Account</span><span>Place</span><span style={{ textAlign: "right" }}>Balance (g · 24kt)</span>
            </div>
            {sorted.map((a) => {
              const bal = a.balanceMg;
              return (
                <div key={a._id} onClick={() => onSelect(a._id)}
                  style={{ display: "grid", gridTemplateColumns: "1fr 120px 160px", padding: "12px 16px", borderTop: `1px solid ${P.line}`, alignItems: "center", cursor: "pointer" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = P.panel}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                  <span style={{ fontFamily: "Georgia, serif", fontSize: 14, color: P.paper }}>{a.name}</span>
                  <span style={{ fontStyle: "italic", color: P.mute, fontSize: 13 }}>{a.place}</span>
                  <span style={{ textAlign: "right", fontFamily: "'SF Mono', Menlo, monospace", fontSize: 14, color: bal < 0 ? P.red : bal === 0 ? P.mute : P.gold }}>
                    {bal < 0 ? "−" : ""}{mgToG(Math.abs(bal))}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── MyProfile ─────────────────────────────────────────────────────────────────
function MyProfile({ user }) {
  const ROLE_COLOR = { admin: P.gold, staff: P.mute, operator: "#8fa9c0" };
  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ fontSize: 22, marginBottom: 28 }}>My Profile</div>
      <div style={{ background: P.panel, border: `1px solid ${P.line}`, borderRadius: 12, padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
        {[["Name", user?.name], ["Email", user?.email]].map(([label, value]) => (
          <div key={label}>
            <div style={LAB}>{label}</div>
            <div style={{ fontSize: 16, color: P.paper }}>{value}</div>
          </div>
        ))}
        <div>
          <div style={LAB}>Role</div>
          <div style={{ fontSize: 14, color: ROLE_COLOR[user?.role] ?? P.mute, textTransform: "uppercase", letterSpacing: 1 }}>{user?.role}</div>
        </div>
      </div>
    </div>
  );
}

// ── CreateAccountForm ────────────────────────────────────────────────────────
function CreateAccountForm({ onSubmit, onCancel }) {
  const [name,      setName]      = useState("");
  const [place,     setPlace]     = useState("");
  const [phone,     setPhone]     = useState("");
  const [nameError, setNameError] = useState("");

  const submit = () => {
    if (!name.trim()) { setNameError("Name is required"); return; }
    onSubmit({ name: name.trim(), place: place.trim() || undefined, phone: phone.trim() || undefined });
  };

  const s = { ...inp(), fontSize: 13, padding: "7px 9px", marginBottom: 6 };

  return (
    <div>
      <input value={name} onChange={(e) => { setName(e.target.value); setNameError(""); }} placeholder="Name *" style={{ ...s, borderColor: nameError ? P.red : P.line }} autoFocus />
      {nameError && <div style={{ fontSize: 11, color: P.red, marginBottom: 6, marginTop: -2 }}>{nameError}</div>}
      <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Place" style={s} />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" style={{ ...s, marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} style={{ flex: 1, padding: "8px 0", background: P.gold, color: P.ink, border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>Create</button>
        <button onClick={onCancel} style={{ flex: 1, padding: "8px 0", background: "transparent", color: P.mute, border: `1px solid ${P.line}`, borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>Cancel</button>
      </div>
    </div>
  );
}

// ── EntryForm ────────────────────────────────────────────────────────────────
function EntryForm({ onSubmit, onCancel }) {
  const [type,    setType]    = useState("SALE");
  const [date,    setDate]    = useState(new Date().toISOString().slice(0, 10));
  const [details, setDetails] = useState("");
  const [f,       setF]       = useState({ weight: "", rate: "103", cash: "", price: "" });
  const [errors,  setErrors]  = useState({});
  const [photo,        setPhoto]        = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const fileInputRef = useRef(null);

  const needsWeight = type === "SALE" || type === "RETURN" || type === "GOLD_PAYMENT";
  const needsRate   = type === "SALE" || type === "RETURN";
  const needsPhoto  = type === "SALE" || type === "RETURN";

  useEffect(() => {
    if (!photo) { setPhotoPreview(null); return; }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  // Clear photo when switching away from SALE/RETURN
  useEffect(() => {
    if (!needsPhoto) { setPhoto(null); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }, [needsPhoto]);

  const submit = () => {
    const errs = validateEntry(type, date, details, f);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    const base = { date, type, details: details.trim() };
    if (needsWeight) base.weightMg = Math.round(parseFloat(f.weight) * 1000);
    if (needsRate)   base.ratePct  = parseFloat(f.rate);
    if (type === "CASH_PAYMENT") {
      base.cashCents         = Math.round(parseFloat(f.cash)  * 100);
      base.pricePerGramCents = Math.round(parseFloat(f.price) * 100);
    }
    if (photo) base.photo = photo;
    onSubmit(base);
    setPhoto(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const field = (label, key, placeholder, extraProps = {}) => (
    <div>
      <label style={LAB}>{label}</label>
      <input value={f[key] ?? ""} onChange={(e) => { setF({ ...f, [key]: e.target.value }); setErrors((prev) => ({ ...prev, [key]: undefined })); }}
        placeholder={placeholder} style={{ ...inp(), borderColor: errors[key] ? P.red : P.line }} {...extraProps} />
      {errors[key] && <div style={{ fontSize: 11, color: P.red, marginTop: 3 }}>{errors[key]}</div>}
    </div>
  );

  return (
    <div style={{ background: P.panel, border: `1px solid ${P.line}`, borderRadius: 10, padding: 18, marginBottom: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={LAB}>Type</label>
          <select value={type} onChange={(e) => { setType(e.target.value); setErrors({}); }} style={inp()}>
            {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label style={LAB}>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp()} />
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <label style={LAB}>Details</label>
          <input value={details} onChange={(e) => { setDetails(e.target.value); setErrors((prev) => ({ ...prev, details: undefined })); }}
            placeholder="e.g. Chain, Bracelet" style={{ ...inp(), borderColor: errors.details ? P.red : P.line }} />
          {errors.details && <div style={{ fontSize: 11, color: P.red, marginTop: 3 }}>{errors.details}</div>}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        {needsWeight && field("Weight (g)", "weight", "12.200")}
        {needsRate   && field("Rate (%)",   "rate",   "103")}
        {type === "CASH_PAYMENT" && field("Cash (Rs)", "cash", "45000.00")}
        {type === "CASH_PAYMENT" && field("24kt price / g (Rs)", "price", "36800.00")}
      </div>
      {needsPhoto && (
        <div style={{ marginTop: 12 }}>
          <label style={LAB}>Photo</label>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
            onChange={(e) => { if (e.target.files?.[0]) setPhoto(e.target.files[0]); }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="button" onClick={() => fileInputRef.current?.click()}
              style={{ padding: "6px 14px", background: "transparent", color: P.mute, border: `1px solid ${P.line}`, borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>
              📷 {photo ? "Change photo" : "Attach photo"}
            </button>
            {photoPreview && (
              <div style={{ position: "relative", display: "inline-block" }}>
                <img src={photoPreview} alt="Preview" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 6, border: `1px solid ${P.line}` }} />
                <button type="button" onClick={() => { setPhoto(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: P.red, color: P.ink, border: "none", cursor: "pointer", fontSize: 11, lineHeight: "18px", textAlign: "center", padding: 0 }}>×</button>
              </div>
            )}
          </div>
        </div>
      )}
      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        <button onClick={submit} style={{ padding: "9px 18px", background: P.gold, color: P.ink, border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>Add to ledger</button>
        <button onClick={onCancel} style={{ padding: "9px 18px", background: "transparent", color: P.mute, border: `1px solid ${P.line}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>Cancel</button>
      </div>
    </div>
  );
}

// ── UserManagement ───────────────────────────────────────────────────────────
function UserManagement({ api, currentUserId }) {
  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]   = useState(null);

  const loadUsers = useCallback(async () => {
    try { setLoading(true); setError(null); setUsers(await api.getUsers()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [api]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleCreate = async (data) => {
    try { await api.createUser(data); await loadUsers(); setShowForm(false); }
    catch (e) { setError(e.message); }
  };

  const handleRoleChange = async (id, role) => {
    setSaving(id);
    try { const u = await api.updateUserRole(id, role); setUsers((prev) => prev.map((x) => x._id === id ? u : x)); }
    catch (e) { setError(e.message); }
    finally { setSaving(null); }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm("Deactivate this user? They will not be able to log in. You can reactivate them later.")) return;
    setSaving(id);
    try { const u = await api.deactivateUser(id); setUsers((prev) => prev.map((x) => x._id === id ? u : x)); }
    catch (e) { setError(e.message); }
    finally { setSaving(null); }
  };

  const handleReactivate = async (id) => {
    setSaving(id);
    try { const u = await api.reactivateUser(id); setUsers((prev) => prev.map((x) => x._id === id ? u : x)); }
    catch (e) { setError(e.message); }
    finally { setSaving(null); }
  };

  const ROLE_COLOR = { admin: P.gold, staff: P.mute, operator: "#8fa9c0" };
  const active   = users.filter((u) => u.active !== false);
  const inactive = users.filter((u) => u.active === false);

  const UserRow = ({ u, dimmed }) => {
    const isSelf = u._id === currentUserId;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 200px 130px 100px 80px", padding: "12px 16px", borderTop: `1px solid ${P.line}`, alignItems: "center", opacity: dimmed ? 0.5 : 1 }}>
        <span style={{ fontFamily: "Georgia, serif", fontSize: 14, color: P.paper }}>
          {u.name}{isSelf && <span style={{ fontSize: 10, color: P.mute, marginLeft: 6, textTransform: "uppercase" }}>you</span>}
        </span>
        <span style={{ fontSize: 13, color: P.mute }}>{u.email}</span>
        <span>
          {isSelf || dimmed ? (
            <span style={{ fontSize: 12, color: ROLE_COLOR[u.role], textTransform: "uppercase", letterSpacing: 1 }}>{u.role}</span>
          ) : (
            <select value={u.role} disabled={saving === u._id} onChange={(e) => handleRoleChange(u._id, e.target.value)}
              style={{ background: P.ink, border: `1px solid ${P.line}`, color: ROLE_COLOR[u.role], borderRadius: 6, padding: "4px 8px", fontFamily: "inherit", fontSize: 12, cursor: "pointer", opacity: saving === u._id ? 0.5 : 1 }}>
              <option value="operator">operator</option>
              <option value="staff">staff</option>
              <option value="admin">admin</option>
            </select>
          )}
        </span>
        <span style={{ fontSize: 12, color: P.mute }}>
          {new Date(u.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
        <span style={{ textAlign: "right" }}>
          {!isSelf && !dimmed && (
            <button onClick={() => handleDeactivate(u._id)} disabled={saving === u._id}
              style={{ fontSize: 11, color: P.mute, background: "none", border: `1px solid ${P.line}`, borderRadius: 5, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit", opacity: saving === u._id ? 0.5 : 1 }}>
              Deactivate
            </button>
          )}
          {dimmed && (
            <button onClick={() => handleReactivate(u._id)} disabled={saving === u._id}
              style={{ fontSize: 11, color: P.gold, background: "none", border: `1px solid ${P.gold}`, borderRadius: 5, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit", opacity: saving === u._id ? 0.5 : 1 }}>
              Reactivate
            </button>
          )}
        </span>
      </div>
    );
  };

  const TableHeader = () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 200px 130px 100px 80px", padding: "10px 16px", background: P.panel, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: P.mute }}>
      <span>Name</span><span>Email</span><span>Role</span><span>Joined</span><span />
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
        <div style={{ fontSize: 22 }}>Users &amp; access</div>
        {!loading && <div style={{ fontSize: 12, color: P.mute }}>{active.length} active{inactive.length > 0 ? `, ${inactive.length} inactive` : ""}</div>}
      </div>

      {error && (
        <div style={{ background: "#3a1a1a", border: `1px solid ${P.red}`, borderRadius: 8, padding: "10px 14px", color: P.red, marginBottom: 16, fontSize: 14, display: "flex", justifyContent: "space-between" }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={iconBtn(P.red)}>✕</button>
        </div>
      )}

      <button onClick={() => setShowForm((s) => !s)}
        style={{ marginBottom: 16, padding: "9px 16px", background: showForm ? "transparent" : P.gold, color: showForm ? P.gold : P.ink, border: `1px solid ${P.gold}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>
        {showForm ? "Cancel" : "+ New user"}
      </button>

      {showForm && <CreateUserForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />}

      {loading ? (
        <div style={{ color: P.mute, fontStyle: "italic", marginTop: 40, textAlign: "center" }}>Loading…</div>
      ) : (
        <>
          <div style={{ border: `1px solid ${P.line}`, borderRadius: 10, overflow: "hidden", marginBottom: inactive.length > 0 ? 24 : 0 }}>
            <TableHeader />
            {active.length === 0
              ? <div style={{ padding: 24, textAlign: "center", color: P.mute, fontStyle: "italic" }}>No active users.</div>
              : active.map((u) => <UserRow key={u._id} u={u} dimmed={false} />)
            }
          </div>
          {inactive.length > 0 && (
            <>
              <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: P.mute, marginBottom: 10 }}>Deactivated users</div>
              <div style={{ border: `1px solid ${P.line}`, borderRadius: 10, overflow: "hidden" }}>
                <TableHeader />
                {inactive.map((u) => <UserRow key={u._id} u={u} dimmed={true} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── CreateUserForm ────────────────────────────────────────────────────────────
function CreateUserForm({ onSubmit, onCancel }) {
  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [role,     setRole]     = useState("operator");
  const [errors,   setErrors]   = useState({});

  const submit = () => {
    const e = {};
    if (!name.trim())  e.name     = "Required";
    if (!email.trim()) e.email    = "Required";
    if (!password)     e.password = "Required";
    if (Object.keys(e).length) { setErrors(e); return; }
    onSubmit({ name: name.trim(), email: email.trim(), password, role });
  };

  const field = (label, key, type = "text", value, onChange) => (
    <div>
      <label style={LAB}>{label}</label>
      <input type={type} value={value} onChange={(e) => { onChange(e.target.value); setErrors((prev) => ({ ...prev, [key]: undefined })); }}
        style={{ ...inp(), borderColor: errors[key] ? P.red : P.line }} />
      {errors[key] && <div style={{ fontSize: 11, color: P.red, marginTop: 3 }}>{errors[key]}</div>}
    </div>
  );

  return (
    <div style={{ background: P.panel, border: `1px solid ${P.line}`, borderRadius: 10, padding: 18, marginBottom: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {field("Name",     "name",     "text",     name,     setName)}
        {field("Email",    "email",    "email",    email,    setEmail)}
        {field("Password", "password", "password", password, setPassword)}
        <div>
          <label style={LAB}>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}
            style={{ ...inp(), color: role === "admin" ? P.gold : role === "operator" ? "#8fa9c0" : P.mute }}>
            <option value="operator">operator</option>
            <option value="staff">staff</option>
            <option value="admin">admin</option>
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} style={{ padding: "9px 18px", background: P.gold, color: P.ink, border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>Create user</button>
        <button onClick={onCancel} style={{ padding: "9px 18px", background: "transparent", color: P.mute, border: `1px solid ${P.line}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>Cancel</button>
      </div>
    </div>
  );
}

// ── EditModal ────────────────────────────────────────────────────────────────
function EditModal({ entry, onSubmit, onClose }) {
  const [date,    setDate]    = useState(entry.date?.slice(0, 10) ?? "");
  const [details, setDetails] = useState(entry.details ?? "");
  const [weightG, setWeightG] = useState(entry.weightMg          != null ? String(entry.weightMg / 1000)          : "");
  const [ratePct, setRatePct] = useState(entry.ratePct           != null ? String(entry.ratePct)                  : "");
  const [cashRs,  setCashRs]  = useState(entry.cashCents         != null ? String(entry.cashCents / 100)          : "");
  const [priceRs, setPriceRs] = useState(entry.pricePerGramCents != null ? String(entry.pricePerGramCents / 100)  : "");
  const [newPhoto,     setNewPhoto]     = useState(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const editFileRef = useRef(null);

  const canHavePhoto = entry.type === "SALE" || entry.type === "RETURN";
  const existingPhotoUrl = entry.photo && !photoRemoved && !newPhoto ? getPhotoUrl(entry.photo) : null;

  useEffect(() => {
    if (!newPhoto) { setPhotoPreview(null); return; }
    const url = URL.createObjectURL(newPhoto);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [newPhoto]);

  const i = inp({ background: P.panel });

  const submit = () => {
    const data = { date, details };
    if (entry.type === "SALE" || entry.type === "RETURN" || entry.type === "GOLD_PAYMENT")
      data.weightMg = Math.round(parseFloat(weightG) * 1000);
    if (entry.type === "SALE" || entry.type === "RETURN")
      data.ratePct  = parseFloat(ratePct);
    if (entry.type === "CASH_PAYMENT") {
      data.cashCents         = Math.round(parseFloat(cashRs)  * 100);
      data.pricePerGramCents = Math.round(parseFloat(priceRs) * 100);
    }
    if (newPhoto) data.photo = newPhoto;
    else if (photoRemoved) data.removePhoto = true;
    onSubmit(data);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: P.ink, border: `1px solid ${P.line}`, borderRadius: 12, padding: 24, width: 440, maxWidth: "90vw" }}>
        <div style={{ fontSize: 15, marginBottom: 18 }}>
          Edit entry <span style={{ color: P.mute, fontSize: 13 }}>({TYPE_META[entry.type]?.label})</span>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={LAB}>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={i} /></div>
            <div><label style={LAB}>Details</label><input value={details} onChange={(e) => setDetails(e.target.value)} style={i} /></div>
          </div>
          {(entry.type === "SALE" || entry.type === "RETURN" || entry.type === "GOLD_PAYMENT") && (
            <div style={{ display: "grid", gridTemplateColumns: entry.type === "GOLD_PAYMENT" ? "1fr" : "1fr 1fr", gap: 12 }}>
              <div><label style={LAB}>Weight (g)</label><input value={weightG} onChange={(e) => setWeightG(e.target.value)} style={i} /></div>
              {(entry.type === "SALE" || entry.type === "RETURN") && (
                <div><label style={LAB}>Rate (%)</label><input value={ratePct} onChange={(e) => setRatePct(e.target.value)} style={i} /></div>
              )}
            </div>
          )}
          {entry.type === "CASH_PAYMENT" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={LAB}>Cash (Rs)</label><input value={cashRs} onChange={(e) => setCashRs(e.target.value)} style={i} /></div>
              <div><label style={LAB}>24kt price / g (Rs)</label><input value={priceRs} onChange={(e) => setPriceRs(e.target.value)} style={i} /></div>
            </div>
          )}
          {canHavePhoto && (
            <div>
              <label style={LAB}>Photo</label>
              <input ref={editFileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
                onChange={(e) => { if (e.target.files?.[0]) { setNewPhoto(e.target.files[0]); setPhotoRemoved(false); } }} />
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button type="button" onClick={() => editFileRef.current?.click()}
                  style={{ padding: "6px 14px", background: "transparent", color: P.mute, border: `1px solid ${P.line}`, borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>
                  📷 {existingPhotoUrl || photoPreview ? "Replace photo" : "Attach photo"}
                </button>
                {existingPhotoUrl && (
                  <div style={{ position: "relative", display: "inline-block" }}>
                    <img src={existingPhotoUrl} alt="Existing" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, border: `1px solid ${P.line}` }} />
                    <button type="button" onClick={() => { setPhotoRemoved(true); setNewPhoto(null); if (editFileRef.current) editFileRef.current.value = ""; }}
                      style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: P.red, color: P.ink, border: "none", cursor: "pointer", fontSize: 11, lineHeight: "18px", textAlign: "center", padding: 0 }}>×</button>
                  </div>
                )}
                {photoPreview && (
                  <div style={{ position: "relative", display: "inline-block" }}>
                    <img src={photoPreview} alt="New" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, border: `1px solid ${P.gold}` }} />
                    <button type="button" onClick={() => { setNewPhoto(null); if (editFileRef.current) editFileRef.current.value = ""; }}
                      style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: P.red, color: P.ink, border: "none", cursor: "pointer", fontSize: 11, lineHeight: "18px", textAlign: "center", padding: 0 }}>×</button>
                  </div>
                )}
                {photoRemoved && !newPhoto && <span style={{ fontSize: 11, color: P.red, fontStyle: "italic" }}>Photo will be removed</span>}
              </div>
            </div>
          )}
        </div>
        <div style={{ marginTop: 18, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose}  style={{ padding: "9px 16px", background: "transparent", color: P.mute, border: `1px solid ${P.line}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>Cancel</button>
          <button onClick={submit}   style={{ padding: "9px 18px", background: P.gold, color: P.ink, border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>Save changes</button>
        </div>
      </div>
    </div>
  );
}

// ── PhotoLightbox ────────────────────────────────────────────────────────────
function PhotoLightbox({ src, onClose }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        animation: "fadeIn .25s ease-out",
      }}>
      <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
      <button onClick={onClose}
        style={{
          position: "absolute", top: 24, right: 24, background: "none",
          border: "none", color: "#f3efe6", cursor: "pointer",
          opacity: 0.8, padding: 8, display: "flex", alignItems: "center", justifyContent: "center"
        }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      {hasError ? (
        <div onClick={(e) => e.stopPropagation()} style={{
          background: "#1a1712", border: "1px solid #363127", borderRadius: 12,
          padding: 40, display: "flex", flexDirection: "column", alignItems: "center",
          gap: 16, color: "#9ca3af"
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
            <circle cx="12" cy="13" r="4"></circle>
            <line x1="4" y1="4" x2="20" y2="20"></line>
          </svg>
          <div style={{ fontSize: 16, fontFamily: "Georgia, serif", color: "#f3efe6" }}>Image Failed to Load</div>
          <div style={{ fontSize: 13 }}>The requested photo could not be retrieved.</div>
        </div>
      ) : (
        <img src={src} alt="Entry photo" onClick={(e) => e.stopPropagation()} onError={() => setHasError(true)}
          style={{
            maxWidth: "90vw", maxHeight: "80vh", borderRadius: 10,
            boxShadow: "0 8px 40px rgba(0,0,0,0.6)", objectFit: "contain",
          }} />
      )}
    </div>
  );
}
