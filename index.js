const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

io.on("connection", (socket) => {
  socket.on("login", (name) => {
    console.log(`${name} connected`);
    let roomNum = 1 + Math.floor(Math.random() * 8);
    socket.join(roomNum); //内部の入室処理
    socket.emit("roomNumSet", roomNum); //クライアント自身の画面にroomNumを表示させる
    io.to(roomNum).emit("login", name); //部屋のメンバーに入室を通知
    io.emit("addMember", { name, roomNum }); //メンバーリストにメンバーを追加

    socket.on("chat message", (msg) => {
      io.to(roomNum).emit("chat message", { name, msg, roomNum }); //ルームチャットに送信
      io.emit("log message", { msg, roomNum }); //全体チャットに送信
    });
  });

  socket.on("disconnect", () => {
    console.log("someone disconnected");
  });
});

server.listen(3000, () => {
  console.log("listening on *:3000");
});
