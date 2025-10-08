// Noughtchat - Anonymous Encrypted Chat
// Copyright (C) 2025-present Star08-web and the Noughtchat contributors
// Licensed under The Unlicense (UNLICENSE) - see the LICENSE file for details
// Please don't be evil =)
//

const socket = io();
const messages = document.getElementById("messages");
const minput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const usernameLabel = document.getElementById("username-label");
let psw = "";
const deletebutton = document.getElementById("delete-chat-button");

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
    psw = prompt("Inserisci la password per accedere alla chat, la password deve essere condivisa con gli altri partecipanti, altrimenti TU non potrai leggere i loro messaggi e LORO non potranno leggere i tuoi.");
    if (!psw) {
        alert("Noughtchat è una chat crittografata, serve obbligatoriamente una password per accedere. Verrai reindirizzato alla pagina principale.");
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

deletebutton.addEventListener("click", () => {
    const confirmation = prompt("Sei sicuro di voler eliminare questa chat? Questa azione è irreversibile. Digita 'ELIMINA' per confermare.");
    if (confirmation === "ELIMINA") {
        fetch(`/chat/${chatID}`, {
            method: 'DELETE'
        }).then(response => {
            if (response.ok) {
                alert("Chat eliminata con successo. Verrai reindirizzato alla pagina principale.");
                window.location.href = "/";
            }
        })
    }
});

function sendMessage() {
    const message = minput.value.trim();
    if (message === "") return;

    const messageData = {
        timestamp: new Date().toISOString(),
        sender: userName,
        message: message
    };

    const messageString = JSON.stringify(messageData);

    encryptAES256GCM(messageString, psw).then((encrypted) => {
        const payload = JSON.stringify(encrypted);
        socket.emit("new_message", { roomId: chatID, encryptedData: payload });
        appendMessage("<" + messageData.timestamp + "> You", message);
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
    alert("Questa chat è stata eliminata permanentemente. Verrai reindirizzato alla pagina principale.");
    window.location.href = "/deleted";
});