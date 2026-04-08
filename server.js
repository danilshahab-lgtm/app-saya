// ================== IMPORT ==================
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");

// ================== INIT ==================
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// ================== DATABASE ==================
mongoose.connect("mongodb://admin:danil1001@ac-f5rjgfe-shard-00-00.dogatub.mongodb.net:27017,ac-f5rjgfe-shard-00-01.dogatub.mongodb.net:27017,ac-f5rjgfe-shard-00-02.dogatub.mongodb.net:27017/app?ssl=true&replicaSet=atlas-cb666r-shard-0&authSource=admin&retryWrites=true&w=majority");

console.log("Database connected");

// ================== MODEL ==================
const Video = mongoose.model("Video", {
  filename: String,
  likes: Number,
  comments: [String]
});

// ================== MULTER (UPLOAD) ==================
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// ================== STATIC ==================
app.use("/uploads", express.static("uploads"));

// ================== ROUTES ==================

// halaman
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.get("/login", (req, res) => {
  res.sendFile(__dirname + "/login.html");
});

app.get("/upload", (req, res) => {
  res.sendFile(__dirname + "/upload.html");
});

app.get("/feed", (req, res) => {
  res.sendFile(__dirname + "/feed.html");
});

// upload video
app.post("/upload", upload.single("video"), async (req, res) => {
  await Video.create({
    filename: req.file.filename,
    likes: 0,
    comments: []
  });

  res.send("Upload berhasil");
});

// ambil video dari DB
app.get("/videos", async (req, res) => {
  const videos = await Video.find();
  res.json(videos);
});

// ================== SOCKET ==================
let users = {};
let videoData = {};

io.on("connection", (socket) => {
  console.log("User connect");

  // LOGIN
  socket.on("login", (username) => {
    users[username] = socket.id;
    console.log(username + " login");
  });

  // CHAT PRIVATE
  socket.on("private_chat", (data) => {
    let target = users[data.to];

    if (target) {
      io.to(target).emit("private_chat", {
        from: data.from,
        message: data.message
      });
    }
  });

  // LIKE
  socket.on("like", (video) => {
    if (!videoData[video]) {
      videoData[video] = { likes: 0, comments: [] };
    }

    videoData[video].likes++;

    io.emit("update", {
      video: video,
      data: videoData[video]
    });
  });

  // KOMENTAR
  socket.on("comment", (data) => {
    if (!videoData[data.video]) {
      videoData[data.video] = { likes: 0, comments: [] };
    }

    videoData[data.video].comments.push(data.text);

    io.emit("update", {
      video: data.video,
      data: videoData[data.video]
    });
  });

});

// ================== PORT ==================
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server jalan di port " + PORT);
});