import { useState, useEffect, useCallback } from "react";
import { Trash2 } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";
const P = { ink: "#000", paper: "#fff", panel: "#111", gold: "#eab308", line: "#333", mute: "#9ca3af" };
const inp = () => ({ width: "100%", boxSizing: "border-box", padding: "10px 12px", background: P.ink, color: P.paper, border: `1px solid ${P.line}`, borderRadius: 8, fontFamily: "inherit", fontSize: 14, outline: "none", marginTop: 4 });

export default function CostCalculator({ token }) {
  const [percentage, setPercentage] = useState("");
  const [initialWeight22k, setInitialWeight22k] = useState("");
  const [price1g22k, setPrice1g22k] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/calculators/cost`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setHistory(data);
    } catch (err) {
      console.error("Failed to fetch history:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchHistory().catch(console.error);
  }, [fetchHistory]);

  const handleCalculate = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/calculators/cost`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ 
          percentage: Number(percentage), 
          initialWeight22k: Number(initialWeight22k), 
          price1g22k: Number(price1g22k) 
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Calculation failed");
      setResult(data.outputs);
      setError(null);
      fetchHistory().catch(console.error); // refresh history
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this calculation record?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/calculators/cost/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setHistory(history.filter(record => record._id !== id));
      } else {
        const data = await res.json();
        console.error("Delete failed:", data.error);
      }
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 20 }}>
      <h2 style={{ color: P.gold, fontFamily: "inherit", fontSize: 24, marginBottom: 20 }}>Cost Calculator</h2>
      
      <div style={{ display: "flex", gap: 30, flexDirection: "column" }}>
        <form onSubmit={handleCalculate} style={{ display: "flex", flexDirection: "column", gap: 16, background: P.panel, padding: 20, borderRadius: 10, border: `1px solid ${P.line}` }}>
          <div>
            <label style={{ color: P.mute, fontSize: 13, textTransform: "uppercase", letterSpacing: 1 }}>Percentage (%)</label>
            <input type="number" step="any" required value={percentage} onChange={(e) => setPercentage(e.target.value)} style={inp()} />
          </div>
          <div>
            <label style={{ color: P.mute, fontSize: 13, textTransform: "uppercase", letterSpacing: 1 }}>Initial Weight 22K (g)</label>
            <input type="number" step="any" required value={initialWeight22k} onChange={(e) => setInitialWeight22k(e.target.value)} style={inp()} />
          </div>
          <div>
            <label style={{ color: P.mute, fontSize: 13, textTransform: "uppercase", letterSpacing: 1 }}>Price per 1g 22K (Rs)</label>
            <input type="number" step="any" required value={price1g22k} onChange={(e) => setPrice1g22k(e.target.value)} style={inp()} />
          </div>
          <button type="submit" style={{ padding: "12px", background: P.gold, color: P.ink, border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: 15, marginTop: 10 }}>Calculate</button>
        </form>
        
        {error && <div style={{ color: "#ef4444" }}>{error}</div>}
        
        {result && (
          <div style={{ background: P.panel, padding: 20, borderRadius: 10, border: `1px solid ${P.gold}` }}>
            <h3 style={{ color: P.paper, marginTop: 0, marginBottom: 16 }}>Result</h3>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: P.mute }}>Cost (Rs):</span>
              <span style={{ color: P.gold, fontWeight: "bold", fontSize: 18 }}>{result.costRs != null ? result.costRs.toLocaleString() : "—"}</span>
            </div>
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          <h3 style={{ color: P.paper, fontFamily: "inherit", fontSize: 20, marginBottom: 16 }}>History</h3>
          {loading ? (
            <div style={{ color: P.mute }}>Loading history...</div>
          ) : history.length === 0 ? (
            <div style={{ color: P.mute, fontStyle: "italic" }}>No previous calculations found.</div>
          ) : (
            <div style={{ overflowX: "auto", border: `1px solid ${P.line}`, borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
                <thead style={{ background: P.panel, color: P.mute, textTransform: "uppercase", letterSpacing: 1 }}>
                  <tr>
                    <th style={{ padding: "12px 14px", borderBottom: `1px solid ${P.line}`, fontWeight: "normal" }}>Date</th>
                    <th style={{ padding: "12px 14px", borderBottom: `1px solid ${P.line}`, fontWeight: "normal" }}>Percentage</th>
                    <th style={{ padding: "12px 14px", borderBottom: `1px solid ${P.line}`, fontWeight: "normal" }}>Init Weight (g)</th>
                    <th style={{ padding: "12px 14px", borderBottom: `1px solid ${P.line}`, fontWeight: "normal", textAlign: "right" }}>Cost (Rs)</th>
                    <th style={{ padding: "12px 14px", borderBottom: `1px solid ${P.line}`, fontWeight: "normal", width: "40px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((record) => {
                    const date = record.createdAt || record.date;
                    const inputs = record.inputs || {};
                    const outputs = record.outputs || {};
                    return (
                      <tr key={record._id} style={{ borderBottom: `1px solid ${P.line}` }}>
                        <td style={{ padding: "12px 14px", color: P.paper }} className="font-sans tabular-nums lining-nums">{formatDate(date)}</td>
                        <td style={{ padding: "12px 14px", color: P.mute }} className="font-sans tabular-nums lining-nums">{inputs.percentage != null ? `${inputs.percentage}%` : "—"}</td>
                        <td style={{ padding: "12px 14px", color: P.mute }} className="font-sans tabular-nums lining-nums">{inputs.initialWeight22k ?? "—"}</td>
                        <td style={{ padding: "12px 14px", color: P.gold, fontWeight: "bold", textAlign: "right" }} className="font-sans tabular-nums lining-nums">{outputs.costRs != null ? outputs.costRs.toLocaleString() : "—"}</td>
                        <td style={{ padding: "12px 14px", textAlign: "right" }}>
                          <button 
                            onClick={() => handleDelete(record._id)}
                            className="text-gray-500 hover:text-red-500 transition-colors"
                            style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                            title="Delete Record"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
