import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AccessToken } from "livekit-server-sdk";
import { Server as SocketIOServer } from "socket.io";
import { FlameDatabase } from "./database.js";

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = resolve(SERVER_DIR, "..");
const PROJECT_ROOT = resolve(BACKEND_ROOT, "..");

function loadEnvFile() {
  const envPath = [join(BACKEND_ROOT, ".env"), join(PROJECT_ROOT, ".env")].find((path) => existsSync(path));
  if (!envPath) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const PORT = Number(process.env.PORT || 4000);
const CLIENT_DIST = resolve(process.env.CLIENT_DIST || join(PROJECT_ROOT, "Frontend", "dist"));
const CORS_ORIGIN = process.env.CORS_ORIGIN || `http://localhost:${PORT}`;
const db = new FlameDatabase();
let io;
let dbReady = false;
let dbInitError = null;
let dbInitPromise = null;
const onlineUsers = new Map();
const POST_REACTIONS = new Set(["love", "laugh", "wow", "sad", "angry", "care", "like", "fire"]);
const POST_MEDIA_MAX_CHARS = 14_000_000;
const POSITIONSTACK_API_KEY = process.env.POSITIONSTACK_API_KEY || "";
const POSITIONSTACK_ENDPOINT = process.env.POSITIONSTACK_ENDPOINT || "http://api.positionstack.com/v1/forward";
const LOCATION_SEARCH_ENDPOINT = process.env.LOCATION_SEARCH_ENDPOINT || "https://nominatim.openstreetmap.org/search";
const LOCATION_USER_AGENT = process.env.LOCATION_USER_AGENT || "FlameProject/1.0 location autocomplete";
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "";
const YOUTUBE_SEARCH_ENDPOINT = process.env.YOUTUBE_SEARCH_ENDPOINT || "https://www.googleapis.com/youtube/v3/search";
const LIVEKIT_URL = process.env.LIVEKIT_URL || "";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "";
const locationSearchCache = new Map();
const POST_ROUTE_ALIASES = new Map([
  ["/posts", "/api/posts"],
  ["/feed/posts", "/api/posts"],
  ["/api/feed/posts", "/api/posts"],
  ["/posts/reactions", "/api/posts/reactions"],
  ["/feed/posts/reactions", "/api/posts/reactions"],
  ["/api/feed/posts/reactions", "/api/posts/reactions"],
  ["/posts/comments", "/api/posts/comments"],
  ["/feed/posts/comments", "/api/posts/comments"],
  ["/api/feed/posts/comments", "/api/posts/comments"],
  ["/posts/comments/reactions", "/api/posts/comments/reactions"],
  ["/feed/posts/comments/reactions", "/api/posts/comments/reactions"],
  ["/api/feed/posts/comments/reactions", "/api/posts/comments/reactions"],
  ["/posts/share", "/api/posts/share"],
  ["/feed/posts/share", "/api/posts/share"],
  ["/api/feed/posts/share", "/api/posts/share"]
]);

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function sendJson(res, status, payload) {
  res.writeHead(status, jsonHeaders);
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  sendJson(res, status, { ok: false, error: message });
}

function normalizeRoutePath(pathname) {
  const normalized = pathname.replace(/\/{2,}/g, "/");
  return POST_ROUTE_ALIASES.get(normalized) || normalized;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 25_000_000) {
        reject(Object.assign(new Error("Request body is too large."), { status: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("Invalid JSON body."), { status: 400 }));
      }
    });
  });
}

function tokenFrom(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

function requireUser(req) {
  const token = tokenFrom(req);
  return Promise.resolve(token ? db.findUserBySession(token) : null).then((user) => {
    if (!user) {
      const error = new Error("Please log in again.");
      error.status = 401;
      throw error;
    }
    return { user, token };
  });
}

function cleanString(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanRoomSegment(value, fallback = "flame") {
  const segment = cleanString(value, 120).replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
  return segment || fallback;
}

function publicDisplayName(user) {
  const profile = user?.state?.user || {};
  return cleanString(profile.fullName, 80).split(/\s+/)[0] || cleanString(user?.email, 80).split("@")[0] || "Flame user";
}

async function createLiveKitCallToken(user, body = {}) {
  const profileId = cleanString(body.profileId, 80);
  const callId = cleanString(body.callId, 140);
  const mode = cleanString(body.mode, 16) === "video" ? "video" : "audio";

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    throw Object.assign(new Error("LiveKit is not configured on the server."), { status: 503 });
  }

  if (!profileId || !callId) {
    throw Object.assign(new Error("Choose a call and conversation first."), { status: 400 });
  }

  const matches = Array.isArray(user.state?.matches) ? user.state.matches : [];
  const matched = matches.some((match) => match?.profileId === profileId && !match.deletedAt && !match.blockedAt);
  if (!matched) {
    throw Object.assign(new Error("Calls are only available for active matches."), { status: 403 });
  }

  const participants = [cleanRoomSegment(user.id, "me"), cleanRoomSegment(profileId, "match")].sort();
  const roomName = cleanRoomSegment(`flame_call_${participants.join("_")}_${callId}`, "flame_call").slice(0, 180);
  const profile = user.state?.user || {};
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: user.id,
    name: publicDisplayName(user),
    metadata: JSON.stringify({
      image: profile.image || "/flame-logo.gif",
      mode
    }),
    ttl: "2h"
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true
  });

  return {
    url: LIVEKIT_URL,
    token: await token.toJwt(),
    roomName
  };
}

