import { Router } from "express";
import { supabase, toUpperKeys } from "../supabase.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("v_transactions")
      .select("*")
      .order("full_date", { ascending: false })
      .order("transaction_id", { ascending: false })
      .limit(200);

    if (error) throw error;
    res.json((data || []).map(toUpperKeys));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
