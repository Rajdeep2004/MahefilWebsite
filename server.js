import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 5000;

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => {
    const safe = file.originalname.replace(/[^a-z0-9.\-_]/gi, "_");
    cb(null, `${Date.now()}-${safe}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = [
      "image/jpeg", "image/png", "image/webp", "image/gif",
      "audio/webm", "audio/ogg", "audio/mpeg", "audio/wav",
      "video/mp4", "video/webm", "video/quicktime"
    ];
    cb(null, allowed.includes(file.mimetype));
  }
});

const postSchema = new mongoose.Schema({
  author: { type: String, default: "Anonymous" },
  text: { type: String, default: "" },
  category: { type: String, default: "Shayari" },
  mediaUrl: String,
  mediaType: String,
  voiceUrl: String,
  likes: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const Post = mongoose.model("Post", postSchema);

app.get("/api/health", (_, res) => {
  res.json({ ok: true, message: "Shayari Social API is running" });
});

app.get("/api/posts", async (_, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 }).limit(100);
    res.json(posts);
  } catch {
    res.status(500).json({ message: "Could not load posts" });
  }
});

app.post("/api/posts", upload.fields([
  { name: "media", maxCount: 1 },
  { name: "voice", maxCount: 1 }
]), async (req, res) => {
  try {
    const media = req.files?.media?.[0];
    const voice = req.files?.voice?.[0];

    const post = await Post.create({
      author: req.body.author || "Anonymous",
      text: req.body.text || "",
      category: req.body.category || "Shayari",
      mediaUrl: media ? `/uploads/${media.filename}` : undefined,
      mediaType: media?.mimetype || undefined,
      voiceUrl: voice ? `/uploads/${voice.filename}` : undefined
    });

    res.status(201).json(post);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not create post" });
  }
});

app.post("/api/posts/:id/like", async (req, res) => {
  try {
    const post = await Post.findByIdAndUpdate(
      req.params.id,
      { $inc: { likes: 1 } },
      { new: true }
    );
    if (!post) return res.status(404).json({ message: "Post not found" });
    res.json({ likes: post.likes });
  } catch {
    res.status(500).json({ message: "Could not like post" });
  }
});

app.delete("/api/posts/:id", async (req, res) => {
  try {
    const post = await Post.findByIdAndDelete(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    for (const url of [post.mediaUrl, post.voiceUrl]) {
      if (url) {
        const file = path.join(__dirname, url.replace(/^\/uploads\//, "uploads/"));
        if (fs.existsSync(file)) fs.unlinkSync(file);
      }
    }
    res.json({ message: "Deleted" });
  } catch {
    res.status(500).json({ message: "Could not delete post" });
  }
});

mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/shayari_social")
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error("MongoDB connection failed:", err.message);
    console.log("Start MongoDB and run the server again.");
  });
