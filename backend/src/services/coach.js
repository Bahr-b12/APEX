import { supabase } from "../supabase.js";

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pct(part, total) {
  if (!total) return 0;
  return (part / total) * 100;
}

function riskBucket(volatilityPct) {
  if (volatilityPct < 12) return "conservative";
  if (volatilityPct < 25) return "balanced";
  return "growth";
}

function investSplit(risk) {
  if (risk === "conservative") {
    return { emergencyFund: 40, indexFunds: 35, bonds: 20, speculative: 5 };
  }
  if (risk === "balanced") {
    return { emergencyFund: 30, indexFunds: 45, bonds: 15, speculative: 10 };
  }
  return { emergencyFund: 20, indexFunds: 50, bonds: 10, speculative: 20 };
}

export async function buildLifestyleProfile() {
  const { data, error } = await supabase.from("v_transactions").select("full_date,category_name,amount");
  if (error) throw error;
  const rows = data || [];

  const totalSpend = rows.reduce((s, r) => s + safeNum(r.amount), 0);

  const byCategory = {};
  const byMonth = {};
  let weekendSpend = 0;

  for (const r of rows) {
    const amount = safeNum(r.amount);
    const cat = r.category_name || "Other";
    byCategory[cat] = (byCategory[cat] || 0) + amount;

    const d = new Date(r.full_date);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth[ym] = (byMonth[ym] || 0) + amount;

    const day = d.getDay();
    if (day === 0 || day === 6) weekendSpend += amount;
  }

  const monthlyTotals = Object.values(byMonth);
  const monthlyAvg = monthlyTotals.length ? monthlyTotals.reduce((a, b) => a + b, 0) / monthlyTotals.length : 0;
  const variance = monthlyTotals.length
    ? monthlyTotals.reduce((s, x) => s + (x - monthlyAvg) ** 2, 0) / monthlyTotals.length
    : 0;
  const stddev = Math.sqrt(variance);
  const volatilityPct = monthlyAvg ? (stddev / monthlyAvg) * 100 : 0;

  const topCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ name, value: Number(value.toFixed(2)), sharePct: Number(pct(value, totalSpend).toFixed(1)) }));

  return {
    transactions: rows.length,
    totalSpend: Number(totalSpend.toFixed(2)),
    monthlyAverage: Number(monthlyAvg.toFixed(2)),
    monthlyStdDev: Number(stddev.toFixed(2)),
    volatilityPct: Number(volatilityPct.toFixed(2)),
    weekendSpendPct: Number(pct(weekendSpend, totalSpend).toFixed(1)),
    riskStyle: riskBucket(volatilityPct),
    topCategories
  };
}

export function buildBudgetPlan(profile, monthlyBudget) {
  const budget = safeNum(monthlyBudget);
  const essentialsTarget = budget * 0.5;
  const wantsTarget = budget * 0.3;
  const savingsTarget = budget * 0.2;

  const topCatSpend = profile.topCategories.reduce((s, c) => s + c.value, 0);
  const overspendingRisk = profile.monthlyAverage > budget ? "high" : profile.monthlyAverage > budget * 0.9 ? "medium" : "low";

  const split = investSplit(profile.riskStyle);

  return {
    monthlyBudget: Number(budget.toFixed(2)),
    budgetFramework: {
      essentials: Number(essentialsTarget.toFixed(2)),
      wants: Number(wantsTarget.toFixed(2)),
      savingsInvesting: Number(savingsTarget.toFixed(2))
    },
    spendingVsBudget: {
      monthlyAverageSpend: profile.monthlyAverage,
      gap: Number((budget - profile.monthlyAverage).toFixed(2)),
      overspendingRisk
    },
    coachingTips: [
      profile.weekendSpendPct > 35 ? "Weekend spending is high. Set a weekend cap and pre-plan purchases." : "Weekend spending is under control. Keep a fixed weekend allowance.",
      topCatSpend > budget * 0.7 ? "Top categories dominate your cash flow. Add per-category caps to reduce drift." : "Category mix is reasonably balanced.",
      profile.volatilityPct > 25 ? "Your monthly spend is volatile. Build a larger emergency buffer before aggressive investing." : "Spending is stable enough for consistent automated investing."
    ],
    suggestedInvestmentSplitPct: split
  };
}

