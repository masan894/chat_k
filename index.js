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
  { name: String, roomNum: Number, state: Number },
  options
);
// その形式のデータを保存・読み出しするために必要なモデルを作る
const Name = mongoose.model("Name", nameSchema);

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});
let roomNum = 0; //部屋番号の初期化
io.on("connection", (socket) => {
  socket.on("login", async (name) => {
    const historyName = await Name.findOne({ name: name });
    for (let z = 1; z < 9; z++) {
      const logName = await Name.find({
        roomNum: z,
        name: { $ne: name },
        state: 1,
      });
      logName.forEach((p) => socket.emit("changeMember", p)); //クライアントの画面にメンバーを表示
    }

    const topText =
      "ページを閉じるか更新するとログアウトします。初回と同じ名前を用いて再ログインしてください。";
    socket.emit("topLog", topText); //トップ表示を上に固定

    //MongoDBを用いたログ読み込み処理
    try {
      for (let z = 1; z < 9; z++) {
        const logPosts = await Post.find({ num: z });
        logPosts.forEach((p) => socket.emit("log message", p));
        socket.emit("latest log fetch");
      }
    } catch (e) {
      console.error(e);
    }

    //ログイン処理
    if (historyName) {
      if (historyName.state == 0) {
        socket.join(historyName.roomNum); //2回目以降の入室処理
        socket.emit("roomNumSet", historyName.roomNum); //クライアント自身の画面にroomNumを表示させる
        let time = new Date();
        let timeGMT = time.getTime();
        let timeText = timeGMT + 32400000;
        const mainPosts = await Post.find({ num: historyName.roomNum });
        mainPosts.forEach((p) => socket.emit("chat message", p));
        io.to(historyName.roomNum).emit("login", { name, timeText }); //部屋のメンバーにログインを通知
        //既にログインされている場合は名前を追加しないための分岐
        await Name.updateOne(
          { name: name },
          { $inc: { state: 1 } },
          { runValidator: true }
        );
        io.emit("changeMember", historyName); //名前送信時の処理
        console.log(`${name} connected`);
      } else if (historyName.state == 1) {
        await Name.updateOne(
          { name: name },
          { $inc: { state: 1 } },
          { runValidator: true }
        );
        socket.emit("forced logout"); //成り済まし・重複防止のログアウト処理
      }
    } else {
      const login = 1;
      roomNum += 1;
      if (roomNum == 9) {
        roomNum = 1;
      }
      let n = await Name.create({ name: name, roomNum: roomNum, state: login }); // save data to database
      socket.join(roomNum); //1回目の入室処理
      io.emit("changeMember", n); //名前送信時の処理
      socket.emit("roomNumSet", roomNum); //クライアント自身の画面にroomNumを表示させる
      let time = new Date();
      let timeGMT = time.getTime();
      let timeText = timeGMT + 32400000;
      const mainPosts = await Post.find({ num: roomNum });
      mainPosts.forEach((p) => socket.emit("chat message", p));
      io.to(roomNum).emit("login", { name, timeText }); //部屋のメンバーにログインを通知
      console.log(`${name} connected`);
    }

    //以下、チャット送信時の処理
    socket.on("chat message", async (msg) => {
      try {
        let time = new Date();
        let timeGMT = time.getTime();
        let postTime = timeGMT + 32400000;
        const postData = await Name.findOne({ name: name });
        let num = postData.roomNum;
        let cutMsg = msg.replace(/(\s　){3,}|\s{3,}|　{3,}/, "　　");
        let newMsg = cutMsg.replace(/(\r\n){3,}|\r{3,}|\n{3,}/, "\n\n");
        const p = await Post.create({
          name: name,
          msg: newMsg,
          num: num,
          postTime: postTime,
        }); // save data to database
        io.to(num).emit("chat message", { name, newMsg, postTime }); //ルームチャットに送信
        io.emit("log message2", { newMsg, num, postTime }); //全体チャットに送信
        io.emit("latest log fetch");
      } catch (e) {
        console.error(e);
      }
    });
    //切断時の処理
    socket.on("disconnect", async () => {
      await Name.updateOne(
        { name: name },
        { $inc: { state: -1 } },
        { runValidator: true }
      );
      let postData = await Name.findOne({ name: name });
      let num = postData.roomNum;
      let time = new Date();
      let timeGMT = time.getTime();
      let timeText = timeGMT + 32400000;
      if (postData.state == 0) {
        io.to(num).emit("logout", { name, timeText }); //部屋のメンバーに退室を通知
        io.emit("removeMember", { name, num });
        const logName = await Name.find({ roomNum: num, name: { $ne: name } });
        logName.forEach((p) => io.emit("changeMember", p));
        console.log(`${name} disconnected`);
      }
    });
  });
});

server.listen(port, () => {
  console.log("listening on *:3000");
});
