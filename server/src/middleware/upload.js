import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "gamage_jewellers",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});

const limits = {
  fileSize: 5 * 1024 * 1024, // 5MB limit
};

const upload = multer({ storage, limits });

export default upload;
