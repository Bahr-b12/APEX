import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import transactionsRoute from "./routes/transactions.js";
import analyticsRoute from "./routes/analytics.js";
import aiRoute from "./routes/ai.js";
import { supabase } from "./supabase.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "apex-backend" }));
app.get("/health/db", async (_req, res) => {
  try {
    const { count: txCount, error: txErr } = await supabase.from("fact_transactions").select("*", { count: "exact", head: true });
    if (txErr) throw txErr;
    const { count: dateCount, error: dateErr } = await supabase.from("dim_date").select("*", { count: "exact", head: true });
    if (dateErr) throw dateErr;
    const { count: catCount, error: catErr } = await supabase.from("dim_category").select("*", { count: "exact", head: true });
    if (catErr) throw catErr;
    res.json({ ok: true, txCount: txCount || 0, dateCount: dateCount || 0, catCount: catCount || 0 });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});
app.use("/transactions", transactionsRoute);
app.use("/analytics", analyticsRoute);
app.use("/", aiRoute);

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`APEX backend running on http://localhost:${port}`);
});
