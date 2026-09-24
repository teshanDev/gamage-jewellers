import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import CalculationRecord from "../models/CalculationRecord.js";
import { calculateWastage, calculateCost } from "../lib/calculatorMath.js";

const router = Router();
router.use(requireAuth);

router.post("/wastage", async (req, res) => {
  try {
    const { costRs, initialWeight22k, price1g22k } = req.body;
    if (costRs === undefined || initialWeight22k === undefined || price1g22k === undefined) {
      return res.status(400).json({ error: "Missing required inputs" });
    }
    
    const outputs = calculateWastage(Number(costRs), Number(initialWeight22k), Number(price1g22k));
    
    const record = await CalculationRecord.create({
      type: "WASTAGE",
      inputs: { costRs, initialWeight22k, price1g22k },
      outputs,
      createdBy: req.user.sub
    });
    
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/cost", async (req, res) => {
  try {
    const { percentage, initialWeight22k, price1g22k } = req.body;
    if (percentage === undefined || initialWeight22k === undefined || price1g22k === undefined) {
      return res.status(400).json({ error: "Missing required inputs" });
    }
    
    const outputs = calculateCost(Number(percentage), Number(initialWeight22k), Number(price1g22k));
    
    const record = await CalculationRecord.create({
      type: "COST",
      inputs: { percentage, initialWeight22k, price1g22k },
      outputs,
      createdBy: req.user.sub
    });
    
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

import mongoose from "mongoose";

async function getCombinedRecords(type) {
  const newRecords = await CalculationRecord.find({ type }).lean();
  let oldRecords = [];
  
  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections({ name: "calculatorentries" }).toArray();
    if (collections.length > 0) {
      oldRecords = await db.collection("calculatorentries").find({ type }).toArray();
    }
  } catch (err) {
    console.error("Error fetching old calculatorentries:", err);
  }

  const combined = [...newRecords, ...oldRecords];
  combined.sort((a, b) => {
    const d1 = new Date(a.createdAt || a.date || 0);
    const d2 = new Date(b.createdAt || b.date || 0);
    return d2 - d1;
  });
  return combined;
}

router.get("/wastage", async (req, res) => {
  try {
    const records = await getCombinedRecords("WASTAGE");
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/cost", async (req, res) => {
  try {
    const records = await getCombinedRecords("COST");
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/wastage/:id", async (req, res) => {
  try {
    const doc = await CalculationRecord.findById(req.params.id);
    if (!doc || doc.type !== "WASTAGE") {
      return res.status(404).json({ error: "Record not found" });
    }
    await CalculationRecord.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/cost/:id", async (req, res) => {
  try {
    const doc = await CalculationRecord.findById(req.params.id);
    if (!doc || doc.type !== "COST") {
      return res.status(404).json({ error: "Record not found" });
    }
    await CalculationRecord.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
