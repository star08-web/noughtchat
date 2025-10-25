// Noughtchat - Anonymous Encrypted Chat
// Star08-web and the Noughtchat contributors - No rights reserved
// Licensed under The Unlicense (UNLICENSE) - see the LICENSE file for details
// Please don't be evil =)

class SessionManager {
    static sessions = new Map();
    
    static async generateSessionKeys(chatId, password) {
        const salt = crypto.getRandomValues(new Uint8Array(32));
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(password),
            "PBKDF2",
            false,
            ["deriveKey"]
        );
        
        const sessionKey = await crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt,
                iterations: 600000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
        
        this.sessions.set(chatId, {
            key: sessionKey,
            expires: Date.now() + (60 * 60 * 1000)
        });
        
        return sessionKey;
    }
    
    static async getSessionKey(chatId, password) {
        const session = this.sessions.get(chatId);
        if (session && session.expires > Date.now()) {
            return session.key;
        }
        return await this.generateSessionKeys(chatId, password);
    }
    
    static clearExpiredSessions() {
        const now = Date.now();
        for (const [chatId, session] of this.sessions.entries()) {
            if (session.expires <= now) {
                this.sessions.delete(chatId);
            }
        }
    }
}

// Utility functions
function bufToBase64(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuf(b64) {
    const s = atob(b64);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes.buffer;
}

function constantTimeCompare(a, b) {
    if (a.length !== b.length) {
        return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
}

// Password validation
function validatePassword(password) {
    if (password.length < 12) {
        throw new Error("Password must be at least 12 characters long");
    }
    
    const checks = [
        /[A-Z]/.test(password),
        /[a-z]/.test(password),  
        /\d/.test(password),
        /[^A-Za-z0-9]/.test(password)
    ];
    
    if (checks.filter(Boolean).length < 3) {
        throw new Error("Password must contain at least 3 of: uppercase, lowercase, numbers, special characters");
    }
    
    const commonPasswords = ['password', '123456', 'qwerty', 'letmein', 'admin', 'welcome'];
    if (commonPasswords.includes(password.toLowerCase())) {
        throw new Error("Password is too common");
    }
    
    return true;
}

// Key derivation
async function deriveKeyFromPassword(password, salt, iterations = 600000) {
    const enc = new TextEncoder();
    const pwKey = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt,
            iterations,
            hash: "SHA-256"
        },
        pwKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

async function deriveHMACKey(password, salt) {
    const enc = new TextEncoder();
    const pwKey = await crypto.subtle.importKey(
        "raw",
        enc.encode(password + "HMAC"),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );
    
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt,
            iterations: 100000,
            hash: "SHA-256"
        },
        pwKey,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"]
    );
}

// Main encryption with HMAC
async function encryptAES256GCM(plainText, password) {
    validatePassword(password);
    
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const [encryptionKey, hmacKey] = await Promise.all([
        deriveKeyFromPassword(password, salt.buffer),
        deriveHMACKey(password, salt.buffer)
    ]);

    const ciphertextBuf = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        encryptionKey,
        enc.encode(plainText)
    );

    const payload = {
        salt: bufToBase64(salt.buffer),
        iv: bufToBase64(iv.buffer),
        ciphertext: bufToBase64(ciphertextBuf),
        timestamp: Date.now()
    };

    // Calculate HMAC
    const signature = await crypto.subtle.sign(
        "HMAC",
        hmacKey,
        enc.encode(JSON.stringify({ salt: payload.salt, iv: payload.iv, ciphertext: payload.ciphertext }))
    );

    return { ...payload, signature: bufToBase64(signature) };
}

// Main decryption with HMAC verification
async function decryptAES256GCM(encryptedData, password) {
    const enc = new TextEncoder();
    const { salt, iv, ciphertext, signature, timestamp } = encryptedData;
    
    // Verify timestamp (prevent replay)
    if (timestamp && Date.now() - timestamp > 5 * 60 * 1000) {
        throw new Error("Message too old");
    }

    // Verify HMAC
    const hmacKey = await deriveHMACKey(password, base64ToBuf(salt));
    const payloadString = JSON.stringify({ salt, iv, ciphertext });
    const isValid = await crypto.subtle.verify(
        "HMAC",
        hmacKey,
        base64ToBuf(signature),
        enc.encode(payloadString)
    );
    
    if (!isValid) {
        throw {
            "code": 0xA002,
            "message": new Error("HMAC verification failed. Possible causes: incorrect password or corrupted data.")
        }
    }

    // Decrypt
    try {
        const saltBuf = base64ToBuf(salt);
        const ivBuf = base64ToBuf(iv);
        const ctBuf = base64ToBuf(ciphertext);

        const key = await deriveKeyFromPassword(password, saltBuf);
        const plainBuf = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: ivBuf },
            key,
            ctBuf
        );

        return new TextDecoder().decode(plainBuf);
    } catch (e) {
        throw {
            "code": 0xA001,
            "message": new Error("Decryption failed. Possible causes: incorrect password or corrupted data.")
        }
    }
}

// Session-based encryption (forward secrecy)
async function encryptWithSession(plainText, chatId, password) {
    const sessionKey = await SessionManager.getSessionKey(chatId, password);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        sessionKey,
        enc.encode(plainText)
    );
    
    return {
        iv: bufToBase64(iv.buffer),
        ciphertext: bufToBase64(ciphertext),
        session: true,
        timestamp: Date.now()
    };
}

async function decryptWithSession(encryptedData, chatId, password) {
    const { iv, ciphertext, timestamp } = encryptedData;
    
    if (timestamp && Date.now() - timestamp > 5 * 60 * 1000) {
        throw new Error("Session message too old");
    }
    
    const sessionKey = await SessionManager.getSessionKey(chatId, password);
    const ivBuf = base64ToBuf(iv);
    const ctBuf = base64ToBuf(ciphertext);
    
    const plainBuf = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivBuf },
        sessionKey,
        ctBuf
    );
    
    return new TextDecoder().decode(plainBuf);
}

// Cleanup expired sessions every hour
setInterval(() => {
    SessionManager.clearExpiredSessions();
}, 60 * 60 * 1000);