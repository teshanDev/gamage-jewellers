import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth);
const activeDevices = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [deviceId, timestamp] of activeDevices.entries()) {
    if (now - timestamp > 90 * 1000) {
      activeDevices.delete(deviceId);
    }
  }
}, 60 * 1000);

router.post("/heartbeat", (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ error: "deviceId is required" });
  activeDevices.set(deviceId, Date.now());
  res.json({ success: true });
});

router.get("/live-count", requireAdmin, (req, res) => {
  res.json({ count: activeDevices.size });
});

export default router;
