import { Router } from "express";
import { getAiSqlAndNarrative } from "../services/sqlAgent.js";
import { supabase, toUpperKeys } from "../supabase.js";
import { buildLifestyleProfile, buildBudgetPlan } from "../services/coach.js";

const router = Router();

async function fallbackReadonlyExec(sql) {
  const s = String(sql || "").toLowerCase();
  const limitMatch = s.match(/\blimit\s+(\d+)/i);
  const limit = Math.min(Number(limitMatch?.[1] || 50), 500);

  // Canonical warehouse views
  if (s.includes("from v_analytics_monthly") || (s.includes("fact_transactions") && s.includes("group by dd.year, dd.month"))) {
    const { data, error } = await supabase.from("v_analytics_monthly").select("*").order("year").order("month").limit(limit);
    if (error) throw error;
    return (data || []).map(toUpperKeys);
  }

  if (s.includes("from v_analytics_category") || (s.includes("fact_transactions") && s.includes("category_name"))) {
    const { data, error } = await supabase.from("v_analytics_category").select("*").limit(limit);
    if (error) throw error;
    return (data || []).map(toUpperKeys);
  }

  if (s.includes("from v_transactions")) {
    const { data, error } = await supabase.from("v_transactions").select("*").order("full_date", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data || []).map(toUpperKeys);
  }

  if (s.includes("from v_spending_anomalies")) {
    const { data, error } = await supabase.from("v_spending_anomalies").select("*").order("amount", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data || []).map(toUpperKeys);
  }

  throw new Error("Unsupported SQL for fallback executor. Use warehouse views (v_analytics_monthly, v_analytics_category, v_transactions, v_spending_anomalies).");
}

