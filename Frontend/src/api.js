import { io } from "socket.io-client";

const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined;
const TOKEN_KEY = "flame-api-token";
let realtimeSocket;

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
    return;
  }

  sessionStorage.removeItem(TOKEN_KEY);
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
  return new Promise((resolve, reject) => {
    const socket = connectRealtime();
    socket.timeout(20000).emit("message:send", payload, (error, response) => {
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
  let response;
  try {
    response = await fetch(url, requestOptions);
  } catch (error) {
    try {
      await fetch(`${API_URL}/health`, { method: "GET", cache: "no-store" });
      response = await fetch(url, requestOptions);
    } catch {
      throw new Error("The Flame backend is waking up. Please try again in a few seconds.");
    }
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : {};
  if (!response.ok || payload.ok === false) {
    const fallback =
      response.status >= 500
        ? "Cannot reach the Flame backend. Make sure the API server is running."
        : "Request failed.";
    const error = new Error(payload.error || fallback);
    error.status = response.status;
    throw error;
  }

  return payload;
}

export function jsonBody(body) {
  return JSON.stringify(body || {});
}
