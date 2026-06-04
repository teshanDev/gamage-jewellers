#!/usr/bin/env node
// Usage: node src/scripts/create-admin.js <name> <email>
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js";

const [,, name, email] = process.argv;
if (!name || !email) {
  console.error("Usage: node src/scripts/create-admin.js <name> <email>");
  process.exit(1);
}

// Reads lines from stdin without echoing — works for both TTY (hidden input) and pipes.
function makeHiddenReader() {
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  process.stdin.resume();

  let buf = "";
  const queue = []; // resolved lines waiting to be consumed
  const waiting = []; // resolve callbacks waiting for the next line

  const flush = (line) => {
    if (waiting.length) waiting.shift()(line);
    else queue.push(line);
  };

  process.stdin.on("data", (chunk) => {
    for (const ch of chunk) {
      if (ch === "") { process.stdout.write("\n"); process.exit(1); } // Ctrl-C
      if (ch === "\r" || ch === "\n") { process.stdout.write("\n"); flush(buf); buf = ""; }
      else if (ch === "" || ch === "") buf = buf.slice(0, -1); // backspace
      else buf += ch;
    }
  });
  process.stdin.on("end", () => { if (buf) { process.stdout.write("\n"); flush(buf); buf = ""; } });

  return (prompt) => {
    process.stdout.write(prompt);
    return queue.length
      ? Promise.resolve(queue.shift())
      : new Promise((res) => waiting.push(res));
  };
}

const prompt = makeHiddenReader();

const password = await prompt("Password: ");
if (!password) { console.error("Password cannot be empty."); process.exit(1); }

const confirm = await prompt("Confirm password: ");
if (password !== confirm) { console.error("Passwords do not match."); process.exit(1); }

const passwordHash = await bcrypt.hash(password, 12);
const verified = await bcrypt.compare(password, passwordHash);
if (!verified) { console.error("bcrypt verification failed — aborting."); process.exit(1); }

await mongoose.connect(process.env.MONGODB_URI);

if (await User.findOne({ email, role: "admin" })) {
  console.error("An admin with that email already exists:", email);
  await mongoose.disconnect();
  process.exit(1);
}

const user = await User.create({ name, email, passwordHash, role: "admin" });
console.log("Created admin:", user.email);
await mongoose.disconnect();
