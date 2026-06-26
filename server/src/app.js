import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import healthRouter from "./routes/health.js";
import authRouter from "./routes/auth.js";
import accountsRouter from "./routes/accounts.js";
import entriesRouter from "./routes/entries.js";
import usersRouter from "./routes/users.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const FRONTEND_URL = process.env.FRONTEND_URL;
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (!FRONTEND_URL) return cb(null, true);
    if (origin === FRONTEND_URL || origin === "http://localhost:5173") return cb(null, true);
    cb(new Error("CORS: origin not allowed"));
  },
}));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/accounts", accountsRouter);
app.use("/api/entries", entriesRouter);
app.use("/api/users", usersRouter);

export default app;
