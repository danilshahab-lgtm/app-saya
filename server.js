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
const midtransClient = require("midtrans-client");

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

// ================= DATABASE (ATLAS) =================
mongoose.connect("mongodb://admin:danil1001@ac-f5rjgfe-shard-00-00.dogatub.mongodb.net:27017,ac-f5rjgfe-shard-00-01.dogatub.mongodb.net:27017,ac-f5rjgfe-shard-00-02.dogatub.mongodb.net:27017/app?ssl=true&replicaSet=atlas-cb666r-shard-0&authSource=admin&retryWrites=true&w=majority");

// ================= MIDTRANS =================
let snap = new midtransClient.Snap({
  isProduction: false,
  serverKey: process.env.MIDTRANS_SERVER_KEY
});

// ================= MODEL =================
const User = mongoose.model("User", {
  username: String,
  password: String,
  coins: { type: Number, default: 100 }
});

const Video = mongoose.model("Video", {
  filename: String,
  likes: Number,
  comments: [String]
});

// ================= AUTH =================
function auth(req, res, next){
  const token = req.cookies.token;
  if(!token) return res.redirect("/login.html");

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
app.get("/login", (req,res)=>res.sendFile(__dirname+"/login.html"));
app.get("/", auth, (req,res)=>res.sendFile(__dirname+"/index.html"));
app.get("/chat", auth, (req,res)=>res.sendFile(__dirname+"/chat.html"));
app.get("/live", auth, (req,res)=>res.sendFile(__dirname+"/live.html"));

// ================= AUTH =================
app.post("/register", async (req,res)=>{
  const hashed = await bcrypt.hash(req.body.password,10);
  await User.create({ username:req.body.username, password:hashed });
  res.json({success:true});
});

app.post("/login", async (req,res)=>{
  const user = await User.findOne({username:req.body.username});
  if(!user) return res.json({success:false});

  const valid = await bcrypt.compare(req.body.password,user.password);
  if(!valid) return res.json({success:false});

  const token = jwt.sign({username:user.username},"secret123");
  res.cookie("token", token);

  res.json({success:true});
});

// ================= MIDTRANS PAYMENT =================
app.post("/payment", auth, async (req,res)=>{
  let parameter = {
    transaction_details: {
      order_id: "ORDER-" + Date.now(),
      gross_amount: 10000
    }
  };

  const transaction = await snap.createTransaction(parameter);

  res.json({ token: transaction.token });
});

// ================= TOPUP AFTER SUCCESS =================
app.post("/topup-success", auth, async (req,res)=>{
  await User.updateOne(
    {username:req.user.username},
    {$inc:{coins:100}}
  );
  res.send("Topup OK");
});

// ================= VIDEO =================
app.post("/upload", auth, upload.single("video"), async (req,res)=>{
  await Video.create({
    filename:req.file.filename,
    likes:0,
    comments:[]
  });
  res.send("OK");
});

app.get("/videos", async (req,res)=>{
  res.json(await Video.find());
});

// ================= SOCKET =================
let users = {};
let liveUsers = {};

io.on("connection",(socket)=>{

  socket.on("login",(username)=>{
    users[username]=socket.id;
  });

  // GROUP CHAT
  socket.on("group_chat",(data)=>{
    io.emit("group_chat",data);
  });

  // LIVE
  socket.on("start_live",(username)=>{
    liveUsers[username]=socket.id;
    io.emit("live_list",Object.keys(liveUsers));
  });

  socket.on("live_chat",(data)=>{
    io.emit("live_chat",data);
  });

});

// ================= PORT =================
const PORT = process.env.PORT || 3000;
server.listen(PORT,()=>console.log("RUN "+PORT));