const mongoose = require("mongoose");

mongoose.connect("mongodb://admin:danil1001@ac-f5rjgfe-shard-00-00.dogatub.mongodb.net:27017,ac-f5rjgfe-shard-00-01.dogatub.mongodb.net:27017,ac-f5rjgfe-shard-00-02.dogatub.mongodb.net:27017/?ssl=true&replicaSet=atlas-cb666r-shard-0&authSource=admin&appName=Cluster0");

console.log("Database connected");

const Video = mongoose.model("Video", {
  filename: String,
  likes: Number,
  comments: [String]
});

let videoData = {};
const fs = require("fs");
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });
const express = require("express");
const { Server } = require("engine.io");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

// halaman utama
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

// 🔥 TAMBAHKAN INI
app.get("/login", (req, res) => {
  res.sendFile(__dirname + "/login.html");
});

app.post("/upload", upload.single("video"), async (req, res) => {

  await Video.create({
    filename: req.file.filename,
    likes: 0,
    comments: []
  });

  res.send("Upload berhasil");
});
app.use("/uploads", express.static("uploads"));
// chat realtime
let users = {};
app.get("/upload", (req, res) => {
  res.sendFile(__dirname + "/upload.html");
});
app.get("/videos", async (req, res) => {
  const videos = await Video.find();
  res.json(videos);
});
app.get("/feed", (req, res) => {
  res.sendFile(__dirname + "/feed.html");
});

io.on("connection", (socket) => {
  console.log("User connect");

  // simpan user
  socket.on("login", (username) => {
    users[username] = socket.id;
    console.log(username + " login");
  });

  // kirim chat private
  socket.on("private_chat", (data) => {
    let target = users[data.to];

    if (target) {
      io.to(target).emit("private_chat", {
        from: data.from,
        message: data.message
      });
    }
  });

});

io.on("connection", (socket) => {

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
http.listen(3000, () => {
  console.log("Server jalan di http://localhost:3000");
});
