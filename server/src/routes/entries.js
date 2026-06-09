import { Router } from "express";
import fs from "fs";
import path from "path";
import Entry from "../models/Entry.js";
import { requireAuth, requireAdmin, requireRole } from "../middleware/requireAuth.js";
import upload, { UPLOADS_DIR } from "../middleware/upload.js";

const router = Router();
router.use(requireAuth);

router.patch("/:id", requireRole("admin", "staff"), upload.single("photo"), async (req, res) => {
  try {
    const entry = await Entry.findById(req.params.id);
    if (!entry) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(404).json({ error: "Entry not found" });
    }
    if (entry.status === "voided") {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ error: "Cannot edit a voided entry" });
    }

    const { date, details, weightMg, ratePct, cashCents, pricePerGramCents, removePhoto } = req.body;

    entry.history.push({
      changedBy: req.user.sub,
      changedAt: new Date(),
      before: {
        date: entry.date,
        details: entry.details,
        weightMg: entry.weightMg,
        ratePct: entry.ratePct,
        cashCents: entry.cashCents,
        pricePerGramCents: entry.pricePerGramCents,
        photo: entry.photo,
      },
    });

    const parseNum = (val) => {
      if (val === undefined || val === null || val === "") return undefined;
      const n = Number(val);
      return isNaN(n) ? undefined : n;
    };

    if (date !== undefined) entry.date = date;
    if (details !== undefined) entry.details = details;
    
    const parsedWeightMg = weightMg !== undefined ? parseNum(weightMg) : undefined;
    const parsedRatePct = ratePct !== undefined ? parseNum(ratePct) : undefined;
    const parsedCashCents = cashCents !== undefined ? parseNum(cashCents) : undefined;
    const parsedPricePerGramCents = pricePerGramCents !== undefined ? parseNum(pricePerGramCents) : undefined;

    if (parsedWeightMg !== undefined) entry.weightMg = parsedWeightMg;
    if (parsedRatePct !== undefined) entry.ratePct = parsedRatePct;
    if (parsedCashCents !== undefined) entry.cashCents = parsedCashCents;
    if (parsedPricePerGramCents !== undefined) entry.pricePerGramCents = parsedPricePerGramCents;

    const oldPhoto = entry.photo;
    let photoChanged = false;

    if (removePhoto === "true" || removePhoto === true) {
      entry.photo = undefined;
      photoChanged = true;
    }

    if (req.file) {
      entry.photo = `/uploads/${req.file.filename}`;
      photoChanged = true;
    }

    if (photoChanged && oldPhoto) {
      try {
        const oldFilename = oldPhoto.startsWith('/uploads/') ? oldPhoto.replace('/uploads/', '') : oldPhoto;
        fs.unlinkSync(path.join(UPLOADS_DIR, oldFilename));
      } catch (err) {
        console.error("Failed to delete old photo file:", err);
      }
    }

    await entry.save();
    res.json(entry);
  } catch (err) {
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }
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