function ageFromBirthDate(value) {
  const birthDate = new Date(String(value || "").trim());
  if (!value || Number.isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age -= 1;
  return age;
}

function uniqueStrings(values, limit = 12) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = cleanString(value, 160).replace(/\s+/g, " ");
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function locationNameFromPositionstackResult(result) {
  const city =
    result?.locality ||
    result?.neighbourhood ||
    result?.county ||
    result?.name;
  const region = result?.region || result?.region_code;
  const country = result?.country;
  return uniqueStrings([[city, region, country].filter(Boolean).join(", "), result?.label], 1)[0] || "";
}

function locationNameFromNominatimResult(result) {
  const address = result?.address || {};
  const city =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.suburb ||
    address.county ||
    result?.name;
  const region = address.state || address.region || address.province;
  const country = address.country;
  return uniqueStrings([[city, region, country].filter(Boolean).join(", "), result?.display_name], 1)[0] || "";
}

async function fetchJsonWithTimeout(url, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", ...headers }
    });
    return response.ok ? response.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function searchPositionstackLocations(q) {
  if (!POSITIONSTACK_API_KEY) return [];

  const url = new URL(POSITIONSTACK_ENDPOINT);
  url.searchParams.set("access_key", POSITIONSTACK_API_KEY);
  url.searchParams.set("query", q);
  url.searchParams.set("limit", "12");
  url.searchParams.set("output", "json");

  const data = await fetchJsonWithTimeout(url);
  if (!data || data.error) return [];
  return uniqueStrings(Array.isArray(data.data) ? data.data.map(locationNameFromPositionstackResult) : [], 12);
}

async function searchNominatimLocations(q) {
  const url = new URL(LOCATION_SEARCH_ENDPOINT);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "14");
  url.searchParams.set("q", q);

  const data = await fetchJsonWithTimeout(url, { "User-Agent": LOCATION_USER_AGENT });
  return uniqueStrings(Array.isArray(data) ? data.map(locationNameFromNominatimResult) : [], 12);
}

async function searchLocations(query) {
  const q = cleanString(query, 100);
  if (q.length < 2) return [];

  const cacheKey = q.toLowerCase();
  const cached = locationSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 1000 * 60 * 60 * 24) return cached.locations;

  let locations = await searchPositionstackLocations(q);
  if (locations.length === 0) locations = await searchNominatimLocations(q);

  locationSearchCache.set(cacheKey, { at: Date.now(), locations });
  return locations;
}

async function searchYouTubeMusic(query) {
  const q = cleanString(query, 100);
  if (q.length < 2) {
    return { configured: Boolean(YOUTUBE_API_KEY), tracks: [] };
  }

  if (!YOUTUBE_API_KEY) {
    return {
      configured: false,
      tracks: [],
      message: "Add YOUTUBE_API_KEY to Backend/.env to enable YouTube music search."
    };
  }

  const url = new URL(YOUTUBE_SEARCH_ENDPOINT);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("videoCategoryId", "10");
  url.searchParams.set("maxResults", "8");
  url.searchParams.set("safeSearch", "none");
  url.searchParams.set("q", q);
  url.searchParams.set("key", YOUTUBE_API_KEY);

  const data = await fetchJsonWithTimeout(url);
  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    configured: true,
    tracks: items
      .map((item) => {
        const youtubeId = cleanString(item?.id?.videoId, 80).replace(/[^a-zA-Z0-9_-]/g, "");
        const snippet = item?.snippet || {};
        if (!youtubeId) return null;
        return {
          source: "youtube",
          id: `youtube-${youtubeId}`,
          youtubeId,
          title: cleanString(snippet.title, 100),
          artist: cleanString(snippet.channelTitle, 100),
          thumbnail: cleanString(
            snippet.thumbnails?.default?.url ||
              snippet.thumbnails?.medium?.url ||
              snippet.thumbnails?.high?.url,
            500
          )
        };
      })
      .filter((track) => track?.title)
  };
}

function validateAuth(body, signup = false) {
  const email = cleanString(body.email, 254).toLowerCase();
  const password = String(body.password ?? "");
  const fullName = cleanString(body.fullName, 80);
  const birthDate = cleanString(body.birthDate, 40);
  const calculatedAge = ageFromBirthDate(birthDate);

  if (!email || !password || (signup && !fullName)) {
    throw Object.assign(new Error("Complete all required fields."), { status: 400 });
  }
  if (!email.includes("@")) {
    throw Object.assign(new Error("Use a valid email address."), { status: 400 });
  }
  if (signup && password.length < 6) {
    throw Object.assign(new Error("Password must be at least 6 characters."), { status: 400 });
  }
  if (signup && calculatedAge !== null && calculatedAge < 18) {
    throw Object.assign(new Error("You must be at least 18 years old to sign up."), { status: 400 });
  }

  return {
    email,
    password,
    fullName,
    age: Math.max(18, Math.min(99, Number(calculatedAge ?? body.age) || 18)),
    birthDate,
    gender: cleanString(body.gender, 30),
    interestedIn: cleanString(body.interestedIn, 30)
  };
}

function emitUserState(userId, state) {
  if (!io || !userId || !state) return;
  io.to(`user:${userId}`).emit("state:update", { state });
}

function emitResultStates(result) {
  emitUserState(result.senderId, result.senderState);
  emitUserState(result.recipientId, result.recipientState);
}

function emitActivityEvents(events = []) {
  for (const event of events) {
    emitUserState(event.userId, event.state);
  }
}

