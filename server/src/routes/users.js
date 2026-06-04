import { Router } from "express";
import User from "../models/User.js";
import { requireAuth, requireAdmin } from "../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/", async (_req, res) => {
  try {
    res.json(await User.find().select("-passwordHash").sort({ createdAt: 1 }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id/role", async (req, res) => {
  try {
    const { role } = req.body;
    if (!["admin", "staff", "operator"].includes(role))
      return res.status(400).json({ error: "role must be admin, staff, or operator" });
    if (req.params.id === req.user.sub)
      return res.status(400).json({ error: "Cannot change your own role" });

    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select("-passwordHash");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id/deactivate", async (req, res) => {
  try {
    if (req.params.id === req.user.sub)
      return res.status(400).json({ error: "Cannot deactivate your own account" });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.active === false) return res.status(400).json({ error: "User is already deactivated" });

    user.active = false;
    await user.save();
    res.json(user.toObject({ transform: (_, o) => { delete o.passwordHash; return o; } }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id/reactivate", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.active !== false) return res.status(400).json({ error: "User is already active" });

    user.active = true;
    await user.save();
    res.json(user.toObject({ transform: (_, o) => { delete o.passwordHash; return o; } }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
