import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email and password required" });

    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({ error: "Invalid credentials" });
    if (user.active === false)
      return res.status(403).json({ error: "Account deactivated" });

    const token = jwt.sign(
      { sub: user._id.toString(), email: user.email, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ token, user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Open when no users exist (first-time setup); admin-only thereafter
router.post("/register", async (req, res) => {
  try {
    const count = await User.countDocuments();

    if (count > 0) {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Authentication required" });
      try {
        const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
        if (decoded.role !== "admin") return res.status(403).json({ error: "Admin access required" });
      } catch {
        return res.status(401).json({ error: "Invalid token" });
      }
    }

    const { name, email, password, role = "staff" } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "name, email, password required" });
    if (!["admin", "staff", "operator"].includes(role)) return res.status(400).json({ error: "role must be admin, staff, or operator" });
    if (await User.findOne({ email })) return res.status(409).json({ error: "Email already taken" });

    const passwordHash = await bcrypt.hash(password, 12);
    // First-ever user is always admin
    const user = await User.create({ name, email, passwordHash, role: count === 0 ? "admin" : role });
    res.status(201).json({ _id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
