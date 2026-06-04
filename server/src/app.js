import express from "express";
import cors from "cors";
import healthRouter from "./routes/health.js";
import authRouter from "./routes/auth.js";
import accountsRouter from "./routes/accounts.js";
import entriesRouter from "./routes/entries.js";
import usersRouter from "./routes/users.js";

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

app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/accounts", accountsRouter);
app.use("/entries", entriesRouter);
app.use("/users", usersRouter);

export default app;
