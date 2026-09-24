import express from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { requireAuth } from "../middleware/requireAuth.js";
import Document from "../models/Document.js";

const router = express.Router();
router.use(requireAuth);

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "gold-ledger-documents",
    resource_type: "auto",
  },
});

const upload = multer({ storage });

router.get("/", async (req, res) => {
  try {
    const documents = await Document.find().sort({ createdAt: -1 });
    res.json(documents);
  } catch (error) {
    res.status(500).json({ message: "Error fetching documents", error: error.message });
  }
});

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const newDoc = new Document({
      title: req.body.title || req.file.originalname,
      fileUrl: req.file.path,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      category: req.body.category || "General",
    });

    await newDoc.save();
    res.status(201).json(newDoc);
  } catch (error) {
    res.status(500).json({ message: "Upload failed", error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ message: "Document not found" });
    }

    // Extract public_id from Cloudinary URL
    const match = doc.fileUrl.match(/\/upload\/(?:v\d+\/)?([^\.]+)/);
    if (match && match[1]) {
      const publicId = match[1];
      // When deleting raw/auto files (like PDF), resource_type must sometimes be specified,
      // but 'auto' or 'raw' might be needed depending on how it was uploaded.
      // We uploaded with resource_type: "auto", but destroy defaults to "image".
      // Let's infer resource_type from fileType.
      let rType = "image";
      if (doc.fileType.includes("pdf") || doc.fileType.includes("raw")) {
        // According to cloudinary, if uploaded as auto, PDFs are 'image' mostly,
        // but let's just try to destroy with 'image' then 'raw' if it fails or explicitly use 'auto'?
        // Wait, cloudinary uploader destroy accepts resource_type: "raw" or "video" or "image".
      }
      
      // We'll pass resource_type derived from fileType
      const resourceType = doc.fileType.startsWith("video/") ? "video" : 
                           doc.fileType.startsWith("image/") || doc.fileType.includes("pdf") ? "image" : "raw";

      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType }).catch(console.error);
    }

    await Document.findByIdAndDelete(req.params.id);
    res.json({ message: "Document deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting document", error: error.message });
  }
});

export default router;
