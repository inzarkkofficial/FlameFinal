import { io } from "socket.io-client";

const PRODUCTION_API_URL = "https://flamefinal.onrender.com/api";
const browserHost = globalThis.location?.hostname || "";
const defaultApiUrl = browserHost.endsWith("vercel.app") ? PRODUCTION_API_URL : "/api";
const API_URL = (import.meta.env.VITE_API_URL || defaultApiUrl).replace(/\/+$/, "");
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (API_URL.startsWith("http") ? API_URL.replace(/\/api\/?$/, "") : undefined);
const LEGACY_TOKEN_KEY = "flame-api-token";
const TOKEN_KEY = "flame-api-session-token";
const RETRY_DELAYS_MS = [900, 1800, 3200, 5200, 8000, 12000];
export const QUICK_RETRY_DELAYS_MS = [500, 900, 1600];
const GET_CACHE_TTL_MS = 4500;
let realtimeSocket;
const getResponseCache = new Map();
const inFlightGetRequests = new Map();

function readStorage(storage, key = TOKEN_KEY) {
  try {
    return storage?.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeStorage(storage, token, key = TOKEN_KEY) {
  try {
    if (token) storage?.setItem(key, token);
    else storage?.removeItem(key);
  } catch {
    // Storage can be blocked in private mode. Auth still works for the current page.
  }
}

export function getToken() {
  writeStorage(globalThis.localStorage, "", LEGACY_TOKEN_KEY);
  writeStorage(globalThis.sessionStorage, "", LEGACY_TOKEN_KEY);
  writeStorage(globalThis.localStorage, "");
  return readStorage(globalThis.sessionStorage);
}

export function setToken(token) {
  writeStorage(globalThis.localStorage, "", LEGACY_TOKEN_KEY);
  writeStorage(globalThis.sessionStorage, "", LEGACY_TOKEN_KEY);
  writeStorage(globalThis.localStorage, "");
  if (token) {
    writeStorage(globalThis.sessionStorage, token);
    return;
  }

  writeStorage(globalThis.sessionStorage, "");
}

export function getRealtimeSocket() {
  if (!realtimeSocket) {
    realtimeSocket = io(SOCKET_URL, {
      autoConnect: false,
      reconnectionAttempts: 8,
      reconnectionDelay: 600,
      reconnectionDelayMax: 5000,
      transports: ["websocket", "polling"]
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
  if (realtimeSocket) {
    realtimeSocket.removeAllListeners();
    realtimeSocket.disconnect();
  }
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

  return emitMessage("sendMessage", 4500).catch(() => emitMessage("message:send", 4500));
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

export function editRealtimeMessage(payload) {
  return sendRealtimeAction("message:edit", payload, "Edit failed.");
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
  const retryDelays = Array.isArray(options.retryDelays) ? options.retryDelays : RETRY_DELAYS_MS;
  const { retryDelays: _retryDelays, ...fetchOptions } = options;
  const method = String(fetchOptions.method || "GET").toUpperCase();
  const cacheKey = `${method}:${url}:${token}`;
  const canUseGetCache =
    method === "GET" &&
    !fetchOptions.body &&
    fetchOptions.cache !== "no-store" &&
    fetchOptions.cache !== "reload" &&
    !fetchOptions.signal;

  if (canUseGetCache) {
    const cached = getResponseCache.get(cacheKey);
    if (cached && Date.now() - cached.at < GET_CACHE_TTL_MS) return cached.payload;
    const inFlight = inFlightGetRequests.get(cacheKey);
    if (inFlight) return inFlight;
  }

  const requestOptions = {
    ...fetchOptions,
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  };

  const fetchPromise = (async () => {
    let lastError = null;
    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      let response;
      try {
        response = await fetch(url, requestOptions);
      } catch (error) {
        lastError = error;
        if (attempt >= retryDelays.length) break;
        await wakeBackend();
        await wait(retryDelays[attempt]);
        continue;
      }

      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json")
        ? await response.json().catch(() => ({}))
        : {};

      if ((!response.ok || payload.ok === false) && isRetryableStatus(response.status) && attempt < retryDelays.length) {
        await wakeBackend();
        await wait(retryDelays[attempt]);
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

      if (canUseGetCache) {
        getResponseCache.set(cacheKey, { at: Date.now(), payload });
      }
      return payload;
    }

    const error = new Error("The Flame backend is still waking up. Please try again in a moment.");
    error.cause = lastError;
    throw error;
  })();

  if (canUseGetCache) {
    inFlightGetRequests.set(cacheKey, fetchPromise);
    fetchPromise.finally(() => inFlightGetRequests.delete(cacheKey)).catch(() => {});
  }

  return fetchPromise;
}

export function jsonBody(body) {
  return JSON.stringify(body || {});
}
