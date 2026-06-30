import mongoose from "mongoose";

const accountSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, uppercase: true },
    place: { type: String, uppercase: true },
    phone: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    archived: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.model("Account", accountSchema);