function emitPresence(userId, online, lastActiveAt = Date.now()) {
  if (!io || !userId) return;
  io.emit("presence:update", { userId, online, lastActiveAt });
}

function emitFeedRefresh() {
  if (!io) return;
  io.emit("feed:update");
}

function syncOnlineUsers() {
  db.setOnlineUserIds(onlineUsers.keys());
}

function trackOnline(userId) {
  const count = (onlineUsers.get(userId) || 0) + 1;
  onlineUsers.set(userId, count);
  syncOnlineUsers();
  return count;
}

function trackOffline(userId) {
  const count = Math.max(0, (onlineUsers.get(userId) || 0) - 1);
  if (count === 0) onlineUsers.delete(userId);
  else onlineUsers.set(userId, count);
  syncOnlineUsers();
  return count;
}

async function updatePresencePreference(userId, showOnline) {
  if (!io || !userId) return;

  let count = 0;
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.userId !== userId) continue;
    socket.data.showOnline = showOnline;
    if (showOnline) count += 1;
  }

  if (count > 0) onlineUsers.set(userId, count);
  else onlineUsers.delete(userId);
  syncOnlineUsers();
  const lastActiveAt = count > 0 ? Date.now() : await db.markLastActive(userId);
  emitPresence(userId, count > 0, lastActiveAt);
}

function cleanStringList(value, maxItems = 8, maxLength = 200) {
  return Array.isArray(value)
    ? value.map((item) => cleanString(item, maxLength)).filter(Boolean).slice(0, maxItems)
    : undefined;
}

function cleanTagList(value, maxItems = 8) {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((item) =>
              cleanString(item, 32)
                .replace(/^#+/, "")
                .replace(/[^a-zA-Z0-9_-]/g, "")
                .toLowerCase()
            )
            .filter(Boolean)
        )
      ).slice(0, maxItems)
    : [];
}

function sanitizePrivacy(body) {
  const allowedScopes = new Set(["Nearby", "City only", "Hidden"]);
  const updates = {};
  for (const key of ["discoverable", "showDistance", "showOnline", "readReceipts", "incognito"]) {
    if (body[key] !== undefined) updates[key] = Boolean(body[key]);
  }
  if (body.locationScope !== undefined) {
    const scope = cleanString(body.locationScope, 30);
    updates.locationScope = allowedScopes.has(scope) ? scope : "Nearby";
  }
  return updates;
}

function sanitizeStoryMusic(value) {
  if (!value || typeof value !== "object") return null;

  const requestedSource = cleanString(value.source, 20);
  const source = ["synth", "upload", "youtube"].includes(requestedSource) ? requestedSource : "synth";
  const id = cleanString(value.id, 80).replace(/[^a-zA-Z0-9_-]/g, "");
  const title = cleanString(value.title, 80);
  const artist = cleanString(value.artist, 80);
  const startAt = Math.max(0, Math.min(60 * 60 * 6, Number(value.startAt) || 0));
  const duration = 60;
  if (!id || !title) return null;

  if (source === "upload") {
    const rawSrc = String(value.src ?? "");
    if (rawSrc.length > POST_MEDIA_MAX_CHARS) return null;
    const src = cleanString(rawSrc, POST_MEDIA_MAX_CHARS);
    const mime = cleanString(value.mime, 120);
    if (!src.startsWith("data:audio/")) return null;
    return { source, id, title, artist, src, mime, startAt, duration };
  }

  if (source === "youtube") {
    const youtubeId = cleanString(value.youtubeId, 80).replace(/[^a-zA-Z0-9_-]/g, "");
    const thumbnail = cleanString(value.thumbnail, 500);
    if (!youtubeId) return null;
    return { source, id, title, artist, youtubeId, thumbnail, startAt, duration };
  }

  return { source: "synth", id, title, artist, startAt, duration };
}

async function sendMessage(user, body) {
  const profileId = cleanString(body.profileId, 80);
  const type = ["image", "video", "audio"].includes(body.type) ? body.type : "text";
  const text = cleanString(body.text, type === "text" ? 1000 : 240);
  const media = cleanString(body.media, 18_000_000);
  const name = cleanString(body.name, 180);
  const mime = cleanString(body.mime, 120);
  const messageId = cleanString(body.messageId, 120);
  const mediaPrefix = type === "image" ? "data:image/" : type === "video" ? "data:video/" : "data:audio/";

  if (!profileId || (type === "text" && !text) || (type !== "text" && !media.startsWith(mediaPrefix))) {
    const error = new Error(type === "text" ? "Message text is required." : "Choose a valid media file.");
    error.status = 400;
    throw error;
  }

  const result = await db.sendMessage(user, { profileId, text, messageId, type, media, name, mime });
  emitResultStates(result);
  return result.senderState;
}

async function markConversationRead(user, body) {
  const profileId = cleanString(body.profileId, 80);
  if (!profileId) {
    const error = new Error("Choose a conversation to mark as read.");
    error.status = 400;
    throw error;
  }

  const result = await db.markConversationRead(user, profileId);
  emitResultStates(result);
  return result.senderState;
}

async function reactToMessage(user, body) {
  const profileId = cleanString(body.profileId, 80);
  const messageId = cleanString(body.messageId, 120);
  const reaction = cleanString(body.reaction, 16);
  if (!profileId || !messageId) {
    const error = new Error("Choose a message to react to.");
    error.status = 400;
    throw error;
  }

  const result = await db.reactToMessage(user, { profileId, messageId, reaction });
  emitResultStates(result);
  return result.senderState;
}

