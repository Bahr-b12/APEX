import { Router } from "express";
import { supabase, toUpperKeys } from "../supabase.js";

const router = Router();

router.get("/monthly", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("v_analytics_monthly")
      .select("*")
      .order("year", { ascending: true })
      .order("month", { ascending: true });

    if (error) throw error;
    res.json((data || []).map(toUpperKeys));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/category", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("v_analytics_category")
      .select("*")
      .order("year", { ascending: true, nullsFirst: false })
      .order("month", { ascending: true, nullsFirst: false });

    if (error) throw error;
    res.json((data || []).map(toUpperKeys));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/insights/anomalies", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("v_spending_anomalies")
      .select("*")
      .order("amount", { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json((data || []).map(toUpperKeys));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
