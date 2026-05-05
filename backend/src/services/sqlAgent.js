import { retrieveContext } from "./rag.js";

function normalize(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}
const includesAny = (q, arr) => arr.some((w) => q.includes(w));

function extractPeriod(q) {
  const m = q.match(/last\s+(\d+)\s+(day|days|month|months|year|years)/);
  if (!m) return null;
  return { value: Number(m[1]), unit: m[2] };
}

function extractCategory(q) {
  const categories = ["food", "bills", "shopping", "travel", "health", "entertainment"];
  return categories.find((c) => q.includes(c)) || null;
}

function detectIntent(question) {
  const q = normalize(question);
  const greetings = ["hi", "hello", "hey", "yo", "sup", "good morning", "good evening", "good afternoon"];
  if (greetings.some((g) => q === g || q.startsWith(`${g} `))) {
    return "greeting";
  }
  if (q.includes("what can you do") || q.includes("what can u do") || q.includes("so what can u do") || q.includes("help")) {
    return "capabilities";
  }
  const hasSpend = includesAny(q, ["spend", "spent", "expense", "expenses", "total"]);
  const hasShow = includesAny(q, ["show", "display", "give", "list"]);
  const hasYear = includesAny(q, ["year", "yearly", "annual"]);
  const hasMonth = includesAny(q, ["month", "monthly"]);
  const hasCategoryWord = includesAny(q, ["category", "categories", "breakdown"]);

  if (includesAny(q, ["anomaly", "anomalies", "unusual", "abnormal"])) return "anomalies";
  if (includesAny(q, ["top category", "top categories", "highest category", "biggest category"])) return "top_categories";
  if (includesAny(q, ["average monthly", "avg monthly", "monthly average"])) return "average_monthly";
  if (includesAny(q, ["highest month", "peak month", "max month"])) return "highest_month";

  if (q.includes("last 3 days") || q.includes("last three days")) {
    return "last_3_days_total";
  }
  if ((q.includes("total") || q.includes("spend") || q.includes("spent")) && extractPeriod(q)) {
    return "total_period";
  }
  if ((q.includes("total") || q.includes("spend") || q.includes("spent")) && (q.includes(" on ") || q.includes(" for ")) && extractCategory(q)) {
    return "total_category_all_time";
  }
  if ((q.includes("year") || q.includes("yearly") || q.includes("annual")) && (q.includes("spend") || q.includes("spent")) && (q.includes("total") || q.includes("show"))) {
    return "yearly_totals";
  }
  if (hasSpend && hasYear && hasShow) return "yearly_totals";
  if ((q.includes("total") || q.includes("spend") || q.includes("spent")) && q.includes("last year")) {
    return "total_last_year";
  }
  if ((q.includes("total") || q.includes("spend") || q.includes("spent")) && q.includes("this year")) {
    return "total_this_year";
  }
  if ((q.includes("total") || q.includes("spend") || q.includes("spent")) && q.includes("last month")) {
    return "total_last_month";
  }
  if (q.includes("food") && q.includes("last month")) return "food_last_month";
  if (hasSpend && hasMonth) return "monthly";
  if (hasCategoryWord && hasSpend) return "category_monthly";
  if (hasCategoryWord && hasShow) return "category_monthly";
  return "unknown";
}

