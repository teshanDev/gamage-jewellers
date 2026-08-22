import { Router } from "express";
import Account from "../models/Account.js";
import cloudinary from "../config/cloudinary.js";
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
    
    const balances = await Entry.aggregate([
      { $match: { accountId: { $in: ids }, status: "active" } },
      { $group: { _id: "$accountId", balanceMg: { $sum: "$amountMg" } } }
    ]);
    
    const balanceMap = {};
    for (const b of balances) {
      balanceMap[b._id.toString()] = b.balanceMg;
    }
    
    res.json(accounts.map((a) => ({ ...a, balanceMg: balanceMap[a._id.toString()] || 0 })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Monthly sales vs settlements + rate margin — used by overview charts.
router.get("/stats", requireAdmin, async (_req, res) => {
  try {
    const stats = await Entry.aggregate([
      { $match: { status: "active" } },
      {
        $project: {
          yearMonth: { $dateToString: { format: "%Y-%m", date: "$date" } },
          type: 1,
          amountMg: 1,
          weightMg: { $ifNull: ["$weightMg", 0] }
        }
      },
      {
        $group: {
          _id: "$yearMonth",
          salesMg: {
            $sum: { $cond: [{ $eq: ["$type", "SALE"] }, "$amountMg", 0] }
          },
          settlementsMg: {
            $sum: {
              $cond: [
                { $in: ["$type", ["RETURN", "GOLD_PAYMENT", "CASH_PAYMENT"]] },
                { $abs: "$amountMg" },
                0
              ]
            }
          },
          marginMg: {
            $sum: {
              $switch: {
                branches: [
                  { case: { $eq: ["$type", "SALE"] }, then: { $subtract: ["$amountMg", "$weightMg"] } },
                  { case: { $eq: ["$type", "RETURN"] }, then: { $subtract: [{ $multiply: ["$amountMg", -1] }, "$weightMg"] } }
                ],
                default: 0
              }
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    res.json(stats.map(s => ({ month: s._id, salesMg: s.salesMg, settlementsMg: s.settlementsMg, marginMg: s.marginMg })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Archived accounts list (admin only)
router.get("/archived", requireAdmin, async (_req, res) => {
  try {
    const accounts = await Account.find({ archived: true }).sort({ name: 1 }).lean();
    const ids = accounts.map((a) => a._id);
    
    const balances = await Entry.aggregate([
      { $match: { accountId: { $in: ids }, status: "active" } },
      { $group: { _id: "$accountId", balanceMg: { $sum: "$amountMg" } } }
    ]);
    
    const balanceMap = {};
    for (const b of balances) {
      balanceMap[b._id.toString()] = b.balanceMg;
    }
    
    res.json(accounts.map((a) => ({ ...a, balanceMg: balanceMap[a._id.toString()] || 0 })));
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

router.post("/:id/entries", upload.array("images", 5), async (req, res) => {
  try {
    const cleanupFiles = () => {
      if (req.files && req.files.length > 0) {
        req.files.forEach(f => cloudinary.uploader.destroy(f.filename).catch(() => {}));
      }
    };
    const account = await Account.findById(req.params.id);
    if (!account) {
      cleanupFiles();
      return res.status(404).json({ error: "Account not found" });
    }
    if (account.archived) {
      cleanupFiles();
      return res.status(400).json({ error: "Cannot add entries to an archived account" });
    }

    const { date, type, details, weightMg, ratePct, cashCents, pricePerGramCents } = req.body;

    if (!date || !type || !details) {
      cleanupFiles();
      return res.status(400).json({ error: "date, type, and details are required" });
    }

    const VALID = ["SALE", "RETURN", "GOLD_PAYMENT", "CASH_PAYMENT"];
    if (!VALID.includes(type)) {
      cleanupFiles();
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
      cleanupFiles();
      return res.status(400).json({ error: "weightMg and ratePct are required for SALE/RETURN" });
    }
    if (type === "GOLD_PAYMENT" && parsedWeightMg === undefined) {
      cleanupFiles();
      return res.status(400).json({ error: "weightMg is required for GOLD_PAYMENT" });
    }
    if (type === "CASH_PAYMENT" && (parsedCashCents === undefined || parsedPricePerGramCents === undefined)) {
      cleanupFiles();
      return res.status(400).json({ error: "cashCents and pricePerGramCents are required for CASH_PAYMENT" });
    }

    const photos = req.files ? req.files.map(f => f.path) : [];

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
        photos,
        createdBy: req.user.sub
      })
    );
  } catch (err) {
    if (req.files && req.files.length > 0) {
      req.files.forEach(f => {
        try { fs.unlink(f.path, () => {}); } catch {}
      });
    }
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const account = await Account.findById(req.params.id);
    if (!account) return res.status(404).json({ error: "Account not found" });
    if (!account.archived) return res.status(400).json({ error: "Account must be archived before it can be permanently deleted" });

    const entries = await Entry.find({ accountId: account._id });
    for (const entry of entries) {
      if (entry.photos && entry.photos.length > 0) {
        entry.photos.forEach(url => {
          if (url.startsWith("http")) {
            const parts = url.split("/");
            const filename = parts.pop().split(".")[0];
            const folder = parts.pop();
            cloudinary.uploader.destroy(`${folder}/${filename}`).catch(() => {});
          }
        });
      }
    }
    await Entry.deleteMany({ accountId: account._id });
    await Account.findByIdAndDelete(account._id);

    res.json({ message: "Account deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
