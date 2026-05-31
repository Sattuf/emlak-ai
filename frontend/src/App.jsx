import { useCallback, useEffect, useMemo, useState } from "react";

/** Geliştirmede boş bırakın (Vite proxy). Üretimde: http://127.0.0.1:8000 */
const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const apiUrl = (path) => (API_BASE ? `${API_BASE}${path}` : path);

const SEL = {
  width: "100%",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 13,
  background: "rgba(15,23,42,0.8)",
  border: "1px solid rgba(100,116,139,0.4)",
  color: "#fff",
};

function fmtTL(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + " Milyon ₺";
  if (n >= 1000) return (n / 1000).toFixed(0) + " Bin ₺";
  return n.toFixed(0) + " ₺";
}
function fmtShort(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M ₺";
  if (n >= 1000) return (n / 1000).toFixed(0) + "K ₺";
  return n.toFixed(0) + " ₺";
}

function Sec({ icon, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "18px 0 12px" }}>
      <span style={{ fontSize: 15 }}>{icon}</span>
      <span style={{ fontSize: 10, fontWeight: 800, color: "#f59e0b", letterSpacing: "0.15em" }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg,rgba(245,158,11,0.3),transparent)" }} />
    </div>
  );
}
function Row2({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 4 }}>{children}</div>;
}
function Row3({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 4 }}>{children}</div>;
}
function F({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label
        style={{
          display: "block",
          fontSize: 10,
          fontWeight: 700,
          color: "#475569",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 5,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export default function App() {
  const [meta, setMeta] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [predictErr, setPredictErr] = useState(null);
  const [islem, setIslem] = useState("Satılık");
  const [form, setForm] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(apiUrl("/api/meta"))
      .then((r) => {
        if (!r.ok) throw new Error("API hatası: " + r.status);
        return r.json();
      })
      .then((m) => {
        setLoadErr(null);
        setMeta(m);
        const cities = Object.keys(m.hier?.is || {});
        const c0 = cities[0] || "Tokat";
        const il0 = (m.hier.is[c0] || [])[0] || "";
        setForm({
          Şehir: c0,
          İlçe: il0,
          Konut_Tipi: (m.enc["Konut Tipi"] || ["Daire"])[0],
          Isıtma_Sistemi: (m.enc["Isıtma Sistemi"] || ["Kombi Doğalgaz"])[0],
          m2: "120",
          oda: "3",
          kat: "2",
          bina: (m.bina_ui_labels || ["5-10 Yıl"])[0],
        });
      })
      .catch((e) => setLoadErr(String(e.message || e)));
  }, []);

  const ilceler = useMemo(() => (meta && form ? meta.hier.is[form.Şehir] || [] : []), [meta, form]);

  const upd = useCallback(
    (k, v) => {
      if (!meta) return;
      setForm((p) => {
        if (!p) return p;
        const n = { ...p, [k]: v };
        if (k === "Şehir") {
          const il = (meta.hier.is[v] || [])[0] || "";
          n.İlçe = il;
        }
        return n;
      });
    },
    [meta]
  );

  const run = useCallback(async () => {
    if (!form || !meta) return;
    setBusy(true);
    setResult(null);
    setPredictErr(null);
    const body = {
      islem,
      Şehir: form.Şehir,
      İlçe: form.İlçe,
      "Konut Tipi": form.Konut_Tipi,
      "Isıtma Sistemi": form.Isıtma_Sistemi,
      m2: Number(form.m2),
      oda: Number(form.oda),
      kat: Number(form.kat),
      bina: form.bina,
    };
    try {
      const r = await fetch(apiUrl("/api/predict"), {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || "Tahmin başarısız");
      }
      const data = await r.json();
      setResult(data);
    } catch (e) {
      setPredictErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }, [form, islem, meta]);

  if (loadErr && !meta) {
    return (
      <div style={{ minHeight: "100vh", background: "#0b111e", color: "#fda4af", padding: 40, fontFamily: "system-ui" }}>
        <h1>Bağlantı hatası</h1>
        <p>{loadErr}</p>
        <p style={{ color: "#94a3b8" }}>Önce backend sunucusunu başlatın: <code>python -m uvicorn backend.main:app --reload</code></p>
      </div>
    );
  }

  if (!meta || !form) {
    return (
      <div style={{ minHeight: "100vh", background: "#0b111e", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 18 }}>⏳ Veriler yükleniyor...</div>
      </div>
    );
  }

  const mSat = meta.metrics?.Satılık;
  const mKir = meta.metrics?.Kiralık;

  return (
    <div style={{ minHeight: "100vh", background: "#0b111e", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", color: "white" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        select:focus, input:focus { border-color: rgba(245,158,11,0.6) !important; box-shadow: 0 0 0 3px rgba(245,158,11,0.1); }
        .btn-gold { transition: all 0.2s; }
        .btn-gold:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 35px rgba(245,158,11,0.4) !important; }
        .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 20px; }
        .fade-in { animation: fadeUp 0.4s ease; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      <div style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: "linear-gradient(135deg,#f59e0b,#b45309)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, boxShadow: "0 4px 15px rgba(245,158,11,0.3)" }}>🏠</div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.5px" }}>EmlakAI Tahmin Sistemi</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {["Satılık", "Kiralık"].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setIslem(t);
                setResult(null);
              }}
              style={{
                padding: "9px 22px",
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                background: islem === t ? "linear-gradient(135deg,#f59e0b,#d97706)" : "rgba(255,255,255,0.05)",
                border: islem === t ? "none" : "1px solid rgba(255,255,255,0.1)",
                color: islem === t ? "#000" : "#64748b",
                boxShadow: islem === t ? "0 4px 15px rgba(245,158,11,0.3)" : "none",
              }}
            >
              {t === "Satılık" ? "🏷 Satılık" : "🔑 Kiralık"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 24px", display: "grid", gridTemplateColumns: "1fr 360px", gap: 20, alignItems: "start" }}>
        <div className="card" style={{ padding: 26 }}>
          <Sec icon="📍" label="KONUM" />
          <Row2>
            <F label="Şehir">
              <select style={SEL} value={form.Şehir} onChange={(e) => upd("Şehir", e.target.value)}>
                {Object.keys(meta.hier.is).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </F>
            <F label="İlçe">
              <select style={SEL} value={form.İlçe} onChange={(e) => upd("İlçe", e.target.value)}>
                {ilceler.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </F>
          </Row2>

          <Sec icon="🏗️" label="KONUT ÖZELLİKLERİ" />
          <Row2>
            <F label="Konut Tipi">
              <select style={SEL} value={form.Konut_Tipi} onChange={(e) => upd("Konut_Tipi", e.target.value)}>
                {(meta.enc["Konut Tipi"] || []).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </F>
            <F label="Metrekare (m²)">
              <input type="number" style={SEL} value={form.m2} onChange={(e) => upd("m2", e.target.value)} min={20} max={2000} />
            </F>
          </Row2>
          <Row3>
            <F label="Oda Sayısı">
              <select style={SEL} value={form.oda} onChange={(e) => upd("oda", e.target.value)}>
                {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} Oda
                  </option>
                ))}
              </select>
            </F>
            <F label="Kat">
              <select style={SEL} value={form.kat} onChange={(e) => upd("kat", e.target.value)}>
                {[-4, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? "Zemin" : n < 0 ? "Bodrum " + Math.abs(n) : n + ". Kat"}
                  </option>
                ))}
              </select>
            </F>
            <F label="Bina Yaşı">
              <select style={SEL} value={form.bina} onChange={(e) => upd("bina", e.target.value)}>
                {(meta.bina_ui_labels || []).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </F>
          </Row3>
          <Sec icon="" label="" />
          <Row2>
            <F label="Isıtma Sistemi">
              <select style={SEL} value={form.Isıtma_Sistemi} onChange={(e) => upd("Isıtma_Sistemi", e.target.value)}>
                {(meta.enc["Isıtma Sistemi"] || []).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </F>
          </Row2>

          {predictErr ? (
            <div style={{ color: "#fda4af", fontSize: 13, marginTop: 12 }}>{predictErr}</div>
          ) : null}

          <button
            type="button"
            className="btn-gold"
            onClick={run}
            disabled={busy}
            style={{
              width: "100%",
              marginTop: 22,
              padding: 15,
              borderRadius: 14,
              background: busy ? "#1e293b" : "linear-gradient(135deg,#f59e0b 0%,#d97706 100%)",
              border: "none",
              color: busy ? "#475569" : "#000",
              fontSize: 15,
              fontWeight: 800,
              cursor: busy ? "not-allowed" : "pointer",
              boxShadow: "0 8px 25px rgba(245,158,11,0.25)",
            }}
          >
            {busy ? "⏳  Hesaplanıyor..." : "  Fiyat Tahminini Hesapla"}
          </button>
        </div>

        <div>
          {!result ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 52, marginBottom: 14 }}>🏡</div>
              <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.7, marginBottom: 20 }}>
                Formu doldurup <br />
                <strong style={{ color: "#f59e0b" }}>&quot;Fiyat Tahminini Hesapla&quot;</strong>
                <br />
                butonuna basın
              </div>

            </div>
          ) : (
            <div className="fade-in">
              <div
                style={{
                  background: "linear-gradient(145deg,#1a2744,#0f172a)",
                  border: "1px solid rgba(245,158,11,0.35)",
                  borderRadius: 20,
                  padding: 22,
                  marginBottom: 14,
                  boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
                }}
              >
                <div style={{ fontSize: 10, color: "#f59e0b", letterSpacing: "0.15em", fontWeight: 700, marginBottom: 6 }}>
                  TAHMİNİ {islem.toUpperCase()} {islem === "Kiralık" ? "KİRASI" : "FİYATI"}
                </div>
                <div style={{ fontSize: 30, fontWeight: 800, marginBottom: 14, letterSpacing: "-1px" }}>{fmtTL(result.price)}</div>
                <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: "#64748b" }}></span>
                    <span style={{ fontSize: 11, color: "#64748b" }}></span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                    <span style={{ fontSize: 13, color: "#34d399", fontWeight: 700 }}>{fmtShort(result.low)}</span>
                    <span style={{ fontSize: 13, color: "#f87171", fontWeight: 700 }}>{fmtShort(result.high)}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setResult(null)}
                style={{
                  width: "100%",
                  padding: 11,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  color: "#64748b",
                  fontSize: 13,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                ← Yeni Tahmin
              </button>
            </div>
          )}
        </div>
      </div>

      {result && (
        <div className="fade-in" style={{ maxWidth: 1000, margin: "0 auto", padding: "0 24px 40px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 11, color: "#f59e0b", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 14 }}>📊 ÖZELLİK ÖNEMİ</div>
            {Object.entries(result.fi || {}).map(([k, v], i) => {
              const colors = ["#f59e0b", "#3b82f6", "#8b5cf6", "#10b981", "#f43f5e", "#06b6d4"];
              return (
                <div key={k} style={{ marginBottom: 9 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: "#cbd5e1" }}>{k}</span>
                    <span style={{ fontSize: 11, color: colors[i % 6], fontWeight: 700 }}>%{v}</span>
                  </div>
                  <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 4 }}>
                    <div
                      style={{
                        height: "100%",
                        borderRadius: 4,
                        width: v + "%",
                        background: colors[i % 6],
                        opacity: 0.85,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 11, color: "#f59e0b", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 12 }}>📈 PİYASA KARŞILAŞTIRMASI (EĞİTİM SETİ)</div>
            {[
              ["En Düşük", result.stats?.min],
              ["Medyan", result.stats?.median],
              ["Ortalama", result.stats?.mean],
              ["En Yüksek", result.stats?.max],
            ].map(([lbl, val]) => {
              if (val == null) return null;
              const pct = ((result.price - val) / val) * 100;
              return (
                <div key={lbl} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 12, color: "#64748b", width: 72 }}>{lbl}</span>
                  <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>{fmtShort(val)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: pct > 0 ? "#f87171" : "#34d399" }}>
                    {pct > 0 ? "▲" : "▼"} %{Math.abs(pct).toFixed(0)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