async function unsendMessage(user, body) {
  const profileId = cleanString(body.profileId, 80);
  const messageId = cleanString(body.messageId, 120);
  if (!profileId || !messageId) {
    const error = new Error("Choose a message to unsend.");
    error.status = 400;
    throw error;
  }

  const result = await db.unsendMessage(user, { profileId, messageId });
  emitResultStates(result);
  return result.senderState;
}

async function removeMessageForYou(user, body) {
  const profileId = cleanString(body.profileId, 80);
  const messageId = cleanString(body.messageId, 120);
  if (!profileId || !messageId) {
    const error = new Error("Choose a message to remove.");
    error.status = 400;
    throw error;
  }

  const state = await db.removeMessageForUser(user, { profileId, messageId });
  emitUserState(user.id, state);
  return state;
}

async function archiveConversation(user, body) {
  const profileId = cleanString(body.profileId, 80);
  if (!profileId) {
    const error = new Error("Choose a conversation to archive.");
    error.status = 400;
    throw error;
  }

  const state = await db.archiveConversation(user, { profileId, archived: body.archived !== false });
  emitUserState(user.id, state);
  return state;
}

async function deleteConversation(user, body) {
  const profileId = cleanString(body.profileId, 80);
  if (!profileId) {
    const error = new Error("Choose a conversation to delete.");
    error.status = 400;
    throw error;
  }

  const state = await db.deleteConversation(user, { profileId });
  emitUserState(user.id, state);
  return state;
}

async function blockUser(user, body) {
  const profileId = cleanString(body.profileId, 80);
  if (!profileId) {
    const error = new Error("Choose a user to block.");
    error.status = 400;
    throw error;
  }

  const result = await db.blockUser(user, { profileId });
  emitResultStates(result);
  return result.senderState;
}

async function createPost(user, body) {
  const type = ["image", "video"].includes(body.type) ? body.type : "text";
  const text = cleanString(body.text, 1200);
  const rawMedia = String(body.media ?? "");
  const media = cleanString(rawMedia, POST_MEDIA_MAX_CHARS);
  const name = cleanString(body.name, 180);
  const mime = cleanString(body.mime, 120);
  const tags = cleanTagList(body.tags);
  const mediaPrefix = type === "image" ? "data:image/" : "data:video/";

  if (rawMedia.length > POST_MEDIA_MAX_CHARS) {
    const error = new Error("Media file is too large. Choose an image or video under 10MB.");
    error.status = 413;
    throw error;
  }

  if ((type === "text" && !text) || (type !== "text" && !media.startsWith(mediaPrefix))) {
    const error = new Error(type === "text" ? "Write something to post." : "Choose a valid media file.");
    error.status = 400;
    throw error;
  }

  const result = await db.createPost(user, { text, type, media, name, mime, tags });
  emitActivityEvents(result.events);
  emitFeedRefresh();
  return result.state;
}

async function updatePost(user, body) {
  const postId = cleanString(body.postId, 120);
  if (!postId) {
    const error = new Error("Choose a post to edit.");
    error.status = 400;
    throw error;
  }

  const text = body.text === undefined ? undefined : cleanString(body.text, 1200);
  const tags = body.tags === undefined ? undefined : cleanTagList(body.tags);

  const result = await db.updatePost(user, { postId, text, tags });
  emitFeedRefresh();
  return result.state;
}

async function deletePost(user, body) {
  const postId = cleanString(body.postId, 120);
  if (!postId) {
    const error = new Error("Choose a post to delete.");
    error.status = 400;
    throw error;
  }

  const result = await db.deletePost(user, { postId });
  emitFeedRefresh();
  return result.state;
}

async function createStory(user, body) {
  const type = ["image", "video"].includes(body.type) ? body.type : "text";
  const text = cleanString(body.text, 280);
  const rawMedia = String(body.media ?? "");
  const media = cleanString(rawMedia, POST_MEDIA_MAX_CHARS);
  const name = cleanString(body.name, 180);
  const mime = cleanString(body.mime, 120);
  const music = sanitizeStoryMusic(body.music);
  const mediaPrefix = type === "image" ? "data:image/" : "data:video/";
  const hasMusic = Boolean(music);

  if (rawMedia.length > POST_MEDIA_MAX_CHARS) {
    const error = new Error("Story media is too large. Choose an image or video under 10MB.");
    error.status = 413;
    throw error;
  }

  if ((type === "text" && !text && !hasMusic) || (type !== "text" && !media.startsWith(mediaPrefix))) {
    const error = new Error(type === "text" ? "Write something for your story." : "Choose a valid story file.");
    error.status = 400;
    throw error;
  }

  return db.createStory(user, { type, text, media, name, mime, music });
}

async function reactToStory(user, body) {
  const profileId = cleanString(body.profileId, 80) || user.id;
  const storyId = cleanString(body.storyId, 120);
  const reaction = cleanString(body.reaction, 30);
  if (!storyId) {
    const error = new Error("Choose a story to react to.");
    error.status = 400;
    throw error;
  }
  if (reaction && !POST_REACTIONS.has(reaction)) {
    const error = new Error("Choose a supported reaction.");
    error.status = 400;
    throw error;
  }

  const result = await db.reactToStory(user, { profileId, storyId, reaction });
  emitActivityEvents(result.viewerStates);
  return result.state;
}

async function viewStory(user, body) {
  const profileId = cleanString(body.profileId, 80);
  const storyId = cleanString(body.storyId, 120);
  if (!profileId || !storyId) {
    const error = new Error("Choose a story to view.");
    error.status = 400;
    throw error;
  }

  const result = await db.viewStory(user, { profileId, storyId });
  emitActivityEvents(result.viewerStates);
  return result.state;
}

