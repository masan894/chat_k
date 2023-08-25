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
    io.emit("login", name);
    let roomNum = 1 + Math.floor(Math.random() * 8);
    socket.join(`Room${roomNum}`);
    socket.emit("roomNumSet", roomNum);

    socket.on("chat message", (msg) => {
      io.emit("chat message", { name, msg });
    });
  });

  socket.on("disconnect", () => {
    console.log("someone disconnected");
  });
});

server.listen(3000, () => {
  console.log("listening on *:3000");
});
