const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const mongoose = require("mongoose");
const port = process.env.PORT;
const MONGODB_URL = process.env.MONGODB_URL;
mongoose.connect(MONGODB_URL, { useNewUrlParser: true }); // データベースに接続する

// オプション設定
const options = {
  timestamps: true, // データの作成時刻・更新時刻を記録する
  toJSON: {
    // データを JSON にする際の設定
    virtuals: true,
    versionKey: false,
    transform: (_, ret) => {
      delete ret._id;
      return ret;
    },
  },
};

// 保存するデータの形を定義する（データの種類が複数ある場合はそれぞれ１つずつ定義する）
const postSchema = new mongoose.Schema(
  { name: String, msg: String, roomNum: Number, postTime: String },
  options
);
// その形式のデータを保存・読み出しするために必要なモデルを作る
const Post = mongoose.model("Post", postSchema);

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

let roomNum = 0;

io.on("connection", (socket) => {
  socket.on("login", async (name) => {
    console.log(`${name} connected`);
    //let roomNum = 1 + Math.floor(Math.random() * 8);//
    roomNum += 1;
    if (roomNum == 9) {
      roomNum = 1;
    }
    socket.join(roomNum); //内部の入室処理
    socket.emit("roomNumSet", roomNum); //クライアント自身の画面にroomNumを表示させる
    io.to(roomNum).emit("login", name); //部屋のメンバーに入室を通知
    io.emit("addMember", { name, roomNum }); //メンバーリストにメンバーを追加
    //以下、MongoDBを用いたログ読み込み処理
    try {
      const mainPosts = await Post.find({ roomNum: roomNum });
      mainPosts.forEach((p) => socket.emit("chat message", p));
      for (let z = 1; z < 9; z++) {
        const logPosts = await Post.find({ roomNum: z });
        logPosts.forEach((p) => socket.emit("log message", p));
        logPosts.forEach((p) => socket.emit("addMember", p));
      }
    } catch (e) {
      console.error(e);
    }
    //以下、送信時の処理
    socket.on("chat message", async (msg) => {
      try {
        let time = new Date();
        let month = time.getMonth() + 1;
        let date = time.getDate();
        let time1 = String(month) + "/" + String(date);
        let time2 = new Date().toLocaleTimeString();
        let postTime = time1 + "   " + time2;
        const p = await Post.create({ name, msg, roomNum, postTime }); // save data to database
        io.to(roomNum).emit("chat message", { name, msg, roomNum, postTime }); //ルームチャットに送信
        io.emit("log message", { msg, roomNum, postTime }); //全体チャットに送信
      } catch (e) {
        console.error(e);
      }
    });
  });

  socket.on("disconnect", () => {
    console.log("someone disconnected");
  });
});

server.listen(3000, () => {
  console.log("listening on *:3000");
});
