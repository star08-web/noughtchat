// Noughtchat - Anonymous Encrypted Chat
// Star08-web and the Noughtchat contributors - No rights reserved
// Licensed under The Unlicense (UNLICENSE) - see the LICENSE file for details
// Please don't be evil =)

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const betterSqlite3 = require("better-sqlite3");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    allowEIO3: true,
    cors: {
        origin: "*",
        methods: ["GET", "POST", "DELETE"]
    }
});

const db = new betterSqlite3(':memory:');
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Crea tabella messaggi se non esiste
db.prepare(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        encrypted_data TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`).run();

// Security Headers
app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "connect-src 'self' ws: wss:; " +
        "frame-ancestors 'none'; " +
        "base-uri 'self'"
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.removeHeader("X-Powered-By");
    const onion = process.env.ONION_URL || undefined;
    if (onion) res.setHeader("Onion-Location", onion);
    next();
});

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, 'public')));

app.get("/", (req, res) => {
    return res.sendFile(path.join(__dirname, 'frontend', 'landing.html'));
});

app.post("/create_chat", (req, res) => {
    let chatID = createSecureChatName();
    while (db.prepare("SELECT 1 FROM messages WHERE chat_id = ?").get(chatID)) {
        chatID = createSecureChatName(); // Rigenera se collisione
    }
    db.prepare("INSERT INTO messages (chat_id, encrypted_data) VALUES (?, ?)").run(chatID, "Chat creata");
    return res.json({ chat_id: chatID });
});

app.get("/deleted", (req, res) => {
    return res.sendFile(path.join(__dirname, 'frontend', 'deleted.html'));
});

app.get("/chat/:id", (req, res) => {
    if (!db.prepare("SELECT 1 FROM messages WHERE chat_id = ?").get(req.params.id)) {
        return res.status(404).sendFile(path.join(__dirname, 'frontend', '404.html'));
    }
    return res.sendFile(path.join(__dirname, 'frontend', 'chat.html'));
});

app.delete("/chat/:id", (req, res) => {
    io.to(req.params.id).emit("chat_deleted");
    db.prepare("DELETE FROM messages WHERE chat_id = ?").run(req.params.id);
    return res.json({ message: "Chat eliminata con successo" });
});

// --- WebSocket (Socket.IO) ---
io.on("connection", (socket) => {
  socket.on("join_room", (roomId) => {
    if (!roomId || typeof roomId !== 'string' || roomId.length > 100) {
        return;
    }
    socket.join(roomId);
  });

  socket.on("request_message_history", (roomId) => {
    if (!roomId || typeof roomId !== 'string') return;
    const rows = db.prepare("SELECT encrypted_data FROM messages WHERE chat_id = ? ORDER BY timestamp ASC").all(roomId);
    const messages = rows.map(row => row.encrypted_data);
    socket.emit("message_history", messages);
  });

  socket.on("new_message", ({ roomId, encryptedData }) => {
    if (!roomId || !encryptedData || typeof encryptedData !== 'string') return;

    // Validazione base
    if (encryptedData.length > 10000) {
        return; // Messaggio troppo grande
    }

    db.prepare("INSERT INTO messages (chat_id, encrypted_data) VALUES (?, ?)").run(roomId, encryptedData);
  });
});

const PORT = process.env.PORT || 3000;

function createSecureChatName() {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex').substring(0, 32);
}

// Delete inactive chats after one hour
function setupChatCleanup() {
    const ONE_HOUR = 60 * 60 * 1000; // 1 hour in milliseconds
    
    setInterval(() => {
        try {
            console.log("Running cleanup for inactive chats...");
            
            // Get all unique chat IDs
            const chats = db.prepare("SELECT DISTINCT chat_id FROM messages").all();
            
            chats.forEach(chat => {
                // Get timestamp of the most recent message
                const lastActivity = db.prepare(
                    "SELECT MAX(timestamp) as last_activity FROM messages WHERE chat_id = ?"
                ).get(chat.chat_id);
                
                if (lastActivity && lastActivity.last_activity) {
                    const lastActivityTime = new Date(lastActivity.last_activity).getTime();
                    const currentTime = new Date().getTime();
                    
                    // If chat is inactive for more than an hour, delete it
                    if (currentTime - lastActivityTime > ONE_HOUR) {
                        console.log(`Deleting inactive chat: ${chat.chat_id}`);
                        db.prepare("DELETE FROM messages WHERE chat_id = ?").run(chat.chat_id);
                        io.to(chat.chat_id).emit("chat_deleted");
                    }
                }
            });
        } catch (error) {
            console.error("Error in chat cleanup:", error);
        }
    }, ONE_HOUR);
}

// Initialize the cleanup routine
setupChatCleanup();

server.listen(PORT, () => {
  console.log(`✅ Server attivo su http://localhost:${PORT}`);
});