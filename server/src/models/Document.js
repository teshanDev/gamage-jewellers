import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    fileUrl: { type: String, required: true },
    fileType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    category: { type: String, default: "General" },
  },
  { timestamps: true }
);

export default mongoose.model("Document", documentSchema);