router.post("/ai-coach", async (req, res) => {
  try {
    const monthlyBudget = Number(req.body?.monthlyBudget);
    if (!Number.isFinite(monthlyBudget) || monthlyBudget <= 0) {
      return res.status(400).json({ error: "monthlyBudget must be a positive number" });
    }

    const profile = await buildLifestyleProfile();
    const plan = buildBudgetPlan(profile, monthlyBudget);

    res.json({
      ok: true,
      profile,
      plan
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function getWarehouseContext() {
  const [{ data: range }, { data: cats }, { count: txCount }] = await Promise.all([
    supabase.from("v_transactions").select("full_date").order("full_date", { ascending: true }).limit(1),
    supabase.from("dim_category").select("category_name"),
    supabase.from("fact_transactions").select("*", { count: "exact", head: true })
  ]);
  const { data: lastDateRows } = await supabase.from("v_transactions").select("full_date").order("full_date", { ascending: false }).limit(1);
  const minDate = range?.[0]?.full_date || null;
  const maxDate = lastDateRows?.[0]?.full_date || null;
  const categories = (cats || []).map((c) => c.category_name).filter(Boolean);
  return { minDate, maxDate, categories, txCount: txCount || 0 };
}

router.post("/ai-sql-exec", async (req, res) => {
  try {
    const sql = String(req.body?.sql || "").trim();
    if (!sql) return res.status(400).json({ error: "sql is required" });

    let rows = [];
    const { data, error } = await supabase.rpc("exec_readonly_sql", { p_sql: sql });
    if (error) {
      const msg = String(error.message || "");
      if (
        msg.includes("Could not find the function public.exec_readonly_sql") ||
        msg.includes("Query only approved warehouse views")
      ) {
        rows = await fallbackReadonlyExec(sql);
      } else {
        throw error;
      }
    } else {
      rows = Array.isArray(data) ? data.map(toUpperKeys) : [];
    }

    res.json({
      sql,
      rowCount: rows.length,
      rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/ai-query", async (req, res) => {
  try {
    const question = req.body?.question;
    if (!question) return res.status(400).json({ error: "question is required" });
    const dbCtx = await getWarehouseContext();
    const qNorm = String(question).toLowerCase();
    const parseBudgetAmount = (text) => {
      // Handles: "budget is 2500", "$2500", "6k usd", "6.5k"
      const budgetMatch = text.match(/budget(?:\s+is|\s*=|\s+of)?\s*\$?\s*(\d+(?:\.\d+)?)(k)?/i);
      if (budgetMatch) {
        const base = Number(budgetMatch[1]);
        const mult = budgetMatch[2] ? 1000 : 1;
        return base * mult;
      }
      const haveMatch = text.match(/\b(?:i have|have|with|got)\s*\$?\s*(\d+(?:\.\d+)?)(k)?\s*(?:usd|dollars?)?\b/i);
      if (haveMatch) {
        const base = Number(haveMatch[1]);
        const mult = haveMatch[2] ? 1000 : 1;
        return base * mult;
      }
      const genericMoney = text.match(/\$?\s*(\d+(?:\.\d+)?)(k)\s*(?:usd|dollars?)?/i);
      if (genericMoney) {
        return Number(genericMoney[1]) * 1000;
      }
      return null;
    };

    const monthlyBudgetParsed = parseBudgetAmount(qNorm);
    const asksCoaching =
      qNorm.includes("budget") ||
      qNorm.includes("invest") ||
      qNorm.includes("lifestyle") ||
      qNorm.includes("manage") ||
      qNorm.includes("save") ||
      qNorm.includes("next month");

    if (asksCoaching && monthlyBudgetParsed && monthlyBudgetParsed > 0) {
      const monthlyBudget = Number(monthlyBudgetParsed);
      const profile = await buildLifestyleProfile();
      const plan = buildBudgetPlan(profile, monthlyBudget);
      return res.json({
        question,
        sql: null,
        intent: "budget_coach",
        answer: `Based on your spending behavior, I built a budget and investment plan for a monthly budget of $${monthlyBudget.toFixed(2)}.`,
        narrative: [
          `Risk style: ${profile.riskStyle}`,
          `Monthly average spend: $${profile.monthlyAverage.toFixed(2)}`,
          `Suggested split: Essentials $${plan.budgetFramework.essentials.toFixed(2)}, Wants $${plan.budgetFramework.wants.toFixed(2)}, Savings/Investing $${plan.budgetFramework.savingsInvesting.toFixed(2)}.`,
          `Investment mix (%): Emergency ${plan.suggestedInvestmentSplitPct.emergencyFund}, Index ${plan.suggestedInvestmentSplitPct.indexFunds}, Bonds ${plan.suggestedInvestmentSplitPct.bonds}, Speculative ${plan.suggestedInvestmentSplitPct.speculative}.`,
          `Tip: ${plan.coachingTips[0]}`
        ].join("\n"),
        rowCount: 0,
        rows: [],
        warehouseContext: dbCtx,
        coach: { profile, plan }
      });
    }

    const { sql, narrative, intent, period, category } = await getAiSqlAndNarrative(question);
    const q = question.toLowerCase();
    let rows = [];
    if (!sql) {
      const contextHint = dbCtx.txCount
        ? `Data range: ${dbCtx.minDate} to ${dbCtx.maxDate}. Categories: ${dbCtx.categories.join(", ")}.`
        : "No transactions loaded yet. Import warehouse CSV data first.";
      return res.json({
        question,
        sql: null,
        intent,
        period,
        category,
        narrative: `${narrative}\n${contextHint}`,
        answer: `${narrative}\n${contextHint}`,
        rowCount: 0,
        rows: [],
        warehouseContext: dbCtx
      });
    }

    if (intent === "food_last_month" || (q.includes("food") && q.includes("last month"))) {
      const { data, error } = await supabase.rpc("fn_food_last_month");
      if (error) throw error;
      rows = (data || []).map(toUpperKeys);
    } else if (intent === "last_3_days_total") {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 2);
      const fromIso = fromDate.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("v_transactions")
        .select("amount,full_date")
        .gte("full_date", fromIso);
      if (error) throw error;
      const total = (data || []).reduce((s, r) => s + Number(r.amount || 0), 0);
      rows = [toUpperKeys({ total_spent: Number(total.toFixed(2)) })];
    } else if (intent === "total_period" && period) {
      const now = new Date();
      const start = new Date(now);
      const unit = String(period.unit);
      const n = Number(period.value || 1);
      if (unit.startsWith("day")) start.setDate(start.getDate() - (n - 1));
      if (unit.startsWith("month")) start.setMonth(start.getMonth() - n);
      if (unit.startsWith("year")) start.setFullYear(start.getFullYear() - n);
      const fromIso = start.toISOString().slice(0, 10);
      let qx = supabase.from("v_transactions").select("amount,full_date,category_name").gte("full_date", fromIso);
      if (category) qx = qx.ilike("category_name", category);
      const { data, error } = await qx;
      if (error) throw error;
      const total = (data || []).reduce((s, r) => s + Number(r.amount || 0), 0);
      rows = [toUpperKeys({ total_spent: Number(total.toFixed(2)) })];
    } else if (intent === "total_category_all_time" && category) {
      const { data, error } = await supabase
        .from("v_transactions")
        .select("amount,category_name")
        .ilike("category_name", category);
      if (error) throw error;
      const total = (data || []).reduce((s, r) => s + Number(r.amount || 0), 0);
      rows = [toUpperKeys({ total_spent: Number(total.toFixed(2)) })];
    } else if (intent === "yearly_totals") {
      const { data, error } = await supabase.from("v_analytics_monthly").select("year,total_amount");
      if (error) throw error;
      const byYear = {};
      (data || []).forEach((r) => {
        const y = Number(r.year);
        byYear[y] = (byYear[y] || 0) + Number(r.total_amount || 0);
      });
      rows = Object.entries(byYear)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([year, total_amount]) => toUpperKeys({ year: Number(year), total_amount: Number(total_amount.toFixed(2)) }));
    } else if (intent === "top_categories") {
      const { data, error } = await supabase.from("v_transactions").select("category_name,amount");
      if (error) throw error;
      const byCat = {};
      (data || []).forEach((r) => {
        const c = r.category_name || "Other";
        byCat[c] = (byCat[c] || 0) + Number(r.amount || 0);
      });
      rows = Object.entries(byCat)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([category_name, total_spent]) => toUpperKeys({ category_name, total_spent: Number(total_spent.toFixed(2)) }));
    } else if (intent === "average_monthly") {
      const { data, error } = await supabase.from("v_analytics_monthly").select("total_amount");
      if (error) throw error;
      const vals = (data || []).map((r) => Number(r.total_amount || 0));
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      rows = [toUpperKeys({ average_monthly_spend: Number(avg.toFixed(2)) })];
    } else if (intent === "highest_month") {
      const { data, error } = await supabase.from("v_analytics_monthly").select("year,month,total_amount");
      if (error) throw error;
      const best = (data || []).sort((a, b) => Number(b.total_amount || 0) - Number(a.total_amount || 0))[0];
      rows = best ? [toUpperKeys({ year: best.year, month: best.month, total_amount: Number(best.total_amount || 0) })] : [];
    } else if (intent === "anomalies") {
      const { data, error } = await supabase.from("v_spending_anomalies").select("*").order("amount", { ascending: false }).limit(50);
      if (error) throw error;
      rows = (data || []).map(toUpperKeys);
    } else if (intent === "total_last_year") {
      const now = new Date();
      const y = now.getFullYear() - 1;
      const { data, error } = await supabase
        .from("v_transactions")
        .select("amount,full_date")
        .gte("full_date", `${y}-01-01`)
        .lte("full_date", `${y}-12-31`);
      if (error) throw error;
      const total = (data || []).reduce((s, r) => s + Number(r.amount || 0), 0);
      rows = [toUpperKeys({ total_spent: Number(total.toFixed(2)) })];
    } else if (intent === "total_this_year") {
      const y = new Date().getFullYear();
      const { data, error } = await supabase
        .from("v_transactions")
        .select("amount,full_date")
        .gte("full_date", `${y}-01-01`)
        .lte("full_date", `${y}-12-31`);
      if (error) throw error;
      const total = (data || []).reduce((s, r) => s + Number(r.amount || 0), 0);
      rows = [toUpperKeys({ total_spent: Number(total.toFixed(2)) })];
    } else if (intent === "total_last_month") {
      const d = new Date();
      const startThis = new Date(d.getFullYear(), d.getMonth(), 1);
      const startLast = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const fromIso = startLast.toISOString().slice(0, 10);
      const toIso = new Date(startThis.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("v_transactions")
        .select("amount,full_date")
        .gte("full_date", fromIso)
        .lte("full_date", toIso);
      if (error) throw error;
      const total = (data || []).reduce((s, r) => s + Number(r.amount || 0), 0);
      rows = [toUpperKeys({ total_spent: Number(total.toFixed(2)) })];
    } else if (q.includes("monthly")) {
      const { data, error } = await supabase.from("v_analytics_monthly").select("*").order("year").order("month");
      if (error) throw error;
      rows = (data || []).map(toUpperKeys);
    } else {
      const { data, error } = await supabase.from("v_analytics_category").select("*").limit(200);
      if (error) throw error;
      rows = (data || []).map(toUpperKeys);
    }

    let answer = narrative;
    if (intent === "last_3_days_total" && rows[0]) {
      const value = Number(rows[0].TOTAL_SPENT ?? rows[0].TOTAL_SPENT_LAST_3_DAYS ?? 0);
      answer = `Your total spend in the last 3 days is $${value.toFixed(2)}.`;
    } else if (intent === "total_period" && rows[0] && period) {
      const value = Number(rows[0].TOTAL_SPENT ?? 0);
      const scope = category ? ` on ${category}` : "";
      answer = `Your total spend${scope} in the last ${period.value} ${period.unit} is $${value.toFixed(2)}.`;
    } else if (intent === "total_category_all_time" && rows[0] && category) {
      const value = Number(rows[0].TOTAL_SPENT ?? 0);
      answer = `Your total spend on ${category} is $${value.toFixed(2)}.`;
    } else if (intent === "yearly_totals" && rows.length) {
      answer = `Here is your yearly spending total from ${rows[0].YEAR} to ${rows[rows.length - 1].YEAR}.`;
    } else if (intent === "top_categories" && rows.length) {
      answer = `Your top spending categories are ready. The highest is ${rows[0].CATEGORY_NAME} at $${Number(rows[0].TOTAL_SPENT || 0).toFixed(2)}.`;
    } else if (intent === "average_monthly" && rows[0]) {
      answer = `Your average monthly spending is $${Number(rows[0].AVERAGE_MONTHLY_SPEND || 0).toFixed(2)}.`;
    } else if (intent === "highest_month" && rows[0]) {
      answer = `Your highest spending month was ${rows[0].YEAR}-${String(rows[0].MONTH).padStart(2, "0")} with $${Number(rows[0].TOTAL_AMOUNT || 0).toFixed(2)}.`;
    } else if (intent === "anomalies") {
      answer = `I found ${rows.length} unusual spending records based on statistical anomaly detection.`;
    } else if (intent === "total_last_year" && rows[0]) {
      const value = Number(rows[0].TOTAL_SPENT ?? 0);
      const y = new Date().getFullYear() - 1;
      answer = `Your total spend in ${y} is $${value.toFixed(2)}.`;
    } else if (intent === "total_this_year" && rows[0]) {
      const value = Number(rows[0].TOTAL_SPENT ?? 0);
      const y = new Date().getFullYear();
      answer = `Your total spend in ${y} is $${value.toFixed(2)}.`;
    } else if (intent === "total_last_month" && rows[0]) {
      const value = Number(rows[0].TOTAL_SPENT ?? 0);
      answer = `Your total spend last month is $${value.toFixed(2)}.`;
    } else if (intent === "food_last_month" && rows[0]) {
      const value = Number(rows[0].TOTAL_SPENT ?? 0);
      answer = `Your food spend last month is $${value.toFixed(2)}.`;
    }

    res.json({
      question,
      sql,
      intent,
      period,
      category,
      answer,
      narrative,
      rowCount: rows.length,
      rows,
      warehouseContext: dbCtx
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/ai-budget-plan", async (req, res) => {
  try {
    const { budget, goal } = req.body;
    const budgetVal = Number(budget);
    if (!budgetVal || budgetVal <= 0) {
      return res.status(400).json({ error: "Valid budget is required" });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.json({
        plan: [
          { title: "Essentials", amount: budgetVal * 0.5, total: budgetVal * 0.5, description: "Allocate 50% to needs.", color: "cyan" },
          { title: "Wants", amount: budgetVal * 0.3, total: budgetVal * 0.3, description: "Allocate 30% to wants.", color: "orange" },
          { title: "Savings", amount: budgetVal * 0.2, total: budgetVal * 0.2, description: "Allocate 20% to savings.", color: "purple" }
        ]
      });
    }

    const prompt = `
You are a professional financial advisor, APEX AI.
The user has a total budget of $${budgetVal} and their goal is: "${goal || "General financial stability"}".
Generate a professional, actionable, and smart budget plan divided into categories.
Return the result strictly as a JSON array of objects.
Each object must represent a budget category card and have:
- "title": Title of the card (e.g., "Housing & Utilities", "Aggressive Savings", "Debt Payoff")
- "amount": The recommended dollar amount (number only)
- "total": The budget limit for this category (number only, can be the same as amount)
- "description": A short, professional explanation of why this amount and how to manage it.
- "color": A tailwind color prefix for the progress bar (choose one: "cyan", "orange", "purple", "emerald", "rose", "blue", "yellow")

Do not output any markdown formatting, backticks, or extra text. Just the JSON array.
`.trim();

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error("Failed to generate AI budget plan from Groq");
    }

    const data = await response.json();
    let content = data?.choices?.[0]?.message?.content?.trim() || "[]";
    if (content.startsWith("\`\`\`")) {
        content = content.replace(/\`\`\`json/g, "").replace(/\`\`\`/g, "").trim();
    }
    const plan = JSON.parse(content);
    
    res.json({ plan });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
