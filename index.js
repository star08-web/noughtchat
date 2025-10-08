// Noughtchat - Anonymous Encrypted Chat
// Copyright (C) 2025-present Star08-web and the Noughtchat contributors
// Licensed under The Unlicense (UNLICENSE) - see the LICENSE file for details
// Please don't be evil =)
//

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const CHAT_DIR = path.resolve("./chats");

// Crea la cartella se non esiste
if (!fs.existsSync(CHAT_DIR)) {
  fs.mkdirSync(CHAT_DIR);
}

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, 'public')));

app.get("/", (req, res) => {
    return res.sendFile(path.join(__dirname, 'frontend', 'landing.html'));
});

app.post("/create_chat", (req, res) => {
    let chatID = createChatName();
    while (fs.existsSync(path.join(CHAT_DIR, `${chatID}.txt`))) {
        chatID = createChatName();
    }
    // crea il file della chat
    const filePath = path.join(CHAT_DIR, `${chatID}.txt`);
    fs.writeFileSync(filePath, "", "utf-8");
    return res.json({ "id": chatID });
});

app.get("/deleted", (req, res) => {
    return res.sendFile(path.join(__dirname, 'frontend', 'deleted.html'));
});

app.get("/chat/:id", (req, res) => {
    if (!fs.existsSync(path.join(CHAT_DIR, `${req.params.id}.txt`))) {
        return res.status(404).send("Chat non trovata");
    }
    // mostra il front-end
    return res.sendFile(path.join(__dirname, 'frontend', 'chat.html'));
});

app.delete("/chat/:id", (req, res) => {
    const filePath = path.join(CHAT_DIR, `${req.params.id}.txt`);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Chat non trovata" });
    }
    io.to(req.params.id).emit("chat_deleted");
    fs.unlinkSync(filePath);
    return res.json({ message: "Chat eliminata con successo" });
});

// --- WebSocket (Socket.IO) ---
io.on("connection", (socket) => {
  console.log("Nuovo utente connesso");

  socket.on("join_room", (roomId) => {
    socket.join(roomId);
    console.log(`Utente unito alla stanza: ${roomId}`);
  });

  socket.on("request_message_history", (roomId) => {
    if (!roomId) return;
    const filePath = path.join(CHAT_DIR, `${roomId}.txt`);
    if (!fs.existsSync(filePath)) return;
    const messages = fs.readFileSync(filePath, "utf-8").trim().split("\n").filter(line => line.trim() !== "");
    socket.emit("message_history", messages);
  });

  socket.on("new_message", ({ roomId, encryptedData }) => {
    if (!roomId || !encryptedData) return;

    // Salva su file
    const filePath = path.join(CHAT_DIR, `${roomId}.txt`);
    fs.appendFileSync(filePath, encryptedData + "\n", "utf-8");

    // Propaga agli altri client nella stessa stanza
    socket.to(roomId).emit("receive_message", encryptedData);
  });

  socket.on("disconnect", () => {
    console.log("Utente disconnesso");
  });
});

const PORT = 3000;


function createChatName(){
    const chatID = btoa(btoa(btoa(Math.random().toString(36).substring(2, 8) + new Date().getTime().toString(36))) + Math.random().toString(36).substring(2, 8) + new Date().getTime().toString(36) + Math.random().toString(36).substring(2, 8) + Math.random().toString(36).substring(2, 8)).replace(/=/g, '').substring(0, 16);
    return chatID;
}

server.listen(PORT, () => {
  console.log(`✅ Server attivo su http://localhost:${PORT}`);
});