function safeSqlFromIntent(intent) {
  if (intent === "food_last_month") {
    return `
      SELECT SUM(amount) AS total_spent
      FROM v_transactions
      WHERE LOWER(category_name) = 'food'
        AND full_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
        AND full_date < DATE_TRUNC('month', CURRENT_DATE)
    `;
  }

  if (intent === "last_3_days_total") {
    return `
      SELECT SUM(amount) AS total_spent_last_3_days
      FROM v_transactions
      WHERE full_date >= CURRENT_DATE - INTERVAL '2 days'
    `;
  }

  if (intent === "monthly") {
    return `
      SELECT year, month, total_amount
      FROM v_analytics_monthly
      ORDER BY year, month
    `;
  }

  if (intent === "total_last_year") {
    return `
      SELECT SUM(amount) AS total_spent
      FROM v_transactions
      WHERE EXTRACT(YEAR FROM full_date) = EXTRACT(YEAR FROM CURRENT_DATE) - 1
    `;
  }

  if (intent === "total_this_year") {
    return `
      SELECT SUM(amount) AS total_spent
      FROM v_transactions
      WHERE EXTRACT(YEAR FROM full_date) = EXTRACT(YEAR FROM CURRENT_DATE)
    `;
  }

  if (intent === "total_last_month") {
    return `
      SELECT SUM(amount) AS total_spent
      FROM v_transactions
      WHERE full_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
        AND full_date < DATE_TRUNC('month', CURRENT_DATE)
    `;
  }

  if (intent === "total_period") {
    return "SELECT SUM(amount) AS total_spent FROM v_transactions";
  }

  if (intent === "total_category_all_time") {
    return "SELECT SUM(amount) AS total_spent FROM v_transactions";
  }

  if (intent === "yearly_totals") {
    return `
      SELECT year, SUM(total_amount) AS total_amount
      FROM v_analytics_monthly
      GROUP BY year
      ORDER BY year
    `;
  }
  if (intent === "top_categories") return "SELECT * FROM v_analytics_category ORDER BY total_amount DESC LIMIT 5";
  if (intent === "average_monthly") return "SELECT AVG(total_amount) AS average_monthly_spend FROM v_analytics_monthly";
  if (intent === "highest_month") return "SELECT year, month, total_amount FROM v_analytics_monthly ORDER BY total_amount DESC LIMIT 1";
  if (intent === "anomalies") return "SELECT * FROM v_spending_anomalies ORDER BY amount DESC LIMIT 50";

  if (intent === "category_monthly") {
    return `
      SELECT year, month, category_name, SUM(amount) AS total_amount
      FROM v_transactions
      GROUP BY year, month, category_name
      ORDER BY year, month
      LIMIT 24
    `;
  }

  return null;
}

function capabilityText() {
  return [
    "I can help with:",
    "1) Spending totals (today, last 3 days, last month, custom periods)",
    "2) Category analysis (food, bills, shopping, travel)",
    "3) Monthly trends and changes",
    "4) Anomaly detection and unusual spending checks",
    "5) Forecast-style insights based on historical data"
  ].join("\n");
}

export async function getAiSqlAndNarrative(question) {
  const context = retrieveContext(question);
  const normalized = normalize(question);
  const intent = detectIntent(question);
  const sql = safeSqlFromIntent(intent);
  const period = extractPeriod(normalized);
  const category = extractCategory(normalized);

  if (intent === "greeting") {
    return { sql: null, intent, narrative: "Hi. I am APEX AI. Ask me a finance question like: 'total spend last 3 days' or 'food spend last month'." };
  }

  if (intent === "capabilities") {
    return { sql: null, intent, narrative: capabilityText() };
  }

  if (!sql) {
    return {
      sql: null,
      intent,
      period,
      category,
      narrative: "I need a clearer finance request. Try: 'total spend last 3 days', 'food spend last month', 'show monthly spending', or 'show category totals'."
    };
  }

  if (!process.env.GROQ_API_KEY) {
    return {
      intent,
      sql,
      period,
      category,
      narrative: `Groq key missing. Using rule-based SQL. Context: ${context || "general personal finance analytics"}.`
    };
  }

  const prompt = `
You are a financial analytics assistant.
Context:
${context}

Question:
${question}

SQL chosen:
${sql}

Respond with a concise plain-English explanation of what this query answers.
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
      temperature: 0.2
    })
  });

  if (!response.ok) {
    return { intent, sql, narrative: "LLM request failed. Returned SQL and raw results only." };
  }

  const data = await response.json();
  const narrative = data?.choices?.[0]?.message?.content?.trim() || "No narrative generated.";
  return { intent, sql, narrative, period, category };
}
