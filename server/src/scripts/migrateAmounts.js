import "dotenv/config";
import mongoose from "mongoose";
import Entry from "../models/Entry.js";

async function run() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    
    const entries = await Entry.find({});
    console.log(`Found ${entries.length} entries. Updating...`);
    
    let count = 0;
    for (const e of entries) {
      await e.save(); // This will trigger the pre-save hook we just added, calculating amountMg
      count++;
    }
    
    console.log(`Successfully migrated ${count} entries!`);
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
