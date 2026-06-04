import { Router } from "express";
import Entry from "../models/Entry.js";
import { requireAuth, requireAdmin, requireRole } from "../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth);

router.patch("/:id", requireRole("admin", "staff"), async (req, res) => {
  try {
    const entry = await Entry.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: "Entry not found" });
    if (entry.status === "voided") return res.status(400).json({ error: "Cannot edit a voided entry" });

    const { date, details, weightMg, ratePct, cashCents, pricePerGramCents } = req.body;

    entry.history.push({
      changedBy: req.user.sub,
      changedAt: new Date(),
      before: {
        date: entry.date, details: entry.details,
        weightMg: entry.weightMg, ratePct: entry.ratePct,
        cashCents: entry.cashCents, pricePerGramCents: entry.pricePerGramCents,
      },
    });

    if (date !== undefined) entry.date = date;
    if (details !== undefined) entry.details = details;
    if (weightMg !== undefined) entry.weightMg = weightMg;
    if (ratePct !== undefined) entry.ratePct = ratePct;
    if (cashCents !== undefined) entry.cashCents = cashCents;
    if (pricePerGramCents !== undefined) entry.pricePerGramCents = pricePerGramCents;

    await entry.save();
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id/void", requireAdmin, async (req, res) => {
  try {
    const entry = await Entry.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: "Entry not found" });
    if (entry.status === "voided") return res.status(400).json({ error: "Entry is already voided" });

    entry.history.push({ changedBy: req.user.sub, changedAt: new Date(), before: { status: "active" } });
    entry.status = "voided";
    await entry.save();
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
