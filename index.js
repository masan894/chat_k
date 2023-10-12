const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const mongoose = require("mongoose");
const dotenv = require("dotenv").config();
console.log("\n= = = dotenv is loaded. = = =\n");
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
  { name: String, msg: String, num: Number, postTime: String },
  options
);
// その形式のデータを保存・読み出しするために必要なモデルを作る
const Post = mongoose.model("Post", postSchema);

// 保存するデータの形を定義する（データの種類が複数ある場合はそれぞれ１つずつ定義する）
const nameSchema = new mongoose.Schema(
  { name: String, roomNum: Number },
  options
);
// その形式のデータを保存・読み出しするために必要なモデルを作る
const Name = mongoose.model("Name", nameSchema);

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

let roomNum = 0;
io.on("connection", (socket) => {
  socket.on("login", async (name) => {
    console.log(`${name} connected`);
    const historyName = await Name.findOne({ name: name });
    for (let z = 1; z < 9; z++) {
      const logName = await Name.find({ roomNum: z, name: { $ne: name } });
      logName.forEach((p) => socket.emit("changeMember", p));
    }
    if (historyName) {
      socket.join(historyName.roomNum); //2回目以降の入室処理
      io.emit("changeMember", historyName); //名前送信時の処理
    } else {
      let n = await Name.create({ name, roomNum }); // save data to database
      roomNum += 1;
      if (roomNum == 9) {
        roomNum = 1;
      }
      socket.join(roomNum); //1回目の入室処理
      io.emit("changeMember", n); //名前送信時の処理
    }

    const topText =
      "ページを閉じるか更新するとログアウトします。再度名前を入力して再ログインしてください。（再ログイン時は同じ名前を用いてください。）";
    socket.emit("topLog", topText);
    socket.emit("roomNumSet", roomNum); //クライアント自身の画面にroomNumを表示させる
    let time = new Date();
    let timeGMT = time.getTime();
    let timeText = timeGMT + 32400000;
    io.to(roomNum).emit("login", { name, timeText }); //部屋のメンバーにログインを通知
    const mainPosts = await Post.find({ num: roomNum });
    mainPosts.forEach((p) => socket.emit("chat message", p));

    //以下MongoDBを用いたログ読み込み処理
    try {
      for (let z = 1; z < 9; z++) {
        const logPosts = await Post.find({ num: z });
        logPosts.forEach((p) => socket.emit("log message", p));
      }
    } catch (e) {
      console.error(e);
    }
    //以下、チャット送信時の処理
    socket.on("chat message", async (msg) => {
      try {
        let time = new Date();
        let timeGMT = time.getTime();
        let postTime = timeGMT + 32400000;
        const postData = await Name.findOne({ name: name });
        let num = postData.roomNum;
        const p = await Post.create({ name, msg, num, postTime }); // save data to database
        io.to(num).emit("chat message", { name, msg, postTime }); //ルームチャットに送信
        io.emit("log message2", { msg, num, postTime }); //全体チャットに送信
      } catch (e) {
        console.error(e);
      }
    });
    socket.on("disconnect", async () => {
      console.log(`${name} disconnected`);
      const postData = await Name.findOne({ name: name });
      let num = postData.roomNum;
      let time = new Date();
      let timeGMT = time.getTime();
      let timeText = timeGMT + 32400000;
      io.to(num).emit("logout", { name, timeText }); //部屋のメンバーに退室を通知
      //await Name.deleteMany({ name: name });
      io.emit("removeMember", { name, num });
      const logName = await Name.find({ roomNum: num, name: { $ne: name } });
      logName.forEach((p) => io.emit("changeMember", p));
    });
  });
});

server.listen(port, () => {
  console.log("listening on *:3000");
});
