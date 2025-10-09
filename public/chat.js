// Noughtchat - Anonymous Encrypted Chat
// Star08-web and the Noughtchat contributors - No rights reserved
// Licensed under The Unlicense (UNLICENSE) - see the LICENSE file for details
// Please don't be evil =)
//

const socket = io();
const messages = document.getElementById("messages");
const minput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const usernameLabel = document.getElementById("username-label");
let psw = "";
const deleteButton = document.getElementById("delete-chat-button");
const exportButton = document.getElementById("export-chat-button");

function createUserName() {
    const names = ["Red", "Blue", "Green", "Yellow", "Purple", "Orange", "Cyan", "Magenta", "Monika", "Natsuki", "Yuri", "Sayori", "Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Punto", "Tipo", "Bravo", "Lento", "Veloce", "Forte", "Debole", "Panda", "Picasso", "Einstein", "Newton", "Tesla"];
    const adjectives = ["Swift", "Silent", "Brave", "Clever", "Mighty", "Fierce", "Gentle", "Bold", "Wise", "Nimble", "Quick", "Sly", "Loyal", "True", "Bright", "Dark"];
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let name = names[Math.floor(Math.random() * names.length)] + "_" + adjectives[Math.floor(Math.random() * adjectives.length)];
    for (let i = 0; i < 4; i++) {
        name += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    return name;
}

document.addEventListener("DOMContentLoaded", () => {
    psw = prompt("Insert the chat password (case-sensitive). make sure that the other participants know it too. If you don't have it, you won't be able to read or send messages.");
    if (!psw) {
        alert("Noughtchat is an encrypted chat, a password is required to access it. You will be redirected to the main page.");
        window.location.href = "/";
    }
});

const userName = createUserName();
const chatID = window.location.pathname.split("/").pop();
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
                window.location.href = "/";
            }
        })
    }
});

exportButton.addEventListener("click", () => {
    let chatContent = "Chat Export\n\n";
    const messageElements = messages.getElementsByClassName("message");
    for (let elem of messageElements) {
        chatContent += elem.textContent + "\n";
    }
    const blob = new Blob([chatContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat_${chatID}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    sndMessage(`[${userName} exported the chat]`, "System");
});

function sendMessage() {
    const message = minput.value.trim();
    if (message === "") return;
    
    sndMessage(message);
}

function sndMessage(message, user = userName) {
        const messageData = {
        timestamp: new Date().toISOString(),
        sender: user,
        message: message
    };

    const messageString = JSON.stringify(messageData);

    encryptAES256GCM(messageString, psw).then((encrypted) => {
        const payload = JSON.stringify(encrypted);
        socket.emit("new_message", { roomId: chatID, encryptedData: payload });
        appendMessage("<" + messageData.timestamp + "> " + messageData.sender, message);
        minput.value = "";
    }).catch((err) => {
        console.error("Encryption error:", err);
    });
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
            const sender = messageData.sender === userName ? "You" : messageData.sender;
            appendMessage("<" + messageData.timestamp + "> " + sender, messageData.message);
        } catch (err) {
            console.error("Message parsing error:", err);
        }
    }).catch((err) => {
        console.error("Decryption error:", err);
    });
}

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
    window.location.href = "/deleted";
});