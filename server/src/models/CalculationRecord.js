import mongoose from "mongoose";

const calculationRecordSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["WASTAGE", "COST"], required: true },
    inputs: { type: mongoose.Schema.Types.Mixed, required: true },
    outputs: { type: mongoose.Schema.Types.Mixed, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.model("CalculationRecord", calculationRecordSchema);
