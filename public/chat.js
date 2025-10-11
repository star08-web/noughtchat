// Noughtchat - Anonymous Encrypted Chat
// Star08-web and the Noughtchat contributors - No rights reserved
// Licensed under The Unlicense (UNLICENSE) - see the LICENSE file for details
// Please don't be evil =)

const socket = io();
const messages = document.getElementById("messages");
const minput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const usernameLabel = document.getElementById("username-label");
let chatID = "";
let psw = "";
let userName = "";
let deleter = false;
const deleteButton = document.getElementById("delete-chat-button");
const exportButton = document.getElementById("export-chat-button");

// Replay protection
class ReplayProtection {
    static seenMessages = new Set();

    static checkMessage(chatId, messageId, timestamp) {
        const key = `${chatId}:${messageId}`;

        if (this.seenMessages.has(key)) {
            throw new Error("Duplicate message detected");
        }

        const messageTime = new Date(timestamp).getTime();
        const now = Date.now();
        if (now - messageTime > 5 * 60 * 1000) {
            throw new Error("Message too old");
        }

        this.seenMessages.add(key);

        // Cleanup
        if (this.seenMessages.size > 10000) {
            const oneHourAgo = Date.now() - (60 * 60 * 1000);
            for (const msgKey of this.seenMessages) {
                const msgTimestamp = parseInt(msgKey.split(':')[2]);
                if (msgTimestamp < oneHourAgo) {
                    this.seenMessages.delete(msgKey);
                }
            }
        }
    }
}

async function main() {
    // Username generation
    function createUserName() {
        const names = ["Red", "Blue", "Green", "Yellow", "Purple", "Orange", "Cyan", "Magenta", "Monika", "Natsuki", "Yuri", "Sayori", "Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Punto", "Tipo", "Bravo", "Lento", "Veloce", "Forte", "Debole", "Panda", "Picasso", "Einstein", "Newton", "Tesla"];
        const adjectives = ["Swift", "Silent", "Brave", "Clever", "Mighty", "Fierce", "Gentle", "Bold", "Wise", "Nimble", "Quick", "Sly", "Loyal", "True", "Bright", "Dark"];
        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let name = names[Math.floor(Math.random() * names.length)] + "_" + adjectives[Math.floor(Math.random() * adjectives.length)];
        for (let i = 0; i < 6; i++) {
            name += letters.charAt(Math.floor(Math.random() * letters.length));
        }
        return name;
    }

    // Input sanitization
    function sanitizeMessage(message) {
        if (typeof message !== 'string') return '';

        return message
            .replace(/[<>]/g, '')
            .substring(0, 2000)
            .trim();
    }

    function validateMessageData(messageData) {
        const { timestamp, sender, message } = messageData;

        if (!timestamp || !sender || !message) {
            throw new Error("Invalid message data");
        }

        const messageTime = new Date(timestamp).getTime();
        const now = Date.now();
        if (isNaN(messageTime) || Math.abs(now - messageTime) > 2 * 60 * 1000) {
            throw new Error("Invalid timestamp");
        }

        if (typeof sender !== 'string' || sender.length > 100) {
            throw new Error("Invalid sender");
        }

        if (typeof message !== 'string' || message.length === 0) {
            throw new Error("Invalid message");
        }

        return true;
    }

    let validPassword = false;

    while (!validPassword) {
        psw = prompt("Insert the chat password (minimum 12 characters, mix of character types). Make sure other participants know it too.");

        if (!psw) {
            alert("Noughtchat is an encrypted chat, a password is required to access it. You will be redirected to the main page.");
            window.location.href = "/";
            return;
        }

        try {
            validatePassword(psw);
            validPassword = true;
        } catch (error) {
            alert(`Password error: ${error.message}. Please try again.`);
        }
    }

    initializeChat();

    function initializeChat() {
        userName = createUserName();
        chatID = window.location.pathname.split("/").pop();
        usernameLabel.textContent = userName;

        socket.emit("join_room", chatID);
        socket.emit("request_message_history", chatID);

        sendButton.addEventListener("click", sendMessage);
        minput.addEventListener("keypress", function (e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });

        deleteButton.addEventListener("click", () => {
            const confirmation = prompt("Are you sure you want to delete this chat? This action is irreversible. Type 'DELETE' to confirm.");
            if (confirmation === "DELETE") {
                fetch(`/chat/${chatID}`, {
                    method: 'DELETE'
                }).then(response => {
                    if (response.ok) {
                        alert("Chat deleted successfully. You will be redirected to the main page.");
                        deleter = true;
                    }
                }).catch(error => {
                    console.error("Delete error:", error);
                    alert("Error deleting chat");
                });
            }
        });

        exportButton.addEventListener("click", () => {
            let chatContent = `Noughtchat Export - Chat ID: ${chatID}\nGenerated: ${new Date().toISOString()}\n\n`;
            const messageElements = messages.getElementsByClassName("message");
            for (let elem of messageElements) {
                chatContent += elem.textContent + "\n";
            }
            sndMessage(`user ${userName} exported the chat`, "System");
            const blob = new Blob([chatContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `noughtchat_${chatID}_${Date.now()}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    function sendMessage() {
        const rawMessage = minput.value.trim();
        if (rawMessage === "") return;

        const message = sanitizeMessage(rawMessage);
        if (message === "") return;

        sndMessage(message);
    }

    function sndMessage(message, user = userName) {
        const messageData = {
            timestamp: new Date().toISOString(),
            sender: user,
            message: message,
            messageId: generateMessageId()
        };

        try {
            validateMessageData(messageData);
        } catch (error) {
            console.error("Message validation failed:", error);
            return;
        }

        const messageString = JSON.stringify(messageData);

        encryptAES256GCM(messageString, psw).then((encrypted) => {
            const payload = JSON.stringify(encrypted);
            socket.emit("new_message", { roomId: chatID, encryptedData: payload });
            minput.value = "";
        }).catch((err) => {
            console.error("Encryption error:", err);
            alert("Error sending message: " + err.message);
        });
    }

    function generateMessageId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    function appendMessage(sender, message) {
        const messageElement = document.createElement("div");
        messageElement.classList.add("message");
        messageElement.innerHTML = `<strong>${sender}:</strong> ${message}`;
        messages.appendChild(messageElement);
        messages.scrollTop = messages.scrollHeight;
    }

    function addMessage(encryptedData) {
        decryptAES256GCM(JSON.parse(encryptedData), psw).then((decrypted) => {
            try {
                const messageData = JSON.parse(decrypted);

                // Replay protection
                ReplayProtection.checkMessage(chatID, messageData.messageId, messageData.timestamp);

                const sender = messageData.sender === userName ? "You" : messageData.sender;
                appendMessage("<" + messageData.timestamp + "> " + sender, messageData.message);
            } catch (err) {
                console.error("Message processing error:", err);
            }
        }).catch((err) => {
            console.error("Decryption error:", err);
        });
    }

    // Socket event handlers
    socket.on("receive_message", (encryptedData) => {
        addMessage(encryptedData);
    });

    socket.on("message_history", (history) => {
        history.forEach((encryptedData) => {
            addMessage(encryptedData);
        });
    });

    socket.on("chat_deleted", () => {
        alert("This chat has been deleted.");
        if (deleter) {
            window.location.href = "/";
        }
        window.location.href = "/deleted";
    });

    socket.on("connect", () => {
        console.log("Connected to server");
    });

    socket.on("disconnect", () => {
        console.log("Disconnected from server");
    });

    socket.on("connect_error", (error) => {
        console.error("Connection error:", error);
    });
}

document.addEventListener("DOMContentLoaded", main);