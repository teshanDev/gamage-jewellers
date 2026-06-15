import { Router } from "express";
import Account from "../models/Account.js";
import fs from "fs";
import Entry from "../models/Entry.js";
import { computeBalance, buildRunningLedger, entryAmountMg } from "../lib/balance.js";
import { requireAuth, requireAdmin } from "../middleware/requireAuth.js";
import upload from "../middleware/upload.js";


const router = Router();
router.use(requireAuth);

// Active accounts list
router.get("/", async (_req, res) => {
  try {
    const accounts = await Account.find({ archived: false }).sort({ name: 1 }).lean();
    const ids = accounts.map((a) => a._id);
    const entries = await Entry.find({ accountId: { $in: ids } }).lean();

    const byAccount = {};
    for (const e of entries) {
      const key = e.accountId.toString();
      (byAccount[key] ??= []).push(e);
    }

    res.json(accounts.map((a) => ({ ...a, balanceMg: computeBalance(byAccount[a._id.toString()] ?? []) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Monthly sales vs settlements + rate margin — used by overview charts.
// All arithmetic uses entryAmountMg so totals match the ledger exactly.
//
// Rate margin per entry:
//   SALE:   marginMg = round(weightMg * ratePct / 100) - weightMg  [gold earned above metal supplied]
//   RETURN: marginMg = -(round(weightMg * ratePct / 100) - weightMg) [margin given back on return]
//   GOLD_PAYMENT / CASH_PAYMENT: no rate premium → no margin contribution
router.get("/stats", async (_req, res) => {
  try {
    const entries = await Entry.find({ status: "active" }).lean();
    const monthly = {};
    for (const e of entries) {
      const d = new Date(e.date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const key = `${year}-${month}`;
      if (!monthly[key]) monthly[key] = { salesMg: 0, settlementsMg: 0, marginMg: 0 };
      const amt = entryAmountMg(e); // integer mg, matches ledger
      if (e.type === "SALE") {
        monthly[key].salesMg  += amt;
        monthly[key].marginMg += amt - e.weightMg;           // earned above metal supplied
      } else if (e.type === "RETURN") {
        monthly[key].settlementsMg += Math.abs(amt);
        monthly[key].marginMg      -= Math.abs(amt) - e.weightMg; // subtract margin given back
      } else {
        monthly[key].settlementsMg += Math.abs(amt);          // GOLD_PAYMENT, CASH_PAYMENT
      }
    }
    res.json(
      Object.entries(monthly)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({ month, ...v }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Archived accounts list (admin only)
router.get("/archived", requireAdmin, async (_req, res) => {
  try {
    const accounts = await Account.find({ archived: true }).sort({ name: 1 }).lean();
    const ids = accounts.map((a) => a._id);
    const entries = await Entry.find({ accountId: { $in: ids } }).lean();

    const byAccount = {};
    for (const e of entries) {
      const key = e.accountId.toString();
      (byAccount[key] ??= []).push(e);
    }

    res.json(accounts.map((a) => ({ ...a, balanceMg: computeBalance(byAccount[a._id.toString()] ?? []) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, place, phone } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    res.status(201).json(await Account.create({ name, place, phone, createdBy: req.user.sub }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const account = await Account.findById(req.params.id);
    if (!account) return res.status(404).json({ error: "Account not found" });

    const entries = await Entry.find({ accountId: req.params.id })
      .populate("createdBy", "name")
      .populate("history.changedBy", "name");
    res.json({ ...account.toObject(), ledger: buildRunningLedger(entries) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id/archive", requireAdmin, async (req, res) => {
  try {
    const account = await Account.findById(req.params.id);
    if (!account) return res.status(404).json({ error: "Account not found" });
    if (account.archived) return res.status(400).json({ error: "Account is already archived" });
    account.archived = true;
    await account.save();
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id/unarchive", requireAdmin, async (req, res) => {
  try {
    const account = await Account.findById(req.params.id);
    if (!account) return res.status(404).json({ error: "Account not found" });
    if (!account.archived) return res.status(400).json({ error: "Account is not archived" });
    account.archived = false;
    await account.save();
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/entries", upload.single("photo"), async (req, res) => {
  try {
    const account = await Account.findById(req.params.id);
    if (!account) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: "Account not found" });
    }
    if (account.archived) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: "Cannot add entries to an archived account" });
    }

    const { date, type, details, weightMg, ratePct, cashCents, pricePerGramCents } = req.body;

    if (!date || !type || !details) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: "date, type, and details are required" });
    }

    const VALID = ["SALE", "RETURN", "GOLD_PAYMENT", "CASH_PAYMENT"];
    if (!VALID.includes(type)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: `type must be one of: ${VALID.join(", ")}` });
    }

    const parseNum = (val) => {
      if (val === undefined || val === null || val === "") return undefined;
      const n = Number(val);
      return isNaN(n) ? undefined : n;
    };

    const parsedWeightMg = parseNum(weightMg);
    const parsedRatePct = parseNum(ratePct);
    const parsedCashCents = parseNum(cashCents);
    const parsedPricePerGramCents = parseNum(pricePerGramCents);

    if ((type === "SALE" || type === "RETURN") && (parsedWeightMg === undefined || parsedRatePct === undefined)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: "weightMg and ratePct are required for SALE/RETURN" });
    }
    if (type === "GOLD_PAYMENT" && parsedWeightMg === undefined) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: "weightMg is required for GOLD_PAYMENT" });
    }
    if (type === "CASH_PAYMENT" && (parsedCashCents === undefined || parsedPricePerGramCents === undefined)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: "cashCents and pricePerGramCents are required for CASH_PAYMENT" });
    }

    const photo = req.file ? `/uploads/${req.file.filename}` : undefined;

    res.status(201).json(
      await Entry.create({
        accountId: req.params.id,
        date,
        type,
        details,
        weightMg: parsedWeightMg,
        ratePct: parsedRatePct,
        cashCents: parsedCashCents,
        pricePerGramCents: parsedPricePerGramCents,
        photo,
        createdBy: req.user.sub
      })
    );
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: err.message });
  }
});

export default router;
