import { Router } from "express";
import mongoose from "mongoose";

const router = Router();

const DB_STATES = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };

router.get("/", (_req, res) => {
  const state = mongoose.connection.readyState;
  res.json({ status: "ok", db: DB_STATES[state] ?? "unknown" });
});

export default router;
