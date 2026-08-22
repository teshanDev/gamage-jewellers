import React, { useState, useEffect } from "react";
import { calculateCostFromPercentage, validateCostInputs } from "./goldCalc.js";

const P = { ink: "#1a1712", panel: "#211d17", line: "#3a342a", gold: "#c9a227", paper: "#f3efe6", mute: "#9b9282", red: "#d98c8c", green: "#7fb685" };
const LAB = { fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: P.mute, display: "block", marginBottom: 4 };
const iconBtn = (color) => ({ background: "none", border: "none", color, cursor: "pointer", fontSize: 14, padding: "2px 5px", opacity: 0.75 });
function inp(extra = {}) {
  return { background: P.ink, border: `1px solid ${P.line}`, color: P.paper, padding: "8px 10px", borderRadius: 6, fontFamily: "inherit", fontSize: 14, width: "100%", ...extra };
}

export default function CostCalculator({ token, API_BASE }) {
  const [form, setForm] = useState({ pricePerGram22k: "", percentage: "", initialWeight: "", preview: null });
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchHistory();
  }, [token]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/calculators/cost`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load history");
      const data = await res.json();
      setHistory(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setForm(prev => {
      const updated = { ...prev, [field]: value };
      
      if (updated.pricePerGram22k && updated.percentage && updated.initialWeight) {
        const result = calculateCostFromPercentage(
          parseFloat(updated.percentage),
          parseFloat(updated.pricePerGram22k),
          parseFloat(updated.initialWeight)
        );
        updated.preview = result;
      } else {
        updated.preview = null;
      }
      return updated;
    });
  };

  const handleSubmit = async () => {
    const { pricePerGram22k, percentage, initialWeight } = form;
    
    if (!pricePerGram22k || !percentage || !initialWeight) {
      setError("Please fill in all fields");
      return;
    }

    const validationErrors = validateCostInputs(parseFloat(percentage), parseFloat(pricePerGram22k), parseFloat(initialWeight));
    if (validationErrors) {
      setError("Invalid input");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/calculators/cost`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ pricePerGram22k, percentage, initialWeight })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save calculation");
      
      setForm({ pricePerGram22k: "", percentage: "", initialWeight: "", preview: null });
      fetchHistory();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/calculators/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to delete entry");
      fetchHistory();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ background: P.panel, border: `1px solid ${P.line}`, borderRadius: 12, padding: 28, marginBottom: 28 }}>
        <h2 style={{ marginTop: 0, marginBottom: 20, fontSize: 18, color: P.gold }}>Cost Calculator</h2>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          <div>
            <label style={LAB}>Price 22K (Rs/g)</label>
            <input
              value={form.pricePerGram22k}
              onChange={(e) => handleInputChange('pricePerGram22k', e.target.value)}
              placeholder="e.g. 44625"
              style={inp()}
            />
          </div>
          <div>
            <label style={LAB}>Wastage %</label>
            <input
              value={form.percentage}
              onChange={(e) => handleInputChange('percentage', e.target.value)}
              placeholder="e.g. 108.88"
              style={inp()}
            />
          </div>
          <div>
            <label style={LAB}>Initial Weight, 22K (g)</label>
            <input
              value={form.initialWeight}
              onChange={(e) => handleInputChange('initialWeight', e.target.value)}
              placeholder="e.g. 4.13"
              style={inp()}
            />
          </div>
          <div style={{ padding: "0 12px", borderLeft: `1px solid ${P.line}` }}>
            <label style={LAB}>Result (Preview)</label>
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: P.mute }}>Cost (Rs)</div>
              <div style={{ fontFamily: "'SF Mono', Menlo, monospace", fontSize: 18, color: form.preview !== null && form.preview !== undefined ? P.gold : P.mute }}>
                {form.preview !== null && form.preview !== undefined ? form.preview.toFixed(0) : "--"}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button 
            onClick={() => setForm({ pricePerGram22k: "", percentage: "", initialWeight: "", preview: null })} 
            style={{ padding: "10px 24px", background: "transparent", color: P.mute, border: `1px solid ${P.line}`, borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}
          >
            Clear
          </button>
          <button 
            onClick={handleSubmit} 
            style={{ padding: "10px 24px", background: P.gold, color: P.ink, border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}
          >
            Calculate & Save
          </button>
        </div>

        {error && (
          <div style={{ background: "#3a1a1a", border: `1px solid ${P.red}`, borderRadius: 8, padding: "10px 14px", color: P.red, marginTop: 16, fontSize: 14, display: "flex", justifyContent: "space-between" }}>
            <span>{error}</span>
            <button onClick={() => setError(null)} style={iconBtn(P.red)}>✕</button>
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 16, fontWeight: "bold", marginBottom: 16 }}>Calculation History</div>
        {loading ? (
          <div style={{ color: P.mute, fontStyle: "italic", textAlign: "center", padding: "40px 0" }}>Loading…</div>
        ) : history.length === 0 ? (
          <div style={{ color: P.mute, fontStyle: "italic", textAlign: "center", padding: "40px 0" }}>No calculations yet.</div>
        ) : (
          <div style={{ border: `1px solid ${P.line}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", padding: "10px 14px", background: P.panel, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: P.mute }}>
              <span>Date</span>
              <span>Price 22K</span>
              <span>Wastage %</span>
              <span>Init Wt</span>
              <span>Result (Cost)</span>
              <span>Actions</span>
            </div>
            {history.map((entry) => (
              <div key={entry._id} style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", padding: "12px 16px", borderTop: `1px solid ${P.line}`, alignItems: "center", fontSize: 13 }}>
                <span>{new Date(entry.createdAt).toLocaleDateString("en-GB")}</span>
                <span>Rs {entry.pricePerGram22k.toFixed(2)}</span>
                <span>{entry.percentage?.toFixed(2) ?? "--"}%</span>
                <span>{entry.initialWeight.toFixed(3)}g</span>
                <span style={{ color: P.gold }}>Rs {entry.computedCost?.toFixed(0) ?? "--"}</span>
                <span>
                  <button onClick={() => handleDelete(entry._id)} style={iconBtn(P.red)}>✕</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
