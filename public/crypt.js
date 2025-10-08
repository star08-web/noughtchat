function bufToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}
function base64ToBuf(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}


async function deriveKeyFromPassword(password, salt, iterations = 200000) {
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


async function encryptAES256GCM(plainText, password) {
  const enc = new TextEncoder();

  // genera salt e iv casuali
  const salt = crypto.getRandomValues(new Uint8Array(16)); // 128 bit
  const iv = crypto.getRandomValues(new Uint8Array(12));   // 96 bit consigliato per GCM

  const key = await deriveKeyFromPassword(password, salt.buffer);

  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plainText)
  );

  return {
    salt: bufToBase64(salt.buffer),
    iv: bufToBase64(iv.buffer),
    ciphertext: bufToBase64(ciphertextBuf)
  };
}


async function decryptAES256GCM({ salt, iv, ciphertext }, password) {
  const dec = new TextDecoder();
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

    return dec.decode(plainBuf);
  } catch (e) {
    throw new Error("Decryption failed: incorrect password or corrupted data");
  }
}