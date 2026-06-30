import mongoose from "mongoose";

const historySchema = new mongoose.Schema(
  { changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, changedAt: { type: Date, default: Date.now }, before: mongoose.Schema.Types.Mixed },
  { _id: false }
);

const entrySchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    date: { type: Date, required: true },
    type: { type: String, enum: ["SALE", "RETURN", "GOLD_PAYMENT", "CASH_PAYMENT"], required: true },
    details: { type: String, required: true },
    weightMg: Number,           // SALE, RETURN, GOLD_PAYMENT
    ratePct: Number,            // SALE, RETURN
    cashCents: Number,          // CASH_PAYMENT
    pricePerGramCents: Number,  // CASH_PAYMENT
    photos: [String],           // Optional item photo URLs
    status: { type: String, enum: ["active", "voided"], default: "active" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    history: [historySchema],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.model("Entry", entrySchema);
