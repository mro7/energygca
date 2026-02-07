const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const { initWebsocket } = require("./websocket");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, "public")));

// Inicializar lógica de WebSocket
initWebsocket(io);

const PORT = 4001;
server.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