async function replyToStory(user, body) {
  const profileId = cleanString(body.profileId, 80);
  const storyId = cleanString(body.storyId, 120);
  const text = cleanString(body.text, 240);
  if (!profileId || !storyId || !text) {
    const error = new Error("Write a reply to send.");
    error.status = 400;
    throw error;
  }

  const result = await db.replyToStory(user, { profileId, storyId, text });
  emitActivityEvents(result.viewerStates);
  return result.state;
}

async function reactToPost(user, body) {
  const postId = cleanString(body.postId, 120);
  const reaction = cleanString(body.reaction, 30);
  if (!postId) {
    const error = new Error("Choose a post to react to.");
    error.status = 400;
    throw error;
  }
  if (reaction && !POST_REACTIONS.has(reaction)) {
    const error = new Error("Choose a supported reaction.");
    error.status = 400;
    throw error;
  }

  const result = await db.reactToPost(user, { postId, reaction });
  emitActivityEvents(result.events);
  emitFeedRefresh();
  return result.state;
}

async function commentOnPost(user, body) {
  const postId = cleanString(body.postId, 120);
  const parentCommentId = cleanString(body.parentCommentId, 120);
  const text = cleanString(body.text, 600);
  if (!postId || !text) {
    const error = new Error("Comment text is required.");
    error.status = 400;
    throw error;
  }

  const result = await db.commentOnPost(user, { postId, text, parentCommentId });
  emitActivityEvents(result.events);
  emitFeedRefresh();
  return result.state;
}

async function reactToComment(user, body) {
  const postId = cleanString(body.postId, 120);
  const commentId = cleanString(body.commentId, 120);
  const parentCommentId = cleanString(body.parentCommentId, 120);
  const reaction = cleanString(body.reaction, 30);
  if (!postId || !commentId) {
    const error = new Error("Choose a comment to react to.");
    error.status = 400;
    throw error;
  }
  if (reaction && !POST_REACTIONS.has(reaction)) {
    const error = new Error("Choose a supported reaction.");
    error.status = 400;
    throw error;
  }

  const result = await db.reactToComment(user, { postId, commentId, parentCommentId, reaction });
  emitActivityEvents(result.events);
  emitFeedRefresh();
  return result.state;
}

async function sharePost(user, body) {
  const postId = cleanString(body.postId, 120);
  if (!postId) {
    const error = new Error("Choose a post to share.");
    error.status = 400;
    throw error;
  }

  const result = await db.sharePost(user, { postId });
  emitActivityEvents(result.events);
  emitFeedRefresh();
  return result.state;
}

