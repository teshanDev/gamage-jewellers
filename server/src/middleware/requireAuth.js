import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Authentication required" });
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  if (req.user.role === "staff" || req.user.role === "marketing_officer") {
    const hourString = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Colombo", hour: "numeric", hour12: false }).format(new Date());
    let hour = parseInt(hourString, 10);
    if (hour === 24) hour = 0;

    if (hour >= 20 || hour < 7) {
      return res.status(403).json({ error: "outside_operating_hours", message: "System access is restricted to 7:00 AM - 8:00 PM." });
    }
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin access required" });
  next();
}

// requireRole("admin", "staff") — passes if user's role is in the list
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role))
      return res.status(403).json({ error: "Insufficient permissions" });
    next();
  };
}
