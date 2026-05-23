import { io } from "socket.io-client";

const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined;
const TOKEN_KEY = "flame-api-token";
const RETRY_DELAYS_MS = [900, 1800, 3200, 5200, 8000, 12000];
let realtimeSocket;

function readStorage(storage) {
  try {
    return storage?.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function writeStorage(storage, token) {
  try {
    if (token) storage?.setItem(TOKEN_KEY, token);
    else storage?.removeItem(TOKEN_KEY);
  } catch {
    // Storage can be blocked in private mode. Auth still works for the current page.
  }
}

export function getToken() {
  const token = readStorage(globalThis.localStorage) || readStorage(globalThis.sessionStorage);
  if (token && !readStorage(globalThis.localStorage)) writeStorage(globalThis.localStorage, token);
  return token;
}

export function setToken(token) {
  if (token) {
    writeStorage(globalThis.localStorage, token);
    writeStorage(globalThis.sessionStorage, token);
    return;
  }

  writeStorage(globalThis.localStorage, "");
  writeStorage(globalThis.sessionStorage, "");
}

export function getRealtimeSocket() {
  if (!realtimeSocket) {
    realtimeSocket = io(SOCKET_URL, {
      autoConnect: false
    });
  }
  return realtimeSocket;
}

export function connectRealtime() {
  const socket = getRealtimeSocket();
  socket.auth = { token: getToken() };
  if (!socket.connected) socket.connect();
  return socket;
}

export function disconnectRealtime() {
  if (realtimeSocket) realtimeSocket.disconnect();
}

export function sendRealtimeMessage(payload) {
  const emitMessage = (eventName, timeoutMs) =>
    new Promise((resolve, reject) => {
      const socket = connectRealtime();
      socket.timeout(timeoutMs).emit(eventName, payload, (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || "Message failed."));
          return;
        }
        resolve(response);
      });
    });

  return emitMessage("sendMessage", 7000).catch(() => emitMessage("message:send", 20000));
}

export function joinRealtimeRoom(payload) {
  return sendRealtimeAction("joinRoom", payload, "Could not join realtime room.", 3000);
}

function sendRealtimeAction(eventName, payload, fallbackMessage, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket = connectRealtime();
    socket.timeout(timeoutMs).emit(eventName, payload, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || fallbackMessage));
        return;
      }
      resolve(response);
    });
  });
}

export function reactRealtimeMessage(payload) {
  return sendRealtimeAction("message:react", payload, "Reaction failed.");
}

export function reactRealtimePost(payload) {
  return sendRealtimeAction("post:react", payload, "Reaction failed.", 1600);
}

export function unsendRealtimeMessage(payload) {
  return sendRealtimeAction("message:unsend", payload, "Unsend failed.");
}

export function removeRealtimeMessageForYou(payload) {
  return sendRealtimeAction("message:remove-for-you", payload, "Remove failed.");
}

export function sendRealtimeTyping(payload) {
  const socket = connectRealtime();
  socket.emit(payload?.typing ? "typing" : "stopTyping", payload);
  socket.emit("typing:update", payload);
}

export function sendCallSignal(payload) {
  return sendRealtimeAction("call:signal", payload, "Call signal failed.");
}

export function createLiveKitCallToken(payload) {
  return api("/calls/token", {
    method: "POST",
    body: jsonBody(payload)
  });
}

export function markRealtimeConversationRead(payload) {
  return new Promise((resolve, reject) => {
    const socket = connectRealtime();
    socket.timeout(5000).emit("conversation:read", payload, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Read receipt failed."));
        return;
      }
      resolve(response);
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

async function wakeBackend() {
  try {
    await fetch(`${API_URL}/health`, { method: "GET", cache: "no-store" });
  } catch {
    // The retry loop below handles cold starts and temporary network misses.
  }
}

function isRetryableStatus(status) {
  return [502, 503, 504].includes(status);
}

export async function api(path, options = {}) {
  const token = getToken();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${API_URL}${normalizedPath}`;
  const requestOptions = {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  };

  let lastError = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    let response;
    try {
      response = await fetch(url, requestOptions);
    } catch (error) {
      lastError = error;
      if (attempt >= RETRY_DELAYS_MS.length) break;
      await wakeBackend();
      await wait(RETRY_DELAYS_MS[attempt]);
      continue;
    }

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json().catch(() => ({}))
      : {};

    if ((!response.ok || payload.ok === false) && isRetryableStatus(response.status) && attempt < RETRY_DELAYS_MS.length) {
      await wakeBackend();
      await wait(RETRY_DELAYS_MS[attempt]);
      continue;
    }

    if (!response.ok || payload.ok === false) {
      const fallback =
        response.status >= 500
          ? "The Flame backend is still waking up. Please try again in a moment."
          : "Request failed.";
      const error = new Error(payload.error || fallback);
      error.status = response.status;
      throw error;
    }

    return payload;
  }

  const error = new Error("The Flame backend is still waking up. Please try again in a moment.");
  error.cause = lastError;
  throw error;
}

export function jsonBody(body) {
  return JSON.stringify(body || {});
}