async function markActivityEventsRead(user) {
  const state = await db.markActivityEventsRead(user);
  emitUserState(user.id, state);
  return state;
}

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, jsonHeaders);
    res.end();
    return;
  }

  const pathname = normalizeRoutePath(url.pathname);

  if (pathname === "/api/health" && req.method === "GET") {
    sendJson(res, 200, {
      ok: dbReady,
      service: "flame-api",
      storage: db.storageMode,
      database: db.dbName,
      usersCollection: `${db.dbName}.users`,
      databaseReady: dbReady,
      databaseError: dbReady ? "" : dbInitError?.message || "MongoDB is connecting.",
      time: new Date().toISOString()
    });
    return;
  }

  if (!dbReady) {
    sendJson(res, 503, {
      ok: false,
      error: "MongoDB is still connecting. Please try again in a moment.",
      storage: "mongo",
      retryAfter: 5
    });
    return;
  }

  const body = ["POST", "PATCH", "PUT", "DELETE"].includes(req.method) ? await parseBody(req) : {};

  if (pathname === "/api/auth/login" && req.method === "POST") {
    const credentials = validateAuth(body);
    const result = await db.login(credentials.email, credentials.password);
    if (!result) return sendError(res, 401, "Email or password does not match.");
    sendJson(res, 200, { ok: true, ...result });
    return;
  }

  if (pathname === "/api/auth/signup" && req.method === "POST") {
    const result = await db.signup(validateAuth(body, true));
    sendJson(res, 201, { ok: true, ...result });
    return;
  }

  if (pathname === "/api/auth/logout" && req.method === "POST") {
    const token = tokenFrom(req);
    if (token) await db.deleteSession(token);
    sendJson(res, 200, { ok: true });
    return;
  }

  const { user } = await requireUser(req);

  if (pathname === "/api/session" && req.method === "GET") {
    sendJson(res, 200, { ok: true, state: await db.publicState(user) });
    return;
  }

  if (pathname === "/api/feed" && req.method === "GET") {
    sendJson(res, 200, { ok: true, feed: await db.publicFeed(user.id) });
    return;
  }

  if (pathname === "/api/music/search" && req.method === "GET") {
    const result = await searchYouTubeMusic(url.searchParams.get("q"));
    sendJson(res, 200, { ok: true, provider: "youtube", ...result });
    return;
  }

  if (pathname === "/api/calls/token" && req.method === "POST") {
    const livekit = await createLiveKitCallToken(user, body);
    sendJson(res, 200, { ok: true, livekit });
    return;
  }

  if (pathname === "/api/theme" && req.method === "PATCH") {
    const state = await db.patchState(user, (current) => ({ ...current, light: Boolean(body.light) }));
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (pathname === "/api/profile" && req.method === "PATCH") {
    const media = cleanStringList(body.media, 9, 1_500_000);
    const updates = {
      fullName: body.fullName === undefined ? undefined : cleanString(body.fullName, 80),
      location: body.location === undefined ? undefined : cleanString(body.location, 120),
      bio: body.bio === undefined ? undefined : cleanString(body.bio, 1000),
      image: body.image === undefined ? undefined : cleanString(body.image, 1_500_000),
      background: body.background === undefined ? undefined : cleanString(body.background, 1_500_000),
      media,
      age: body.age === undefined ? undefined : Math.max(18, Math.min(99, Number(body.age) || 18)),
      birthDate: body.birthDate === undefined ? undefined : cleanString(body.birthDate, 40),
      gender: body.gender === undefined ? undefined : cleanString(body.gender, 30),
      interestedIn: body.interestedIn === undefined ? undefined : cleanString(body.interestedIn, 30),
      interests: body.interests === undefined ? undefined : cleanStringList(body.interests, 12, 32),
      zodiacSign: body.zodiacSign === undefined ? undefined : cleanString(body.zodiacSign, 30),
      onboardingCompleted: body.onboardingCompleted === undefined ? undefined : Boolean(body.onboardingCompleted),
      work: body.work === undefined ? undefined : cleanString(body.work, 120),
      school: body.school === undefined ? undefined : cleanString(body.school, 120)
    };
    Object.keys(updates).forEach((key) => updates[key] === undefined && delete updates[key]);
    const state = await db.patchState(user, (current) => ({ ...current, user: { ...current.user, ...updates } }));
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (pathname === "/api/privacy" && req.method === "PATCH") {
    const updates = sanitizePrivacy(body);
    const state = await db.patchState(user, (current) => ({
      ...current,
      privacy: { ...current.privacy, ...updates }
    }));
    if (updates.showOnline !== undefined) await updatePresencePreference(user.id, updates.showOnline);
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (pathname === "/api/swipes" && req.method === "POST") {
    const profileId = cleanString(body.profileId, 80);
    const action = cleanString(body.action, 20);
    if (!profileId || !["like", "pass", "super"].includes(action)) {
      return sendError(res, 400, "Choose a profile and swipe action.");
    }

    const result = await db.recordSwipe(user, { profileId, action });
    emitResultStates(result);
    sendJson(res, 200, { ok: true, matched: result.matched, state: result.senderState });
    return;
  }

  if (pathname === "/api/matches" && req.method === "POST") {
    const profileId = cleanString(body.profileId, 80);
    if (!profileId) return sendError(res, 400, "Choose a profile to match.");
    const result = await db.createMatch(user, profileId);
    emitResultStates(result);
    sendJson(res, 201, { ok: true, state: result.senderState });
    return;
  }

  if (pathname === "/api/messages" && req.method === "POST") {
    const state = await sendMessage(user, body);
    sendJson(res, 201, { ok: true, state });
    return;
  }

  if (pathname === "/api/messages/read" && req.method === "POST") {
    const state = await markConversationRead(user, body);
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (pathname === "/api/messages/reactions" && req.method === "POST") {
    const state = await reactToMessage(user, body);
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (pathname === "/api/messages/unsend" && req.method === "POST") {
    const state = await unsendMessage(user, body);
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (pathname === "/api/messages/remove-for-you" && req.method === "POST") {
    const state = await removeMessageForYou(user, body);
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (pathname === "/api/messages/pins" && req.method === "POST") {
    const profileId = cleanString(body.profileId, 80);
    const messageId = cleanString(body.messageId, 120);
    if (!profileId || !messageId) {
      return sendError(res, 400, "Choose a message to pin.");
    }

    const state = await db.togglePinnedMessage(user, {
      profileId,
      messageId,
      pinned: body.pinned !== false
    });
    emitUserState(user.id, state);
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (pathname === "/api/messages/archive" && req.method === "POST") {
    const state = await archiveConversation(user, body);
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (pathname === "/api/messages/delete-conversation" && req.method === "POST") {
    const state = await deleteConversation(user, body);
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (pathname === "/api/blocks" && req.method === "POST") {
    const state = await blockUser(user, body);
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (pathname === "/api/stories" && req.method === "POST") {
    const result = await createStory(user, body);
    emitActivityEvents(result.viewerStates);
    sendJson(res, 201, { ok: true, state: result.state });
    return;
  }

  if (pathname === "/api/stories/reactions" && req.method === "POST") {
    const state = await reactToStory(user, body);
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (pathname === "/api/stories/views" && req.method === "POST") {
    const state = await viewStory(user, body);
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (pathname === "/api/stories/replies" && req.method === "POST") {
    const state = await replyToStory(user, body);
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (pathname === "/api/stories" && req.method === "DELETE") {
    const result = await db.deleteStory(user, cleanString(body.storyId, 120));
    emitActivityEvents(result.viewerStates);
    sendJson(res, 200, { ok: true, state: result.state });
    return;
  }

  if (pathname === "/api/posts" && req.method === "POST") {
    const state = await createPost(user, body);
    sendJson(res, 201, { ok: true, state });
    return;
  }

  if (pathname === "/api/posts" && req.method === "PATCH") {
    const state = await updatePost(user, body);
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (pathname === "/api/posts" && req.method === "DELETE") {
    const state = await deletePost(user, body);
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (pathname === "/api/posts/reactions" && req.method === "POST") {
    const state = await reactToPost(user, body);
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (pathname === "/api/posts/comments" && req.method === "POST") {
    const state = await commentOnPost(user, body);
    sendJson(res, 201, { ok: true, state });
    return;
  }

  if (pathname === "/api/posts/comments/reactions" && req.method === "POST") {
    const state = await reactToComment(user, body);
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (pathname === "/api/posts/share" && req.method === "POST") {
    const state = await sharePost(user, body);
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (pathname === "/api/events/read" && req.method === "POST") {
    const state = await markActivityEventsRead(user);
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (pathname === "/api/boost" && req.method === "POST") {
    const durationMs = Math.max(10_000, Math.min(30 * 60_000, Number(body.durationMs) || 20_000));
    const state = await db.patchState(user, (current) => ({
      ...current,
      boostUntil: Math.max(Date.now(), Number(current.boostUntil) || 0) + durationMs
    }));
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (pathname === "/api/support-tickets" && req.method === "GET") {
    sendJson(res, 200, { ok: true, tickets: await db.listTickets(user) });
    return;
  }

  if (pathname === "/api/support-tickets" && req.method === "POST") {
    const subject = cleanString(body.subject, 120);
    const message = cleanString(body.message, 2000);
    if (!subject || !message) return sendError(res, 400, "Subject and message are required.");
    const ticket = await db.createTicket(user, { subject, message });
    sendJson(res, 201, { ok: true, ticket });
    return;
  }

  sendError(res, 404, "API route not found.");
}

function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = normalize(join(CLIENT_DIST, requested));
  const clientDistRoot = CLIENT_DIST.endsWith(sep) ? CLIENT_DIST : `${CLIENT_DIST}${sep}`;
  if ((filePath !== CLIENT_DIST && !filePath.startsWith(clientDistRoot)) || !existsSync(filePath)) {
    const fallback = join(CLIENT_DIST, "index.html");
    if (!existsSync(fallback)) return sendError(res, 404, "Build the frontend with npm run build first.");
    res.writeHead(200, { "Content-Type": mime[".html"] });
    createReadStream(fallback).pipe(res);
    return;
  }

  res.writeHead(200, { "Content-Type": mime[extname(filePath)] || "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

export async function ensureDatabaseReady() {
  if (dbReady) return true;

  if (!dbInitPromise) {
    dbInitError = null;
    dbInitPromise = db
      .init()
      .then(() => {
        dbReady = true;
        dbInitError = null;
        return true;
      })
      .catch((error) => {
        dbReady = false;
        dbInitError = error;
        dbInitPromise = null;
        console.error(`MongoDB connection failed: ${error.message}`);
        return false;
      });
  }

  return dbInitPromise;
}

export async function handleRequest(req, res, options = {}) {
  try {
    if (options.initializeDatabase) await ensureDatabaseReady();

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = normalizeRoutePath(url.pathname);
    if (pathname.startsWith("/api/")) {
      url.pathname = pathname;
      await handleApi(req, res, url);
      return;
    }

    if (options.serveClient !== false) {
      serveStatic(req, res, url);
      return;
    }

    sendError(res, 404, "API route not found.");
  } catch (error) {
    sendError(res, error.status || 500, error.message || "Server error.");
  }
}

const server = createServer(async (req, res) => {
  await handleRequest(req, res);
});

function setupRealtime() {
  io = new SocketIOServer(server, {
    maxHttpBufferSize: 25_000_000,
    cors: {
      origin: CORS_ORIGIN,
      methods: ["GET", "POST"]
    }
  });

  io.use(async (socket, next) => {
    try {
      if (!dbReady) return next(new Error("MongoDB is still connecting. Please try again in a moment."));
      const authToken = socket.handshake.auth?.token || "";
      const header = socket.handshake.headers.authorization || "";
      const token = authToken || (header.startsWith("Bearer ") ? header.slice(7) : "");
      const user = token ? await db.findUserBySession(token) : null;

      if (!user) return next(new Error("Please log in again."));
      socket.data.token = token;
      socket.data.userId = user.id;
      socket.data.showOnline = user.state.privacy.showOnline !== false;
      return next();
    } catch (error) {
      return next(error);
    }
  });

  io.on("connection", async (socket) => {
    socket.join(`user:${socket.data.userId}`);
    if (socket.data.showOnline && trackOnline(socket.data.userId) === 1) {
      emitPresence(socket.data.userId, true, Date.now());
    }

    socket.on("message:send", async (payload, acknowledge) => {
      try {
        const user = await db.findUserBySession(socket.data.token);
        if (!user) throw Object.assign(new Error("Please log in again."), { status: 401 });

        const state = await sendMessage(user, payload || {});
        if (typeof acknowledge === "function") acknowledge({ ok: true, state });
      } catch (error) {
        if (typeof acknowledge === "function") {
          acknowledge({ ok: false, error: error.message || "Message failed." });
        }
      }
    });

    socket.on("conversation:read", async (payload, acknowledge) => {
      try {
        const user = await db.findUserBySession(socket.data.token);
        if (!user) throw Object.assign(new Error("Please log in again."), { status: 401 });

        const state = await markConversationRead(user, payload || {});
        if (typeof acknowledge === "function") acknowledge({ ok: true, state });
      } catch (error) {
        if (typeof acknowledge === "function") {
          acknowledge({ ok: false, error: error.message || "Read receipt failed." });
        }
      }
    });

    socket.on("message:react", async (payload, acknowledge) => {
      try {
        const user = await db.findUserBySession(socket.data.token);
        if (!user) throw Object.assign(new Error("Please log in again."), { status: 401 });

        const state = await reactToMessage(user, payload || {});
        if (typeof acknowledge === "function") acknowledge({ ok: true, state });
      } catch (error) {
        if (typeof acknowledge === "function") {
          acknowledge({ ok: false, error: error.message || "Reaction failed." });
        }
      }
    });

    socket.on("post:react", async (payload, acknowledge) => {
      try {
        const user = await db.findUserBySession(socket.data.token);
        if (!user) throw Object.assign(new Error("Please log in again."), { status: 401 });

        const state = await reactToPost(user, payload || {});
        if (typeof acknowledge === "function") acknowledge({ ok: true, state });
      } catch (error) {
        if (typeof acknowledge === "function") {
          acknowledge({ ok: false, error: error.message || "Reaction failed." });
        }
      }
    });

    socket.on("message:unsend", async (payload, acknowledge) => {
      try {
        const user = await db.findUserBySession(socket.data.token);
        if (!user) throw Object.assign(new Error("Please log in again."), { status: 401 });

        const state = await unsendMessage(user, payload || {});
        if (typeof acknowledge === "function") acknowledge({ ok: true, state });
      } catch (error) {
        if (typeof acknowledge === "function") {
          acknowledge({ ok: false, error: error.message || "Unsend failed." });
        }
      }
    });

    socket.on("message:remove-for-you", async (payload, acknowledge) => {
      try {
        const user = await db.findUserBySession(socket.data.token);
        if (!user) throw Object.assign(new Error("Please log in again."), { status: 401 });

        const state = await removeMessageForYou(user, payload || {});
        if (typeof acknowledge === "function") acknowledge({ ok: true, state });
      } catch (error) {
        if (typeof acknowledge === "function") {
          acknowledge({ ok: false, error: error.message || "Remove failed." });
        }
      }
    });

    socket.on("typing:update", async (payload) => {
      try {
        const profileId = cleanString(payload?.profileId, 80);
        if (!profileId) return;

        const user = await db.findUserBySession(socket.data.token);
        if (!user) return;

        io.to(`user:${profileId}`).emit("typing:update", {
          profileId: user.id,
          typing: Boolean(payload?.typing)
        });
      } catch {
        // Typing indicators are transient; dropped events should not interrupt chat.
        
      }
    });

    socket.on("call:signal", async (payload, acknowledge) => {
      try {
        const user = await db.findUserBySession(socket.data.token);
        if (!user) throw Object.assign(new Error("Please log in again."), { status: 401 });

        const profileId = cleanString(payload?.profileId, 80);
        const callId = cleanString(payload?.callId, 140);
        const kind = cleanString(payload?.kind, 30);
        if (!profileId || !callId || !kind) {
          throw Object.assign(new Error("Call signal is incomplete."), { status: 400 });
        }

        const targetRoom = io.sockets.adapter.rooms.get(`user:${profileId}`);
        if (kind === "invite" && (!targetRoom || targetRoom.size === 0)) {
          throw Object.assign(new Error("This user is not online for calls."), { status: 409 });
        }

        const profile = user.state?.user || {};
        const displayName = cleanString(profile.fullName, 80).split(/\s+/)[0] || cleanString(user.email, 80).split("@")[0] || "Flame user";
        io.to(`user:${profileId}`).emit("call:signal", {
          ...(payload || {}),
          profileId: user.id,
          from: user.id,
          fromName: displayName,
          fromImage: profile.image || "/flame-logo.gif",
          sentAt: Date.now()
        });
        if (typeof acknowledge === "function") acknowledge({ ok: true });
      } catch (error) {
        if (typeof acknowledge === "function") {
          acknowledge({ ok: false, error: error.message || "Call signal failed." });
        }
      }
    });

    socket.on("presence:ping", async (acknowledge) => {
      try {
        const lastActiveAt = await db.markLastActive(socket.data.userId);
        if (socket.data.showOnline) emitPresence(socket.data.userId, true, Date.now());
        if (typeof acknowledge === "function") acknowledge({ ok: true, lastActiveAt });
      } catch {
        if (typeof acknowledge === "function") acknowledge({ ok: false });
      }
    });

    socket.on("disconnect", async () => {
      if (socket.data.showOnline && trackOffline(socket.data.userId) === 0) {
        try {
          const lastActiveAt = await db.markLastActive(socket.data.userId);
          emitPresence(socket.data.userId, false, lastActiveAt);
        } catch {
          emitPresence(socket.data.userId, false, Date.now());
        }
      }
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectDatabaseWithRetry() {
  let attempt = 0;
  while (!dbReady) {
    attempt += 1;
    try {
      dbInitError = null;
      console.log(`Connecting to MongoDB (${db.dbName}), attempt ${attempt}...`);
      await db.init();
      dbReady = true;
      dbInitError = null;
      console.log(`Connected to MongoDB database "${db.dbName}".`);
    } catch (error) {
      dbReady = false;
      dbInitError = error;
      console.error(`MongoDB connection failed: ${error.message}`);
      console.error("Retrying MongoDB connection in 10 seconds...");
      await sleep(10000);
    }
  }
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  setupRealtime();
  server.on("error", (error) => {
    if (error?.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is already in use. Another Flame backend is already running on this port.`);
      console.error("Stop the existing backend process before starting a new one, or set a different PORT in Backend/.env.");
      process.exit(1);
    }

    console.error("Flame server error:", error);
    process.exit(1);
  });

  server.listen(PORT, () => {
    console.log(`Flame website, API, and realtime messaging running on http://localhost:${PORT}`);
  });
  connectDatabaseWithRetry();
}
