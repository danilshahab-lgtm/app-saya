// ================= IMPORT =================
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

// ================= INIT =================
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use("/uploads", express.static("uploads"));
app.use(express.static(__dirname));

// ================= DATABASE =================
mongoose.connect("mongodb://admin:danil1001@ac-f5rjgfe-shard-00-00.dogatub.mongodb.net:27017,ac-f5rjgfe-shard-00-01.dogatub.mongodb.net:27017,ac-f5rjgfe-shard-00-02.dogatub.mongodb.net:27017/app?ssl=true&replicaSet=atlas-cb666r-shard-0&authSource=admin&retryWrites=true&w=majority");

console.log("Database connected");

// ================= MODELS =================
const User = mongoose.model("User", {
  username: String,
  password: String,
  avatar: String
});

const Video = mongoose.model("Video", {
  filename: String,
  likes: Number,
  comments: [String]
});

// ================= AUTH =================
function auth(req, res, next){
  const token = req.cookies.token;

  if(!token){
    return res.redirect("/login.html");
  }

  try{
    const data = jwt.verify(token, "secret123");
    req.user = data;
    next();
  }catch{
    res.redirect("/login.html");
  }
}

// ================= MULTER =================
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// ================= ROUTES =================

// PUBLIC
app.get("/login", (req, res) => {
  res.sendFile(__dirname + "/login.html");
});

// PROTECTED
app.get("/", auth, (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.get("/feed", auth, (req, res) => {
  res.sendFile(__dirname + "/feed.html");
});

app.get("/upload", auth, (req, res) => {
  res.sendFile(__dirname + "/upload.html");
});

app.get("/profile-page", auth, (req, res) => {
  res.sendFile(__dirname + "/profile.html");
});

// ================= AUTH API =================
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  await User.create({ username, password: hashed });
  res.json({ success: true });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username });
  if (!user) return res.json({ success:false, message:"User tidak ada" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.json({ success:false, message:"Password salah" });

  const token = jwt.sign({ username }, "secret123");
  res.cookie("token", token);

  res.json({ success:true });
});

// ================= PROFILE =================
app.get("/profile", auth, async (req, res) => {
  const user = await User.findOne({ username: req.user.username });
  res.json(user);
});

app.post("/upload-avatar", auth, upload.single("avatar"), async (req, res) => {
  await User.updateOne(
    { username: req.user.username },
    { avatar: req.file.filename }
  );
  res.send("OK");
});

// ================= VIDEO =================
app.post("/upload", auth, upload.single("video"), async (req, res) => {
  await Video.create({
    filename: req.file.filename,
    likes: 0,
    comments: []
  });
  res.send("OK");
});

app.get("/videos", async (req, res) => {
  const videos = await Video.find();
  res.json(videos);
});

// ================= SOCKET =================
let users = {};
let videoData = {};

io.on("connection", (socket) => {

  socket.on("login", (username) => {
    users[username] = socket.id;
  });

  socket.on("private_chat", (data) => {
    let target = users[data.to];
    if (target) io.to(target).emit("private_chat", data);
  });

  socket.on("like", (video) => {
    if (!videoData[video]) videoData[video] = { likes:0, comments:[] };
    videoData[video].likes++;
    io.emit("update", { video, data: videoData[video] });
  });

  socket.on("comment", (data) => {
    if (!videoData[data.video]) videoData[data.video] = { likes:0, comments:[] };
    videoData[data.video].comments.push(data.text);
    io.emit("update", { video:data.video, data: videoData[data.video] });
  });

});

// ================= PORT =================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server jalan " + PORT));