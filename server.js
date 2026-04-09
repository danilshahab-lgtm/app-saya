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
app.use(express.static(__dirname));
app.use("/uploads", express.static("uploads"));

// ================= DATABASE =================
mongoose.connect(process.env.MONGO_URL);

// ================= MODEL =================
const User = mongoose.model("User", {
  username: String,
  password: String,
  coins: { type: Number, default: 100 }
});

const Video = mongoose.model("Video", {
  filename: String,
  likes: { type: Number, default: 0 },
  comments: [String]
});

const Chat = mongoose.model("Chat", {
  from: String,
  to: String,
  message: String,
  time: { type: Date, default: Date.now },
  seen: Boolean
});

// ================= AUTH =================
function auth(req,res,next){
  const token = req.cookies.token;
  if(!token) return res.redirect("/login.html");

  try{
    req.user = jwt.verify(token,"secret123");
    next();
  }catch{
    res.redirect("/login.html");
  }
}

// ================= STORAGE =================
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// ================= ROUTES =================
app.get("/", auth,(req,res)=>res.sendFile(__dirname+"/index.html"));
app.get("/feed", auth,(req,res)=>res.sendFile(__dirname+"/feed.html"));
app.get("/upload", auth,(req,res)=>res.sendFile(__dirname+"/upload.html"));
app.get("/private", auth,(req,res)=>res.sendFile(__dirname+"/private.html"));
app.get("/live", auth,(req,res)=>res.sendFile(__dirname+"/live.html"));
app.get("/call", auth,(req,res)=>res.sendFile(__dirname+"/videocall.html"));
app.get("/login",(req,res)=>res.sendFile(__dirname+"/login.html"));

// ================= AUTH =================
app.post("/register", async (req,res)=>{
  const hash = await bcrypt.hash(req.body.password,10);
  await User.create({username:req.body.username,password:hash});
  res.json({success:true});
});

app.post("/login", async (req,res)=>{
  const user = await User.findOne({username:req.body.username});
  if(!user) return res.json({success:false});

  const valid = await bcrypt.compare(req.body.password,user.password);
  if(!valid) return res.json({success:false});

  const token = jwt.sign({username:user.username},"secret123");
  res.cookie("token",token);

  res.json({success:true});
});

// ================= USERS =================
app.get("/users", auth, async (req,res)=>{
  res.json(await User.find({}, "username"));
});

// ================= PROFILE =================
app.get("/profile", auth, async (req,res)=>{
  res.json(await User.findOne({username:req.user.username}));
});

// ================= VIDEO =================
app.post("/upload", auth, upload.single("video"), async (req,res)=>{
  await Video.create({ filename:req.file.filename });
  res.send("OK");
});

app.get("/videos", async (req,res)=>{
  res.json(await Video.find());
});

// ================= CHAT =================
app.get("/chat/:user", auth, async (req,res)=>{
  const data = await Chat.find({
    $or:[
      {from:req.user.username,to:req.params.user},
      {from:req.params.user,to:req.user.username}
    ]
  });
  res.json(data);
});

// ================= SOCKET =================
let onlineUsers = {};
let liveUsers = {};

io.on("connection",(socket)=>{

  socket.on("online",(user)=>{
    onlineUsers[user]=socket.id;
    io.emit("online_users",Object.keys(onlineUsers));
  });

  // PRIVATE CHAT
  socket.on("private_chat", async (d)=>{
    await Chat.create({...d,seen:false});

    let to = onlineUsers[d.to];
    if(to) io.to(to).emit("private_chat",d);

    socket.emit("private_chat",d);
  });

  // GROUP CHAT
  socket.on("group_chat",(d)=>{
    io.emit("group_chat",d);
  });

  // LIVE
  socket.on("start_live",(u)=>{
    liveUsers[u]=socket.id;
    io.emit("live_list",Object.keys(liveUsers));
  });

  socket.on("live_chat",(d)=>{
    io.emit("live_chat",d);
  });

  // VIDEO CALL
  socket.on("call_user",(d)=>{
    let to = onlineUsers[d.to];
    if(to) io.to(to).emit("incoming_call",d);
  });

  socket.on("answer_call",(d)=>{
    let to = onlineUsers[d.to];
    if(to) io.to(to).emit("call_answered",d);
  });

});

// ================= START =================
server.listen(process.env.PORT||3000);