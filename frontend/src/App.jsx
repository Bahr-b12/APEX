import { useEffect, useMemo, useRef, useState } from "react";
import { Area, Column, Line, Pie, Radar, Scatter } from "@ant-design/plots";
import { Calendar, ChevronLeft, ChevronRight, Clock3, Menu, Play, Search, Star, User, X, Mail } from "lucide-react";
import { motion, AnimatePresence, useScroll, useTransform } from "motion/react";

// ── Shared animation variants ──────────────────────────────────────────────
const fadeUp = { hidden: { opacity: 0, y: 32, filter: "blur(8px)" }, show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.75, ease: [0.25, 0.46, 0.45, 0.94] } } };
const stagger = (delay = 0) => ({ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: delay } } });
const slideDown = { hidden: { opacity: 0, y: -24, filter: "blur(6px)" }, show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.6, ease: "easeOut" } } };
const scaleIn = { hidden: { opacity: 0, scale: 0.88 }, show: { opacity: 1, scale: 1, transition: { duration: 0.55, ease: [0.34, 1.56, 0.64, 1] } } };
const VIDEO_URL = "/233320_tiny.mp4";

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(-1);
  const [monthly, setMonthly] = useState([]);
  const [category, setCategory] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chat, setChat] = useState([]);
  const [sending, setSending] = useState(false);
  const [apiError, setApiError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");

  // Smart Budgeting State
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetGoal, setBudgetGoal] = useState("");
  const [budgetPlan, setBudgetPlan] = useState(null);
  const [generatingBudget, setGeneratingBudget] = useState(false);
  const [budgetError, setBudgetError] = useState("");

  const plotTheme = { type: "classicDark" };
  const chatScrollRef = useRef(null);
  const quickPrompts = ["Total spend last 3 days", "Food spend last month", "Which category costs the most?", "Show me my spending by year"];

  const budgetColors = {
    cyan: "#22d3ee", orange: "#fb923c", purple: "#c084fc",
    emerald: "#34d399", rose: "#fb7185", blue: "#60a5fa", yellow: "#facc15"
  };

  useEffect(() => {
    fetch("http://localhost:4000/analytics/monthly").then((r) => r.json()).then((d) => setMonthly(Array.isArray(d) ? d : [])).catch(() => { setMonthly([]); setApiError("Could not load monthly analytics."); });
    fetch("http://localhost:4000/analytics/category").then((r) => r.json()).then((d) => setCategory(Array.isArray(d) ? d : [])).catch(() => { setCategory([]); setApiError("Could not load category analytics."); });
  }, []);

  // Framer Motion handles scroll animations — IntersectionObserver not needed

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chat, sending]);

  const monthlyData = useMemo(() => (Array.isArray(monthly) ? monthly : []).map((m) => ({ month: `${m.YEAR}-${String(m.MONTH).padStart(2, "0")}`, amount: Number(m.TOTAL_AMOUNT || 0) })), [monthly]);
  const categoryData = useMemo(() => {
    const agg = {};
    (Array.isArray(category) ? category : []).forEach((r) => {
      if (!r.CATEGORY_NAME || !r.TOTAL_AMOUNT) return;
      agg[r.CATEGORY_NAME] = (agg[r.CATEGORY_NAME] || 0) + Number(r.TOTAL_AMOUNT);
    });
    return Object.entries(agg).map(([type, value]) => ({ type, value }));
  }, [category]);
  const monthlyCategoryData = useMemo(() => (Array.isArray(category) ? category : [])
    .filter((r) => r.CATEGORY_NAME && r.YEAR && r.MONTH && r.TOTAL_AMOUNT)
    .filter((r) => selectedCategory === "ALL" || r.CATEGORY_NAME === selectedCategory)
    .map((r) => ({ month: `${r.YEAR}-${String(r.MONTH).padStart(2, "0")}`, category: r.CATEGORY_NAME, value: Number(r.TOTAL_AMOUNT || 0) })), [category, selectedCategory]);
  const overlayMonthlyCategory = useMemo(() => {
    const b = {};
    monthlyCategoryData.forEach((r) => { b[r.month] = (b[r.month] || 0) + Number(r.value || 0); });
    return Object.entries(b).map(([month, value]) => ({ month, value: Number(value.toFixed(2)) })).sort((a, z) => a.month.localeCompare(z.month));
  }, [monthlyCategoryData]);
  const trendOverlaySeries = useMemo(() => [
    ...monthlyData.map((m) => ({ month: m.month, value: m.amount, series: "Total Spend" })),
    ...overlayMonthlyCategory.map((m) => ({ month: m.month, value: m.value, series: selectedCategory === "ALL" ? "Category Spend" : `${selectedCategory} Spend` }))
  ], [monthlyData, overlayMonthlyCategory, selectedCategory]);
  const scatterData = useMemo(() => monthlyCategoryData.map((d, i) => ({ x: i + 1, y: d.value, category: d.category })), [monthlyCategoryData]);
  const radarData = useMemo(() => {
    const t = {};
    monthlyCategoryData.forEach((r) => { t[r.category] = (t[r.category] || 0) + r.value; });
    return Object.entries(t).map(([item, score]) => ({ item, score }));
  }, [monthlyCategoryData]);
  const kpis = useMemo(() => {
    const total = monthlyData.reduce((s, x) => s + x.amount, 0);
    const avg = monthlyData.length ? total / monthlyData.length : 0;
    const peak = monthlyData.length ? Math.max(...monthlyData.map((x) => x.amount)) : 0;
    return { total, avg, peak };
  }, [monthlyData]);

  const formatAnswer = (text) => {
    const lines = String(text || "").trim().split("\n").map((l) => l.trim()).filter(Boolean);
    return { title: lines[0] || "Response", points: lines.slice(1).map((l) => l.replace(/^\d+[\).\s-]*/, "")) };
  };

  async function askAi() {
    if (!chatInput.trim()) return;
    setSending(true);
    const q = chatInput;
    const askedAt = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setChatInput("");
    try {
      const res = await fetch("http://localhost:4000/ai-query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI request failed");
      setChat((p) => [...p, { q, a: data.answer || data.narrative || "No response", narrative: data.narrative || "", sql: data.sql || "", rows: data.rowCount ?? 0, askedAt }]);
    } catch (e) {
      setChat((p) => [...p, { q, a: `Error: ${e.message}`, narrative: "", sql: "", rows: 0, askedAt }]);
    } finally {
      setSending(false);
    }
  }

  async function runSqlFromMessage(index) {
    const msg = chat[index];
    if (!msg?.sql) return;
    setChat((p) => p.map((m, i) => (i === index ? { ...m, sqlRunning: true, sqlError: "", sqlResult: null } : m)));
    try {
      const res = await fetch("http://localhost:4000/ai-sql-exec", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sql: msg.sql }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "SQL execution failed");
      setChat((p) => p.map((m, i) => (i === index ? { ...m, sqlRunning: false, sqlResult: { rowCount: data.rowCount || 0, rows: Array.isArray(data.rows) ? data.rows.slice(0, 10) : [] }, sqlError: "" } : m)));
    } catch (e) {
      setChat((p) => p.map((m, i) => (i === index ? { ...m, sqlRunning: false, sqlError: e.message || "Execution failed" } : m)));
    }
  }

  async function generateBudgetPlan() {
    if (!budgetAmount || isNaN(budgetAmount)) {
      setBudgetError("Please enter a valid budget amount.");
      return;
    }
    setBudgetError("");
    setGeneratingBudget(true);
    try {
      const res = await fetch("http://localhost:4000/ai-budget-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budget: budgetAmount, goal: budgetGoal })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate plan");
      setBudgetPlan(data.plan);
    } catch (e) {
      setBudgetError(e.message);
    } finally {
      setGeneratingBudget(false);
    }
  }

  const { scrollY } = useScroll();
  const videoBlur = useTransform(scrollY, [0, 400], ["blur(0px)", "blur(20px)"]);
  const maskOpacity = useTransform(scrollY, [0, 400], [0, 0.6]);

  return (
    <div className="relative bg-black text-white min-h-screen">
      {/* Background video */}
      <motion.video
        className="fixed inset-0 w-full h-full object-cover z-0"
        src={VIDEO_URL} autoPlay muted loop playsInline
        initial={{ opacity: 0, scale: 1.08 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 2, ease: "easeOut" }}
        style={{ filter: videoBlur }}
      />
      <motion.div 
        className="fixed inset-0 z-[1] pointer-events-none bg-black" 
        style={{ opacity: maskOpacity }} 
      />
      <div className="fixed inset-0 z-[1] pointer-events-none bottom-blur-mask" />

      <div className="relative z-10 min-h-screen font-secondary">

        {/* ── NAV ── */}
        <motion.header className="relative z-50" variants={slideDown} initial="hidden" animate="show">
          <nav className="flex justify-between items-center px-4 sm:px-6 md:px-12 py-4 md:py-6">
            <motion.a href="#" className="text-xl md:text-2xl font-semibold tracking-tight"
              whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.97 }}>
              APEX
            </motion.a>
            <motion.div className="hidden lg:flex items-center gap-8 text-sm" variants={stagger(0.05)} initial="hidden" animate="show">
              {["Dashboard", "AI Analyst", "Insights", "Budgeting", "Reports"].map((x, i) => (
                <motion.a key={x} variants={fadeUp}
                  href={i === 0 ? "#dashboard" : i === 1 ? "#ai-chat" : i === 2 ? "#insights" : i === 3 ? "#budgeting" : "#reports"}
                  className="text-white/90 hover:text-white transition-colors"
                  whileHover={{ y: -2 }}>
                  {x}
                </motion.a>
              ))}
            </motion.div>
            <motion.div className="hidden sm:flex items-center gap-3" variants={stagger(0.1)} initial="hidden" animate="show">
              <motion.button variants={fadeUp} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                className="liquid-glass rounded-full px-4 md:px-6 py-2 flex items-center gap-2">
                <span>Search</span><Search size={18} />
              </motion.button>
              <motion.button variants={fadeUp} whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }}
                className="liquid-glass rounded-full w-10 h-10 flex items-center justify-center">
                <User size={18} />
              </motion.button>
            </motion.div>
            <motion.button onClick={() => setMenuOpen((v) => !v)}
              className="lg:hidden liquid-glass rounded-full w-10 h-10 flex items-center justify-center"
              variants={fadeUp} initial="hidden" animate="show"
              whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
              <AnimatePresence mode="wait" initial={false}>
                {menuOpen
                  ? <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}><X size={18} /></motion.span>
                  : <motion.span key="m" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.2 }}><Menu size={18} /></motion.span>}
              </AnimatePresence>
            </motion.button>
          </nav>
          {/* Mobile menu */}
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                className="lg:hidden absolute left-0 right-0 top-[72px] z-40 bg-gray-900/95 backdrop-blur-lg border-y border-gray-800 shadow-2xl"
                initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.28, ease: "easeOut" }}>
                <div className="px-4 py-4 flex flex-col gap-1">
                  {["Dashboard", "AI Analyst", "Insights", "Budgeting", "Reports"].map((x, i) => (
                    <motion.a key={x} href={i === 0 ? "#dashboard" : i === 1 ? "#ai-chat" : i === 2 ? "#insights" : i === 3 ? "#budgeting" : "#reports"}
                      className="py-3 px-3 rounded-lg hover:bg-gray-800/50 transition-all"
                      initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06, duration: 0.28 }}>
                      {x}
                    </motion.a>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.header>

        {/* ── HERO ── */}
        <section className="min-h-screen flex flex-col justify-end px-4 sm:px-6 md:px-12 pb-8 md:pb-16">
          <div className="flex flex-col md:flex-row items-end gap-8">
            <motion.div className="flex-1" variants={stagger(0.35)} initial="hidden" animate="show">
              {/* Badges */}
              <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-3 sm:gap-6 mb-6 md:mb-8 text-xs sm:text-sm">
                {[
                  [<Star key="s" size={16} fill="white" />, "AI-Powered Insights"],
                  [<Clock3 key="c" size={16} />, "Real-Time Data"],
                  [<Calendar key="cal" size={16} />, "Since 2022"],
                ].map(([icon, label], i) => (
                  <motion.span key={label} className="flex items-center gap-2"
                    whileHover={{ scale: 1.05, color: "#fff" }}>
                    {icon} {label}
                  </motion.span>
                ))}
              </motion.div>
              {/* Headline */}
              <motion.h1 variants={fadeUp}
                className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-normal tracking-[-0.04em] mb-4 md:mb-6">
                Spend Smarter. Grow Faster.
              </motion.h1>
              {/* Subtitle */}
              <motion.p variants={fadeUp}
                className="text-base sm:text-lg md:text-xl text-gray-400 mb-6 md:mb-12 max-w-2xl">
                APEX is your AI-powered finance manager — tracking every transaction, surfacing patterns, and giving you clear answers in plain language.
              </motion.p>
              {/* CTAs */}
              <motion.div variants={fadeUp} className="flex flex-wrap gap-3 sm:gap-4">
                <motion.a href="#dashboard"
                  className="bg-white text-black rounded-full font-medium px-6 sm:px-8 py-2.5 sm:py-3 inline-flex items-center gap-2"
                  whileHover={{ scale: 1.04, backgroundColor: "#e5e5e5" }} whileTap={{ scale: 0.97 }}>
                  <Play size={18} fill="black" /> View Dashboard
                </motion.a>
                <motion.a href="#ai-chat"
                  className="rounded-full font-medium liquid-glass px-6 sm:px-8 py-2.5 sm:py-3"
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                  Ask APEX AI
                </motion.a>
              </motion.div>
            </motion.div>
            {/* Prev / Next */}
            <motion.div className="flex gap-3 md:w-auto"
              initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1, duration: 0.6, ease: "easeOut" }}>
              <motion.button whileHover={{ scale: 1.05, x: -3 }} whileTap={{ scale: 0.95 }}
                className="rounded-full liquid-glass px-4 sm:px-6 py-2.5 sm:py-3 inline-flex items-center gap-2">
                <ChevronLeft size={18} /> Previous
              </motion.button>
              <motion.button whileHover={{ scale: 1.05, x: 3 }} whileTap={{ scale: 0.95 }}
                className="rounded-full liquid-glass px-4 sm:px-6 py-2.5 sm:py-3 inline-flex items-center gap-2">
                Next <ChevronRight size={18} />
              </motion.button>
            </motion.div>
          </div>
        </section>

        {/* ── DASHBOARD ── */}
        <motion.section id="dashboard" className="px-4 sm:px-6 md:px-12 pb-16"
          initial={{ opacity: 0, y: 48 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.08 }} transition={{ duration: 0.7, ease: "easeOut" }}>
          <div className="liquid-glass rounded-2xl p-6 md:p-8">
            <motion.h2 className="text-3xl md:text-4xl mb-6"
              initial={{ opacity: 0, x: -24 }} whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.55 }}>
              Advanced Analytics
            </motion.h2>
            {/* KPI cards */}
            <motion.div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6"
              variants={stagger(0.05)} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}>
              {[
                { label: "Total Spend", val: `$${kpis.total.toFixed(2)}` },
                { label: "Avg Monthly", val: `$${kpis.avg.toFixed(2)}` },
                { label: "Peak Month", val: `$${kpis.peak.toFixed(2)}` },
              ].map(({ label, val }) => (
                <motion.div key={label} variants={scaleIn}
                  className="bg-black/30 rounded-xl p-5"
                  whileHover={{ scale: 1.03, backgroundColor: "rgba(255,255,255,0.06)" }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}>
                  <p className="text-gray-400 text-sm">{label}</p>
                  <p className="text-3xl mt-2">{val}</p>
                </motion.div>
              ))}
              <motion.div variants={scaleIn} className="bg-black/30 rounded-xl p-5">
                <p className="text-gray-400 text-sm">Category Filter</p>
                <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full mt-2 bg-[#1c1c1c] border border-white/10 rounded-sm px-3 py-2 text-white">
                  <option>ALL</option>
                  {categoryData.map((c) => <option key={c.type}>{c.type}</option>)}
                </select>
              </motion.div>
            </motion.div>
            {/* Chart panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Panel title="Monthly Spend Trend">{monthlyData.length ? <Line data={monthlyData} xField="month" yField="amount" smooth color="#ff4533" theme={plotTheme} /> : <p className="text-gray-400">No data.</p>}</Panel>
              <Panel title="Category Split">{categoryData.length ? <Pie data={categoryData} angleField="value" colorField="type" radius={0.95} innerRadius={0.6} theme={plotTheme} /> : <p className="text-gray-400">No data.</p>}</Panel>
              <Panel title="Category Totals" wide>{categoryData.length ? <Column data={categoryData} xField="type" yField="value" color="#139ce5" theme={plotTheme} /> : <p className="text-gray-400">No data.</p>}</Panel>
              <Panel title="Spend Momentum (Area)">{monthlyData.length ? <Area data={monthlyData} xField="month" yField="amount" color="#7c3aed" theme={plotTheme} /> : <p className="text-gray-400">No data.</p>}</Panel>
              <Panel title="Category Volatility (Scatter)">{scatterData.length ? <Scatter data={scatterData} xField="x" yField="y" colorField="category" shapeField="category" theme={plotTheme} /> : <p className="text-gray-400">No data.</p>}</Panel>
              <Panel title="Trend + Category Overlay" wide>{trendOverlaySeries.length ? <Line data={trendOverlaySeries} xField="month" yField="value" seriesField="series" smooth color={["#ff4533", "#22d3ee"]} theme={plotTheme} height={320} /> : <p className="text-gray-400">No data.</p>}</Panel>
              <Panel title="Category Strength Radar" wide>
                {radarData.length ? (
                  <Radar 
                    data={radarData} 
                    xField="item" 
                    yField="score" 
                    area={{ style: { fillOpacity: 0.25, fill: "#22d3ee" } }} 
                    line={{ style: { stroke: "#22d3ee", lineWidth: 2 } }}
                    point={{ shapeField: "circle", size: 4, style: { fill: "#22d3ee", stroke: "#000", lineWidth: 1.5 } }}
                    theme={plotTheme} 
                  />
                ) : (
                  <p className="text-gray-400">No data.</p>
                )}
              </Panel>
            </div>
            {apiError ? <p className="text-red-400 mt-4">{apiError}</p> : null}
          </div>
        </motion.section>

        {/* ── AI CHAT ── */}
        <motion.section id="ai-chat" className="px-4 sm:px-6 md:px-12 pb-20"
          initial={{ opacity: 0, y: 56 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }} transition={{ duration: 0.7, ease: "easeOut" }}>
          <div className="liquid-glass rounded-2xl overflow-hidden">
            <div className="p-6 md:p-8 border-b border-white/10">
              <motion.h3 className="text-2xl md:text-3xl"
                initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }} transition={{ duration: 0.5 }}>
                APEX AI Analyst
              </motion.h3>
              <motion.p className="text-gray-400 mt-2"
                initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
                viewport={{ once: true }} transition={{ delay: 0.15, duration: 0.5 }}>
                Ask natural-language questions and get warehouse-backed insights.
              </motion.p>
              <motion.div className="mt-4 flex flex-wrap gap-2"
                variants={stagger(0.1)} initial="hidden" whileInView="show" viewport={{ once: true }}>
                {quickPrompts.map((p) => (
                  <motion.button key={p} variants={fadeUp} onClick={() => setChatInput(p)}
                    className="text-xs px-3 py-1.5 rounded-full border border-white/10 bg-black/30"
                    whileHover={{ scale: 1.05, backgroundColor: "rgba(255,255,255,0.08)" }}
                    whileTap={{ scale: 0.96 }}>
                    {p}
                  </motion.button>
                ))}
              </motion.div>
            </div>
            <div ref={chatScrollRef} className="p-6 md:p-8 space-y-4 max-h-[500px] overflow-auto">
              {!chat.length && !sending
                ? <motion.div className="text-sm text-gray-400 border border-dashed border-white/15 rounded-md p-4 bg-black/30"
                  initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
                  💡 Ask APEX AI anything — e.g. "Where did I spend the most last month?" or "Show my top 3 expense categories."
                </motion.div>
                : null}
              <AnimatePresence initial={false}>
                {chat.map((m, i) => (
                  <motion.div key={i} className="space-y-3"
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}>
                    {/* User bubble */}
                    <motion.div className="ml-auto max-w-[90%] sm:max-w-[80%] bg-white text-black rounded-2xl rounded-br-sm px-4 py-3"
                      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35 }}>
                      <p className="text-xs opacity-70 mb-1">You • {m.askedAt || ""}</p>
                      <p>{m.q}</p>
                    </motion.div>
                    {/* AI bubble */}
                    <motion.div className="max-w-[95%] sm:max-w-[88%] bg-black/40 border border-white/10 rounded-2xl rounded-bl-sm p-4"
                      initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, delay: 0.08 }}>
                      <p className="text-sm text-gray-400 mb-2">APEX AI</p>
                      <p className="font-medium">{formatAnswer(m.a).title}</p>
                      {m.narrative && m.narrative !== m.a ? <p className="text-sm text-gray-400 mt-1">{m.narrative}</p> : null}
                      {formatAnswer(m.a).points.length ? <ul className="text-sm text-gray-400 mt-2 space-y-1 list-disc pl-5">{formatAnswer(m.a).points.map((p, idx) => <li key={idx}>{p}</li>)}</ul> : null}
                      <div className="mt-3 flex items-center gap-2 text-xs">
                        <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5 text-gray-300">Rows: {m.rows ?? 0}</span>
                        <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5 text-gray-300">Warehouse-backed</span>
                      </div>
                      {m.sql ? (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-xs text-white/90 hover:underline">View generated SQL</summary>
                          <pre className="mt-2 p-3 rounded-md bg-black/60 border border-white/10 text-xs overflow-auto whitespace-pre-wrap">{m.sql}</pre>
                          <div className="mt-2 flex items-center gap-2">
                            <motion.button onClick={() => runSqlFromMessage(i)} disabled={m.sqlRunning}
                              className="text-xs px-3 py-1.5 rounded border border-white/15 bg-black/30 disabled:opacity-50"
                              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                              {m.sqlRunning ? "Running..." : "Run SQL"}
                            </motion.button>
                            <span className="text-xs text-gray-400">Executes in Supabase</span>
                          </div>
                          {m.sqlError ? <p className="mt-2 text-xs text-red-400">{m.sqlError}</p> : null}
                          {m.sqlResult ? (
                            <div className="mt-3 border border-white/10 rounded-md overflow-hidden bg-black/40">
                              <div className="px-3 py-2 text-xs bg-black/40 border-b border-white/10 flex justify-between"><span>Execution Result</span><span>{m.sqlResult.rowCount} rows</span></div>
                              {!m.sqlResult.rows?.length ? <p className="p-3 text-xs text-gray-400">No rows returned.</p> : (
                                <div className="overflow-auto max-h-56">
                                  <table className="min-w-full text-xs">
                                    <thead className="bg-black/30"><tr>{Object.keys(m.sqlResult.rows[0]).map((k) => <th key={k} className="text-left px-3 py-2 border-b border-white/10">{k}</th>)}</tr></thead>
                                    <tbody>{m.sqlResult.rows.map((r, idx) => <tr key={idx} className="border-b border-white/10">{Object.keys(m.sqlResult.rows[0]).map((k) => <td key={k} className="px-3 py-2 text-gray-300">{String(r[k] ?? "")}</td>)}</tr>)}</tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </details>
                      ) : null}
                    </motion.div>
                  </motion.div>
                ))}
              </AnimatePresence>
              <AnimatePresence>
                {sending && (
                  <motion.div className="max-w-[75%] bg-black/40 border border-white/10 rounded-2xl rounded-bl-sm p-4"
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
                    transition={{ duration: 0.3 }}>
                    <p className="text-sm text-gray-400 mb-2">APEX AI</p>
                    <div className="flex items-center gap-2">
                      {[0, 120, 240].map((d) => (
                        <motion.span key={d} className="w-2 h-2 rounded-full bg-gray-300"
                          animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 0.9, repeat: Infinity, delay: d / 1000 }} />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="p-4 sm:p-5 border-t border-white/10 bg-black/30">
              <div className="flex gap-3">
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && askAi()}
                  className="flex-1 bg-black/60 border border-white/15 rounded-md px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                  placeholder="Ask APEX AI — e.g. 'What did I spend on food this year?'" />
                <motion.button onClick={askAi} disabled={sending || !chatInput.trim()}
                  className="bg-white text-black px-6 py-3 rounded-md font-medium disabled:opacity-50"
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}>
                  {sending ? "Thinking..." : "Ask"}
                </motion.button>
              </div>
            </div>
          </div>
        </motion.section>

        {/* ── INSIGHTS ── */}
        <motion.section id="insights" className="px-4 sm:px-6 md:px-12 pb-16"
          initial={{ opacity: 0, y: 48 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.08 }} transition={{ duration: 0.7, ease: "easeOut" }}>
          <div className="liquid-glass rounded-2xl p-6 md:p-8">
            <motion.h2 className="text-3xl md:text-4xl mb-6">Actionable Insights</motion.h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Panel title="Spending Patterns">
                <p className="text-gray-400">Your weekend dining expenses have increased by 15% compared to last month. Consider exploring local grocery options.</p>
              </Panel>
              <Panel title="Subscription Alert">
                <p className="text-gray-400">You have 3 inactive subscriptions costing $45/mo. We recommend reviewing them.</p>
              </Panel>
              <Panel title="Savings Opportunity">
                <p className="text-gray-400">Reallocating $100 from entertainment to high-yield savings could net you an extra $50 this year.</p>
              </Panel>
            </div>
          </div>
        </motion.section>

        {/* ── BUDGETING ── */}
        <motion.section id="budgeting" className="px-4 sm:px-6 md:px-12 pb-16"
          initial={{ opacity: 0, y: 48 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.08 }} transition={{ duration: 0.7, ease: "easeOut" }}>
          <div className="liquid-glass rounded-2xl p-6 md:p-8">
            <motion.h2 className="text-3xl md:text-4xl mb-6">Smart Budgeting</motion.h2>

            <div className="mb-8 bg-black/40 border border-white/10 rounded-xl p-6">
              <h3 className="text-xl mb-4 font-medium text-white/90">Let APEX AI Build Your Plan</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Monthly Budget ($)</label>
                  <input type="number" value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)}
                    className="w-full bg-black/60 border border-white/15 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-white/30 transition-shadow"
                    placeholder="e.g. 5000" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Financial Goal / Context</label>
                  <input type="text" value={budgetGoal} onChange={(e) => setBudgetGoal(e.target.value)}
                    className="w-full bg-black/60 border border-white/15 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-white/30 transition-shadow"
                    placeholder="e.g. Save for a house, pay off debt, travel more" />
                </div>
              </div>
              <motion.button onClick={generateBudgetPlan} disabled={generatingBudget}
                className="bg-white text-black px-6 py-2.5 rounded-full font-medium disabled:opacity-50 inline-flex items-center gap-2"
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                {generatingBudget ? (
                  <>
                    <motion.span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full block" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} />
                    Analyzing...
                  </>
                ) : "Generate Smart Plan"}
              </motion.button>
              {budgetError && <p className="text-red-400 mt-3 text-sm">{budgetError}</p>}
            </div>

            {budgetPlan && (
              <motion.div className="space-y-4" variants={stagger(0.1)} initial="hidden" animate="show">
                {budgetPlan.map((item, idx) => (
                  <motion.div key={idx} variants={slideDown} className="bg-black/30 p-5 rounded-xl border border-white/10 hover:bg-white/[0.03] transition-colors">
                    <div className="flex flex-col md:flex-row md:items-end justify-between mb-3 gap-2">
                      <div>
                        <span className="text-lg font-medium text-white flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: budgetColors[item.color] || budgetColors.cyan }} />
                          {item.title}
                        </span>
                        <p className="text-sm text-gray-400 mt-1 max-w-2xl">{item.description}</p>
                      </div>
                      <div className="text-left md:text-right">
                        <span className="text-white font-medium text-xl">${item.amount}</span>
                        <span className="text-gray-500 text-sm ml-1">/ ${item.total}</span>
                      </div>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-2 mt-2 overflow-hidden">
                      <motion.div className="h-2 rounded-full"
                        style={{ backgroundColor: budgetColors[item.color] || budgetColors.cyan }}
                        initial={{ width: 0 }} animate={{ width: `${Math.min((item.amount / item.total) * 100, 100)}%` }} transition={{ duration: 1, ease: "easeOut", delay: 0.2 }} />
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        </motion.section>

        {/* ── REPORTS ── */}
        <motion.section id="reports" className="px-4 sm:px-6 md:px-12 pb-20"
          initial={{ opacity: 0, y: 48 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.08 }} transition={{ duration: 0.7, ease: "easeOut" }}>
          <div className="liquid-glass rounded-2xl p-6 md:p-8">
            <motion.h2 className="text-3xl md:text-4xl mb-6">Financial Reports</motion.h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { name: "2025 Annual Review", date: "Jan 1, 2026" },
                { name: "Q4 2025 Tax Summary", date: "Dec 31, 2025" },
                { name: "November Expense Deep Dive", date: "Dec 1, 2025" },
                { name: "Q3 2025 Investment Growth", date: "Oct 1, 2025" },
              ].map((report) => (
                <motion.div key={report.name} whileHover={{ scale: 1.03, backgroundColor: "rgba(255,255,255,0.08)" }}
                  className="bg-black/30 p-5 rounded-xl border border-white/10 cursor-pointer transition-colors">
                  <p className="text-white font-medium mb-1">{report.name}</p>
                  <p className="text-gray-500 text-sm">{report.date}</p>
                  <button className="mt-4 text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1">Download PDF</button>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* ── HIGH-END FOOTER ── */}
        <motion.footer 
          className="relative border-t border-white/5 bg-black/60 backdrop-blur-2xl mt-24 pt-16 pb-8 overflow-hidden"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          {/* Abstract glowing orb in the footer background */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none" />

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 md:px-12">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
              
              {/* Brand & Mission */}
              <div className="md:col-span-2">
                <motion.h3 className="text-3xl font-bold tracking-tighter text-white mb-4 flex items-center gap-2"
                  whileHover={{ scale: 1.02 }}
                >
                  APEX <span className="text-cyan-400">Finance</span>
                </motion.h3>
                <p className="text-gray-400 text-sm leading-relaxed max-w-sm mb-8">
                  Redefining personal wealth management through AI-driven insights, 
                  secure analytics, and cinematic data visualization.
                </p>
                
                {/* Interactive Socials */}
                <div className="flex items-center gap-4">
                  {[
                    { name: "LinkedIn", href: "https://www.linkedin.com/in/abdallah-behairy", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" /><rect width="4" height="12" x="2" y="9" /><circle cx="4" cy="4" r="2" /></svg> },
                    { name: "Instagram", href: "https://www.instagram.com/bahr_behairy/", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" x2="17.51" y1="6.5" y2="6.5" /></svg> },
                    { name: "Email", href: "mailto:abdallahbbehairy@gmail.com", icon: <Mail size={18} /> }
                  ].map((social) => (
                    <motion.a 
                      key={social.name}
                      href={social.href} target="_blank" rel="noopener noreferrer"
                      whileHover={{ y: -4, scale: 1.1, backgroundColor: "rgba(34, 211, 238, 0.1)", color: "#22d3ee", borderColor: "rgba(34, 211, 238, 0.4)" }}
                      className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-gray-400 transition-colors bg-white/5"
                      aria-label={social.name}
                    >
                      {social.icon}
                    </motion.a>
                  ))}
                </div>
              </div>

              {/* Links Columns */}
              <div>
                <h4 className="text-white font-medium mb-6 tracking-wide">Platform</h4>
                <ul className="space-y-3">
                  {["AI Dashboard", "Smart Budgeting", "Analytics", "Security"].map((link) => (
                    <li key={link}>
                      <a href={`#${link.toLowerCase().replace(" ", "-")}`} className="text-gray-400 hover:text-cyan-400 text-sm transition-colors flex items-center gap-2 group">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-500/0 group-hover:bg-cyan-400 transition-colors" />
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="text-white font-medium mb-6 tracking-wide">Developer</h4>
                <ul className="space-y-3">
                  <li>
                    <a href="https://www.linkedin.com/in/abdallah-behairy" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-cyan-400 text-sm transition-colors flex items-center gap-2 group">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-500/0 group-hover:bg-cyan-400 transition-colors" />
                      About Abdallah
                    </a>
                  </li>
                  <li>
                    <a href="#" className="text-gray-400 hover:text-cyan-400 text-sm transition-colors flex items-center gap-2 group">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-500/0 group-hover:bg-cyan-400 transition-colors" />
                      Portfolio
                    </a>
                  </li>
                  <li>
                    <a href="mailto:abdallahbbehairy@gmail.com" className="text-gray-400 hover:text-cyan-400 text-sm transition-colors flex items-center gap-2 group">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-500/0 group-hover:bg-cyan-400 transition-colors" />
                      Contact
                    </a>
                  </li>
                </ul>
              </div>
              
            </div>

            {/* Bottom Bar */}
            <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-gray-500 text-xs">
                © {new Date().getFullYear()} APEX Finance. All rights reserved.
              </p>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>
                  Designed by <motion.a href="https://www.linkedin.com/in/abdallah-behairy" target="_blank" rel="noopener noreferrer" className="text-cyan-400 font-medium cursor-pointer" whileHover={{ textShadow: "0px 0px 8px rgba(34,211,238,0.8)" }}>Abdallah Behairy</motion.a>
                </span>
                <span className="w-1 h-1 bg-gray-600 rounded-full" />
                <span>
                  Powered by <motion.a href="https://thenexera.netlify.app/" target="_blank" rel="noopener noreferrer" className="text-white font-medium cursor-pointer hover:text-cyan-400 transition-colors" whileHover={{ textShadow: "0px 0px 8px rgba(255,255,255,0.5)" }}>Nexera Software</motion.a>
                </span>
              </div>
            </div>
          </div>
        </motion.footer>

      </div>
    </div>
  );
}

function Panel({ title, children, wide }) {
  return (
    <motion.div
      className={`bg-black/30 border border-white/10 rounded-xl p-6 ${wide ? "lg:col-span-2" : ""}`}
      initial={{ opacity: 0, y: 28, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={{ scale: 1.01, borderColor: "rgba(255,255,255,0.18)" }}>
      <h3 className="text-xl mb-3">{title}</h3>
      {children}
    </motion.div>
  );
}

