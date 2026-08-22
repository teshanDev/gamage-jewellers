import { Router } from "express";
import CalculatorEntry from "../models/CalculatorEntry.js";
import {
  calculateWastagePercentage,
  calculateCostFromPercentage,
  validateWastageInputs,
  validateCostInputs
} from "../lib/goldCalc.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth);

// GET calculator entries history
router.get("/:type", async (req, res) => {
  try {
    const { type } = req.params;

    if (!['wastage_percentage', 'cost'].includes(type)) {
      return res.status(400).json({ error: "Invalid calculator type" });
    }

    const entries = await CalculatorEntry.find({
      calculatorType: type,
      createdBy: req.user.sub
    }).sort({ createdAt: -1 }).lean();

    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new calculator entry
router.post("/:type", async (req, res) => {
  try {
    const { type } = req.params;

    if (!['wastage_percentage', 'cost'].includes(type)) {
      return res.status(400).json({ error: "Invalid calculator type" });
    }

    let result = null;
    let entryData = {};

    if (type === 'wastage_percentage') {
      const { cost, pricePerGram22k, initialWeight } = req.body;

      const validationErrors = validateWastageInputs(cost, pricePerGram22k, initialWeight);
      if (validationErrors) {
        return res.status(400).json({ error: "Invalid input", details: validationErrors });
      }

      result = calculateWastagePercentage(
        parseFloat(cost),
        parseFloat(pricePerGram22k),
        parseFloat(initialWeight)
      );

      if (result.percentage === null) {
        return res.status(400).json({ error: "Cannot calculate with zero initial weight" });
      }

      entryData = {
        calculatorType: type,
        pricePerGram22k: parseFloat(pricePerGram22k),
        cost: parseFloat(cost),
        initialWeight: parseFloat(initialWeight),
        computedPercentage: result.percentage,
        computedWastageG: result.wastageG,
        computedFinalWeight24kG: result.finalWeight24kG,
        createdBy: req.user.sub
      };
    } else if (type === 'cost') {
      const { percentage, pricePerGram22k, initialWeight } = req.body;

      const validationErrors = validateCostInputs(percentage, pricePerGram22k, initialWeight);
      if (validationErrors) {
        return res.status(400).json({ error: "Invalid input", details: validationErrors });
      }

      result = calculateCostFromPercentage(
        parseFloat(percentage),
        parseFloat(pricePerGram22k),
        parseFloat(initialWeight)
      );

      if (result === null) {
        return res.status(400).json({ error: "Cannot calculate with invalid inputs" });
      }

      entryData = {
        calculatorType: type,
        pricePerGram22k: parseFloat(pricePerGram22k),
        percentage: parseFloat(percentage),
        initialWeight: parseFloat(initialWeight),
        computedCost: result,
        createdBy: req.user.sub
      };
    }

    const calculatorEntry = await CalculatorEntry.create(entryData);
    res.status(201).json(calculatorEntry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE calculator entry (hard delete for cleanup)
router.delete("/:id", async (req, res) => {
  try {
    const entry = await CalculatorEntry.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user.sub
    });

    if (!entry) {
      return res.status(404).json({ error: "Calculator entry not found" });
    }

    res.json({ message: "Calculator entry deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
