import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

const DEFAULT_MONGODB_URI = "mongodb://127.0.0.1:27017";
const DEFAULT_PROFILE_IMAGE = "/flame-logo-optimized.png";
const REMOVED_BOT_IDS = new Set([
  "jessica",
  "emma",
  "sophia",
  "liam"
]);
const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const STORY_MUSIC_SRC_MAX_CHARS = 14_000_000;
const ROOM_REACTIONS = new Set(["heart", "laugh", "wow", "clap", "sad", "fire"]);
const SERVER_DIR = dirname(fileURLToPath(import.meta.url));

const defaultState = {
  light: false,
  likedIds: [],
  passedIds: [],
  blockedIds: [],
  matches: [],
  stories: [],
  boostUntil: 0,
  privacy: {
    discoverable: true,
    showDistance: true,
    showOnline: true,
    readReceipts: true,
    incognito: false,
    locationScope: "Nearby"
  },
  user: {
    fullName: "",
    age: 18,
    location: "Nearby",
    bio: "",
    image: DEFAULT_PROFILE_IMAGE,
    background: "",
    media: [DEFAULT_PROFILE_IMAGE],
    birthDate: "",
    gender: "",
    interestedIn: "",
    interests: [],
    zodiacSign: "",
    onboardingCompleted: false,
    work: "",
    school: ""
  },
  events: []
};

const PRESENTATION_USERS = [
  {
    id: "demo-maya-santos",
    email: "maya.santos@flame.demo",
    fullName: "Maya Santos",
    age: 22,
    birthDate: "2004-04-12",
    gender: "Woman",
    interestedIn: "Everyone",
    location: "Quezon City, Philippines",
    bio: "Cafe hopping, study playlists, and spontaneous weekend plans.",
    image: "/demo-maya.jpg",
    interests: ["Coffee", "Music", "Travel", "Photography"],
    zodiacSign: "Aries",
    work: "Student creator",
    school: "University of the Philippines",
    lastActiveMinutes: 2
  },
  {
    id: "demo-anton-reyes",
    email: "anton.reyes@flame.demo",
    fullName: "Anton Reyes",
    age: 24,
    birthDate: "2002-09-18",
    gender: "Man",
    interestedIn: "Women",
    location: "Makati, Philippines",
    bio: "Gym after work, ramen nights, and always down for a good movie.",
    image: "/demo-anton.jpg",
    interests: ["Fitness", "Movies", "Food", "Gaming"],
    zodiacSign: "Virgo",
    work: "Junior designer",
    school: "Mapua University",
    lastActiveMinutes: 8
  },
  {
    id: "demo-sophia-cruz",
    email: "sophia.cruz@flame.demo",
    fullName: "Sophia Cruz",
    age: 23,
    birthDate: "2003-01-26",
    gender: "Woman",
    interestedIn: "Men",
    location: "Taguig, Philippines",
    bio: "Loves books, city walks, and playlists that feel like sunset.",
    image: "/demo-sophia.jpg",
    interests: ["Books", "Music", "Fashion", "Travel"],
    zodiacSign: "Aquarius",
    work: "Marketing assistant",
    school: "De La Salle University",
    lastActiveMinutes: 16
  },
  {
    id: "demo-jessica-lim",
    email: "jessica.lim@flame.demo",
    fullName: "Jessica Lim",
    age: 25,
    birthDate: "2001-07-08",
    gender: "Woman",
    interestedIn: "Everyone",
    location: "Manila, Philippines",
    bio: "Trying every dessert spot in the city and taking too many photos.",
    image: "/demo-jessica.jpg",
    interests: ["Food", "Photography", "Movies", "Anime"],
    zodiacSign: "Cancer",
    work: "Content strategist",
    school: "UST",
    lastActiveMinutes: 31
  }
];

const PUBLIC_USER_PROJECTION = {
  _id: 0,
  id: 1,
  email: 1,
  joinedAt: 1,
  lastLoginAt: 1,
  lastActiveAt: 1,
  "state.user.fullName": 1,
  "state.user.age": 1,
  "state.user.location": 1,
  "state.user.bio": 1,
  "state.user.image": 1,
  "state.user.background": 1,
  "state.user.gender": 1,
  "state.user.interestedIn": 1,
  "state.user.interests": 1,
  "state.user.zodiacSign": 1,
  "state.user.work": 1,
  "state.user.school": 1,
  "state.privacy": 1,
  "state.likedIds": 1,
  "state.blockedIds": 1,
  "state.stories": 1
};
const USER_WITHOUT_MATCH_PROFILE_PROJECTION = {
  "state.matches.profile": 0
};

function passwordHash(password, salt = randomUUID()) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;

  const actual = Buffer.from(hash, "hex");
  const expected = scryptSync(password, salt, 64);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withoutMongoId(document) {
  if (!document || typeof document !== "object") return document;
  const { _id, ...rest } = document;
  return rest;
}

function conversationIdFor(userId, profileId) {
  return [String(userId || ""), String(profileId || "")].sort().join(":");
}

function parseBirthDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function ageFromBirthDate(value, now = new Date()) {
  const birthDate = parseBirthDate(value);
  if (!birthDate) return null;
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) age -= 1;
  return age;
}

function upsertMatch(state, profileId) {
  state.matches = Array.isArray(state.matches) ? state.matches : [];
  const existing = state.matches.find((match) => match.profileId === profileId);
  if (existing) {
    existing.archivedAt = 0;
    existing.deletedAt = 0;
    return state;
  }

  state.matches.unshift({ profileId, matchedAt: Date.now(), messages: [], pinnedMessageIds: [] });
  return state;
}

function appendMessage(state, profileId, message, profile = null) {
  upsertMatch(state, profileId, profile);
  state.matches = state.matches.map((match) => {
    if (match.profileId !== profileId) return match;

    const messages = Array.isArray(match.messages) ? match.messages : [];
    if (messages.some((item) => item.id === message.id)) {
      return { ...match, messages };
    }

    return {
      ...match,
      archivedAt: 0,
      deletedAt: 0,
      messages: [...messages, message]
    };
  });
  return state;
}

function updateMessage(state, profileId, messageId, updater) {
  state.matches = Array.isArray(state.matches) ? state.matches : [];
  let changed = false;
  state.matches = state.matches.map((match) => {
    if (match.profileId !== profileId) return match;

    return {
      ...match,
      messages: (match.messages || []).map((message) => {
        if (message.id !== messageId) return message;
        changed = true;
        return updater(message);
      })
    };
  });
  return { state, changed };
}

function markRead(state, profileId, readAt = Date.now()) {
  state.matches = Array.isArray(state.matches) ? state.matches : [];
  state.matches = state.matches.map((match) => {
    if (match.profileId !== profileId) return match;

    return {
      ...match,
      messages: (match.messages || []).map((message) =>
        message.from === "them" && !message.readAt ? { ...message, readAt } : message
      )
    };
  });
  return state;
}

function markSentSeen(state, profileId, messageIds, seenAt) {
  const ids = new Set(messageIds);
  state.matches = Array.isArray(state.matches) ? state.matches : [];
  state.matches = state.matches.map((match) => {
    if (match.profileId !== profileId) return match;

    return {
      ...match,
      messages: (match.messages || []).map((message) =>
        message.from === "me" && ids.has(message.id) ? { ...message, seenAt } : message
      )
    };
  });
  return state;
}

function normalizeActivityEvent(event) {
  return {
    id: String(event?.id || randomUUID()),
    type: String(event?.type || "activity"),
    actor: {
      id: String(event?.actor?.id || ""),
      name: String(event?.actor?.name || "Flame user"),
      image: String(event?.actor?.image || DEFAULT_PROFILE_IMAGE)
    },
    postId: String(event?.postId || ""),
    commentId: String(event?.commentId || ""),
    parentCommentId: String(event?.parentCommentId || ""),
    reaction: String(event?.reaction || ""),
    text: String(event?.text || ""),
    createdAt: Number(event?.createdAt) || Date.now(),
    readAt: Number(event?.readAt) || 0
  };
}

function normalizeProfileChoice(value, choices) {
  const text = String(value || "").trim();
  if (!text) return "";
  return choices.find((choice) => choice.toLowerCase() === text.toLowerCase()) || text;
}

function normalizeStory(story, now = Date.now()) {
  const createdAt = Number(story?.createdAt) || now;
  const expiresAt = Number(story?.expiresAt) || createdAt + STORY_TTL_MS;
  if (expiresAt <= now) return null;

  const type = ["image", "video"].includes(story?.type) ? story.type : "text";
  const text = String(story?.text || "");
  const media = type === "text" ? "" : String(story?.media || "");
  const rawMusic = story?.music && typeof story.music === "object" ? story.music : null;
  const musicSource = String(rawMusic?.source || "synth");
  const music = rawMusic
    ? {
        source: ["synth", "upload", "youtube"].includes(musicSource) ? musicSource : "synth",
        id: String(rawMusic.id || "").slice(0, 80),
        title: String(rawMusic.title || "").slice(0, 80),
        artist: String(rawMusic.artist || "").slice(0, 80)
      }
    : null;

  if (music?.source === "upload") {
    music.src = String(rawMusic.src || "").slice(0, STORY_MUSIC_SRC_MAX_CHARS);
    music.mime = String(rawMusic.mime || "").slice(0, 120);
  }

  if (music?.source === "youtube") {
    music.youtubeId = String(rawMusic.youtubeId || "").slice(0, 80);
    music.thumbnail = String(rawMusic.thumbnail || "").slice(0, 500);
  }

  if (music) {
    music.startAt = Math.max(0, Math.min(60 * 60 * 6, Number(rawMusic.startAt) || 0));
    music.duration = 60;
  }

  if (type === "text" ? !text.trim() && !(music?.id && music?.title) : !media) return null;

  const reactions = Object.fromEntries(
    Object.entries(story?.reactions && typeof story.reactions === "object" ? story.reactions : {})
      .map(([userId, reaction]) => [String(userId || "").slice(0, 80), String(reaction || "").slice(0, 30)])
      .filter(([userId, reaction]) => userId && reaction)
  );
  const views = Object.fromEntries(
    Object.entries(story?.views && typeof story.views === "object" ? story.views : {})
      .map(([userId, viewedAt]) => [String(userId || "").slice(0, 80), Number(viewedAt) || 0])
      .filter(([userId, viewedAt]) => userId && viewedAt > 0)
  );
  const replies = Array.isArray(story?.replies)
    ? story.replies
        .map((reply) => ({
          id: String(reply?.id || randomUUID()),
          userId: String(reply?.userId || "").slice(0, 80),
          text: String(reply?.text || "").trim().slice(0, 240),
          createdAt: Number(reply?.createdAt) || Date.now()
        }))
        .filter((reply) => reply.userId && reply.text)
        .slice(-80)
    : [];

  return {
    id: String(story?.id || randomUUID()),
    type,
    text,
    media,
    name: String(story?.name || ""),
    mime: String(story?.mime || ""),
    ...(music?.id && music?.title ? { music } : {}),
    reactions,
    views,
    replies,
    createdAt,
    expiresAt
  };
}

function normalizeUser(user) {
  const rawUserProfile = user.state?.user || {};
  const existingUser = Boolean(user.id) && rawUserProfile.onboardingCompleted === undefined;
  const stories = Array.isArray(user.state?.stories)
    ? user.state.stories
        .map((story) => normalizeStory(story))
        .filter(Boolean)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 8)
    : [];

  const events = Array.isArray(user.state?.events)
    ? user.state.events
        .map(normalizeActivityEvent)
        .filter((event) => !REMOVED_BOT_IDS.has(String(event.actor.id)))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 80)
    : [];

  const matches = Array.isArray(user.state?.matches)
    ? user.state.matches
        .filter((match) => match?.profileId)
        .filter((match) => !REMOVED_BOT_IDS.has(String(match.profileId)))
        .map((match) => ({
          profileId: String(match.profileId),
          matchedAt: Number(match.matchedAt) || Date.now(),
          archivedAt: Number(match.archivedAt) || 0,
          deletedAt: Number(match.deletedAt) || 0,
          blockedAt: Number(match.blockedAt) || 0,
          blockedBy: String(match.blockedBy || ""),
          messages: Array.isArray(match.messages) ? match.messages : [],
          pinnedMessageIds: Array.isArray(match.pinnedMessageIds)
            ? Array.from(new Set(match.pinnedMessageIds.map((id) => String(id || "").slice(0, 120)).filter(Boolean))).slice(0, 80)
            : [],
          ...(match.profile?.id ? { profile: match.profile } : {})
        }))
    : [];

  const state = {
    ...clone(defaultState),
    ...(user.state || {}),
    privacy: { ...defaultState.privacy, ...(user.state?.privacy || {}) },
    user: {
      ...defaultState.user,
      ...(user.state?.user || {}),
      onboardingCompleted: existingUser ? true : Boolean(user.state?.user?.onboardingCompleted)
    },
    likedIds: Array.isArray(user.state?.likedIds)
      ? user.state.likedIds.filter((id) => !REMOVED_BOT_IDS.has(String(id)))
      : [],
    passedIds: Array.isArray(user.state?.passedIds)
      ? user.state.passedIds.filter((id) => !REMOVED_BOT_IDS.has(String(id)))
      : [],
    blockedIds: Array.isArray(user.state?.blockedIds)
      ? Array.from(new Set(user.state.blockedIds.map(String).filter(Boolean)))
      : [],
    matches,
    stories,
    events
  };
  delete state.verification;
  state.user.gender = normalizeProfileChoice(state.user.gender, ["Woman", "Man", "Non-binary", "Prefer not to say"]);
  state.user.interestedIn = normalizeProfileChoice(state.user.interestedIn, ["Women", "Men", "Everyone"]);

  return { ...user, state };
}

function firstName(fullName, email) {
  const name = String(fullName || "").trim();
  if (name) return name.split(/\s+/)[0];
  return String(email || "User").split("@")[0];
}

function locationFor(profile, privacy) {
  if (privacy.locationScope === "Hidden" || privacy.showDistance === false) return "Hidden";
  if (privacy.locationScope === "City only") return String(profile.location || "Nearby").split(",")[0];
  return profile.location || "Nearby";
}

function publicProfile(user, activeUserIds, viewerId) {
  const normalized = normalizeUser(user);
  const profile = normalized.state.user;
  const privacy = normalized.state.privacy;
  const location = locationFor(profile, privacy);
  const interests = Array.from(
    new Set([
      ...(Array.isArray(profile.interests) ? profile.interests : []),
      profile.gender,
      profile.interestedIn
    ].filter(Boolean))
  );

  return {
    id: normalized.id,
    name: firstName(profile.fullName, normalized.email),
    age: profile.age || 18,
    image: profile.image || defaultState.user.image,
    background: profile.background || "",
    activeStory: publicStory(normalized.state.stories[0], viewerId),
    online: privacy.showOnline !== false && activeUserIds.has(normalized.id),
    lastActiveAt: normalized.lastActiveAt || normalized.lastLoginAt || normalized.joinedAt || null,
    distance: location,
    likesYou: normalized.state.likedIds.includes(viewerId),
    bio: profile.bio || "New to Flame.",
    prompt: "Signed up and ready to connect.",
    interests,
    details: [
      { label: "Location", value: location },
      { label: "Zodiac", value: profile.zodiacSign || "Not shared" },
      { label: "Work", value: profile.work || "Not shared" },
      { label: "School", value: profile.school || "Not shared" },
      { label: "Looking for", value: profile.interestedIn ? `Interested in ${profile.interestedIn}` : "Not shared" }
    ]
  };
}

function publicUserSummary(user, activeUserIds, viewerId) {
  if (!user) {
    return {
      id: "",
      name: "Flame user",
      image: DEFAULT_PROFILE_IMAGE,
      online: false,
      lastActiveAt: null
    };
  }

  const profile = publicProfile(user, activeUserIds, viewerId);
  return {
    id: profile.id,
    name: profile.name,
    image: profile.image,
    activeStory: profile.activeStory || null,
    online: profile.online,
    lastActiveAt: profile.lastActiveAt
  };
}

function activityActor(user) {
  const profile = publicUserSummary(user, new Set(), user?.id || "");
  return {
    id: profile.id,
    name: profile.name,
    image: profile.image
  };
}

function createActivityEvent(type, actor, details = {}) {
  return normalizeActivityEvent({
    id: randomUUID(),
    type,
    actor: activityActor(actor),
    createdAt: Date.now(),
    ...details
  });
}

function reactionCounts(reactions = {}) {
  return Object.values(reactions).reduce((counts, reaction) => {
    if (!reaction) return counts;
    counts[reaction] = (counts[reaction] || 0) + 1;
    return counts;
  }, {});
}

function messageStoryReplyPreview(value) {
  if (!value || typeof value !== "object") return null;
  const type = ["image", "video"].includes(value.type) ? value.type : "text";
  const media = type === "text" ? "" : String(value.media || "").slice(0, STORY_MUSIC_SRC_MAX_CHARS);
  return {
    id: String(value.id || "").slice(0, 120),
    ownerId: String(value.ownerId || "").slice(0, 80),
    ownerName: String(value.ownerName || "Story").slice(0, 80),
    type,
    text: String(value.text || "").slice(0, 280),
    media,
    name: String(value.name || "").slice(0, 180),
    replyText: String(value.replyText || "").slice(0, 240),
    createdAt: Number(value.createdAt) || Date.now()
  };
}

function publicStory(story, viewerId) {
  const normalized = normalizeStory(story);
  if (!normalized) return null;
  const reactions = normalized.reactions || {};
  const views = normalized.views || {};
  const replies = Array.isArray(normalized.replies) ? normalized.replies : [];
  const { reactions: _reactions, views: _views, replies: _replies, ...storyData } = normalized;
  return {
    ...storyData,
    reaction: reactions[viewerId] || "",
    reactionCounts: reactionCounts(reactions),
    viewCount: Object.keys(views).length,
    replyCount: replies.length
  };
}

function publicStoryForOwner(story, viewerId, userMap, activeUserIds) {
  const normalized = normalizeStory(story);
  if (!normalized) return null;
  const publicData = publicStory(normalized, viewerId);
  const viewers = Object.entries(normalized.views || {})
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([userId, viewedAt]) => {
      const user = userMap.get(userId);
      if (!user) {
        return {
          id: userId,
          name: "Flame user",
          image: DEFAULT_PROFILE_IMAGE,
          online: false,
          lastActiveAt: null,
          reaction: normalized.reactions?.[userId] || "",
          viewedAt: Number(viewedAt) || Date.now()
        };
      }
      const summary = publicUserSummary(user, activeUserIds, viewerId);
      return {
        id: summary.id,
        name: summary.name,
        image: summary.image,
        online: summary.online,
        lastActiveAt: summary.lastActiveAt,
        reaction: normalized.reactions?.[userId] || "",
        viewedAt: Number(viewedAt) || Date.now()
      };
    });
  const reactionUsers = Object.entries(normalized.reactions || {})
    .filter(([, reaction]) => reaction)
    .map(([userId, reaction]) => {
      const user = userMap.get(userId);
      return {
        reaction,
        user: publicUserSummary(user, activeUserIds, viewerId)
      };
    })
    .filter((item) => item.user.id);
  const replies = (normalized.replies || [])
    .slice()
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
    .map((reply) => {
      const user = userMap.get(reply.userId);
      return {
        id: reply.id,
        text: reply.text,
        createdAt: reply.createdAt,
        user: publicUserSummary(user, activeUserIds, viewerId)
      };
    })
    .filter((reply) => reply.user.id);

  return { ...publicData, viewers, reactionUsers, replies };
}

function publicFeedComment(comment, userMap, activeUserIds, viewerId) {
  const replies = Array.isArray(comment.replies) ? comment.replies : [];
  const reactions = comment.reactions || {};
  return {
    id: comment.id,
    text: comment.text || "",
    createdAt: comment.createdAt,
    author: publicUserSummary(userMap.get(comment.authorId), activeUserIds, viewerId),
    reaction: reactions[viewerId] || "",
    reactionCounts: reactionCounts(reactions),
    reactionUsers: Object.entries(reactions)
      .filter(([, reaction]) => reaction)
      .map(([userId, reaction]) => ({
        reaction,
        user: publicUserSummary(userMap.get(userId), activeUserIds, viewerId)
      })),
    replies: replies.map((reply) => publicFeedComment(reply, userMap, activeUserIds, viewerId))
  };
}

function commentThreadCount(comments = []) {
  return comments.reduce((total, comment) => {
    const replies = Array.isArray(comment.replies) ? comment.replies : [];
    return total + 1 + commentThreadCount(replies);
  }, 0);
}

function publicFeedPost(post, userMap, activeUserIds, viewerId) {
  const reactions = post.reactions || {};
  const comments = Array.isArray(post.comments) ? post.comments : [];
  const shares = Array.isArray(post.shares) ? post.shares : [];

  return {
    id: post.id,
    text: post.text || "",
    media: post.media || null,
    tags: Array.isArray(post.tags) ? post.tags.filter(Boolean) : [],
    createdAt: post.createdAt,
    author: publicUserSummary(userMap.get(post.authorId), activeUserIds, viewerId),
    canManage: post.authorId === viewerId,
    reaction: reactions[viewerId] || "",
    reactionCounts: reactionCounts(reactions),
    reactionUsers: Object.entries(reactions)
      .filter(([, reaction]) => reaction)
      .map(([userId, reaction]) => ({
        reaction,
        user: publicUserSummary(userMap.get(userId), activeUserIds, viewerId)
      })),
    comments: comments.map((comment) => publicFeedComment(comment, userMap, activeUserIds, viewerId)),
    commentCount: commentThreadCount(comments),
    shareCount: shares.length,
    sharedByMe: shares.some((share) => share.userId === viewerId)
  };
}

function normalizeGroupRoom(room) {
  const maxMembers = Math.max(2, Math.min(24, Number(room?.maxMembers) || 6));
  const members = [];
  const seenMembers = new Set();
  for (const member of Array.isArray(room?.members) ? room.members : []) {
    const userId = String(member?.userId || "");
    if (!userId || seenMembers.has(userId)) continue;
    seenMembers.add(userId);
    members.push({ userId, joinedAt: Number(member?.joinedAt) || Date.now() });
  }

  const memberIds = new Set(members.map((member) => member.userId));
  const seats = [];
  const usedSeatIndexes = new Set();
  for (const seat of Array.isArray(room?.seats) ? room.seats : []) {
    const seatIndex = Math.max(0, Math.min(maxMembers - 1, Number(seat?.seatIndex) || 0));
    const userId = String(seat?.userId || "");
    if (!userId || !memberIds.has(userId) || usedSeatIndexes.has(seatIndex)) continue;
    usedSeatIndexes.add(seatIndex);
    seats.push({
      seatIndex,
      userId,
      micOn: Boolean(seat?.micOn),
      updatedAt: Number(seat?.updatedAt) || Date.now()
    });
  }

  const reactions = (Array.isArray(room?.reactions) ? room.reactions : [])
    .map((reaction) => ({
      id: String(reaction?.id || randomUUID()),
      userId: String(reaction?.userId || ""),
      seatIndex: Math.max(0, Math.min(maxMembers - 1, Number(reaction?.seatIndex) || 0)),
      emoji: ROOM_REACTIONS.has(String(reaction?.emoji || "")) ? String(reaction.emoji) : "heart",
      createdAt: Number(reaction?.createdAt) || Date.now()
    }))
    .filter((reaction) => reaction.userId)
    .slice(-40);

  return {
    id: String(room?.id || randomUUID()),
    name: String(room?.name || "Untitled Room").trim().slice(0, 80) || "Untitled Room",
    description: String(room?.description || "").trim().slice(0, 500),
    maxMembers,
    creatorId: String(room?.creatorId || ""),
    members: members.slice(0, maxMembers),
    seats,
    reactions,
    createdAt: Number(room?.createdAt) || Date.now(),
    updatedAt: Number(room?.updatedAt) || Date.now(),
    closedAt: Number(room?.closedAt) || 0
  };
}

function publicGroupRoom(room, userMap, activeUserIds, viewerId) {
  const normalized = normalizeGroupRoom(room);
  if (normalized.closedAt) return null;
  const memberIds = new Set(normalized.members.map((member) => member.userId));
  const seats = Array.from({ length: normalized.maxMembers }, (_, index) => {
    const seat = normalized.seats.find((item) => item.seatIndex === index);
    if (!seat) {
      return {
        seatIndex: index,
        available: true,
        user: null,
        micOn: false
      };
    }

    return {
      seatIndex: index,
      available: false,
      user: publicUserSummary(userMap.get(seat.userId), activeUserIds, viewerId),
      micOn: Boolean(seat.micOn),
      occupiedAt: seat.updatedAt
    };
  });
  const viewerSeat = normalized.seats.find((seat) => seat.userId === viewerId);

  return {
    id: normalized.id,
    name: normalized.name,
    description: normalized.description,
    maxMembers: normalized.maxMembers,
    currentMembers: normalized.members.length,
    isFull: normalized.members.length >= normalized.maxMembers,
    creator: publicUserSummary(userMap.get(normalized.creatorId), activeUserIds, viewerId),
    creatorId: normalized.creatorId,
    canDelete: normalized.creatorId === viewerId,
    joined: memberIds.has(viewerId),
    viewerSeatIndex: viewerSeat ? viewerSeat.seatIndex : null,
    members: normalized.members.map((member) => ({
      ...publicUserSummary(userMap.get(member.userId), activeUserIds, viewerId),
      joinedAt: member.joinedAt
    })),
    seats,
    reactions: normalized.reactions.map((reaction) => ({
      ...reaction,
      user: publicUserSummary(userMap.get(reaction.userId), activeUserIds, viewerId)
    })),
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt
  };
}

function valueMatches(actualValues, expected) {
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    if ("$in" in expected) {
      const allowed = new Set((expected.$in || []).map(String));
      return actualValues.some((value) => allowed.has(String(value)));
    }
    if ("$ne" in expected) {
      return actualValues.every((value) => value !== expected.$ne);
    }
  }

  return actualValues.some((value) => value === expected);
}

function valuesAtPath(value, pathParts) {
  if (pathParts.length === 0) return [value];
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => valuesAtPath(item, pathParts));

  const [part, ...rest] = pathParts;
  return valuesAtPath(value[part], rest);
}

function matchesQuery(document, query = {}) {
  return Object.entries(query || {}).every(([path, expected]) => {
    const actualValues = valuesAtPath(document, path.split("."));
    return valueMatches(actualValues, expected);
  });
}

function getPathValue(document, path) {
  return valuesAtPath(document, path.split("."))[0];
}

function setPathValue(document, path, value) {
  const parts = path.split(".");
  let target = document;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!target[part] || typeof target[part] !== "object") target[part] = {};
    target = target[part];
  }
  target[parts[parts.length - 1]] = value;
}

function unsetPathValue(document, path) {
  const parts = path.split(".");
  let target = document;
  for (let index = 0; index < parts.length - 1; index += 1) {
    target = target?.[parts[index]];
    if (!target || typeof target !== "object") return;
  }
  delete target[parts[parts.length - 1]];
}

function deletePathValue(document, path) {
  const parts = path.split(".");
  const visit = (target, index) => {
    if (!target || typeof target !== "object") return;
    if (Array.isArray(target)) {
      for (const item of target) visit(item, index);
      return;
    }

    const part = parts[index];
    if (index === parts.length - 1) {
      delete target[part];
      return;
    }
    visit(target[part], index + 1);
  };

  visit(document, 0);
}

function pushPathValue(document, path, value) {
  const current = getPathValue(document, path);
  if (!Array.isArray(current)) setPathValue(document, path, []);
  getPathValue(document, path).push(value);
}

function projectDocument(document, projection = null) {
  if (!projection) return clone(document);

  const includePaths = Object.entries(projection)
    .filter(([path, enabled]) => path !== "_id" && enabled)
    .map(([path]) => path);
  if (includePaths.length === 0) {
    const projected = clone(document);
    for (const [path, enabled] of Object.entries(projection)) {
      if (path !== "_id" && !enabled) deletePathValue(projected, path);
    }
    if (projection._id === 0) delete projected._id;
    return projected;
  }

  const projected = {};
  for (const path of includePaths) {
    const value = getPathValue(document, path);
    if (value !== undefined) setPathValue(projected, path, clone(value));
  }
  return projected;
}

function compareBySort(sortSpec = {}) {
  const entries = Object.entries(sortSpec);
  return (left, right) => {
    for (const [path, direction] of entries) {
      const leftValue = getPathValue(left, path);
      const rightValue = getPathValue(right, path);
      if (leftValue === rightValue) continue;
      const order = direction < 0 ? -1 : 1;
      return leftValue > rightValue ? order : -order;
    }
    return 0;
  };
}

function positionalCommentId(filter = {}) {
  return filter["comments.id"] || "";
}

function arrayFilterValue(options, name, field) {
  const prefix = `${name}.${field}`;
  return (options?.arrayFilters || []).find((filter) => Object.prototype.hasOwnProperty.call(filter, prefix))?.[prefix];
}

function applyNestedPostPath(document, path, value, filter, options, operation) {
  if (path === "comments.$.replies") {
    const comment = (document.comments || []).find((item) => item.id === positionalCommentId(filter));
    if (!comment) return false;
    comment.replies = Array.isArray(comment.replies) ? comment.replies : [];
    comment.replies.push(value);
    return true;
  }

  if (path.startsWith("comments.$.reactions.")) {
    const userId = path.slice("comments.$.reactions.".length);
    const comment = (document.comments || []).find((item) => item.id === positionalCommentId(filter));
    if (!comment) return false;
    comment.reactions = comment.reactions || {};
    if (operation === "$unset") delete comment.reactions[userId];
    else comment.reactions[userId] = value;
    return true;
  }

  if (path.startsWith("comments.$[comment].replies.$[reply].reactions.")) {
    const userId = path.slice("comments.$[comment].replies.$[reply].reactions.".length);
    const commentId = arrayFilterValue(options, "comment", "id");
    const replyId = arrayFilterValue(options, "reply", "id");
    const comment = (document.comments || []).find((item) => item.id === commentId);
    const reply = comment?.replies?.find((item) => item.id === replyId);
    if (!reply) return false;
    reply.reactions = reply.reactions || {};
    if (operation === "$unset") delete reply.reactions[userId];
    else reply.reactions[userId] = value;
    return true;
  }

  return null;
}

function applyLocalUpdate(document, filter, update = {}, options = {}) {
  let changed = false;

  for (const [path, value] of Object.entries(update.$set || {})) {
    const nested = applyNestedPostPath(document, path, value, filter, options, "$set");
    if (nested === false) continue;
    if (nested === null) setPathValue(document, path, value);
    changed = true;
  }

  for (const [path, value] of Object.entries(update.$push || {})) {
    const nested = applyNestedPostPath(document, path, value, filter, options, "$push");
    if (nested === false) continue;
    if (nested === null) pushPathValue(document, path, value);
    changed = true;
  }

  for (const path of Object.keys(update.$unset || {})) {
    const nested = applyNestedPostPath(document, path, undefined, filter, options, "$unset");
    if (nested === false) continue;
    if (nested === null) unsetPathValue(document, path);
    changed = true;
  }

  return changed;
}

class LocalCursor {
  constructor(documents, projection = null) {
    this.documents = documents;
    this.projection = projection;
  }

  project(projection) {
    this.projection = projection;
    return this;
  }

  sort(sortSpec) {
    this.documents = [...this.documents].sort(compareBySort(sortSpec));
    return this;
  }

  limit(count) {
    this.documents = this.documents.slice(0, Math.max(0, Number(count) || 0));
    return this;
  }

  async toArray() {
    return this.documents.map((document) => projectDocument(document, this.projection));
  }
}

class LocalCollection {
  constructor(store, name) {
    this.store = store;
    this.name = name;
  }

  get documents() {
    this.store.data[this.name] = Array.isArray(this.store.data[this.name]) ? this.store.data[this.name] : [];
    return this.store.data[this.name];
  }

  async createIndex() {
    return `${this.name}_local_index`;
  }

  find(query = {}, options = {}) {
    const documents = this.documents.filter((document) => matchesQuery(document, query));
    return new LocalCursor(documents, options.projection || null);
  }

  async findOne(query = {}, options = {}) {
    const document = this.documents.find((item) => matchesQuery(item, query));
    return document ? projectDocument(document, options.projection || null) : null;
  }

  async countDocuments(query = {}) {
    return this.documents.filter((document) => matchesQuery(document, query)).length;
  }

  async insertOne(document) {
    this.documents.push(clone(document));
    this.store.persist();
    return { acknowledged: true, insertedId: document.id || document.token || randomUUID() };
  }

  async updateOne(filter = {}, update = {}, options = {}) {
    const document = this.documents.find((item) => matchesQuery(item, filter));
    if (!document) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };

    const changed = applyLocalUpdate(document, filter, update, options);
    if (changed) this.store.persist();
    return { acknowledged: true, matchedCount: 1, modifiedCount: changed ? 1 : 0 };
  }

  async deleteOne(filter = {}) {
    const index = this.documents.findIndex((item) => matchesQuery(item, filter));
    if (index === -1) return { acknowledged: true, deletedCount: 0 };
    this.documents.splice(index, 1);
    this.store.persist();
    return { acknowledged: true, deletedCount: 1 };
  }
}

class LocalJsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = null;
  }

  init() {
    this.data = this.load();
    this.users = new LocalCollection(this, "users");
    this.sessions = new LocalCollection(this, "sessions");
    this.posts = new LocalCollection(this, "posts");
    this.groupRooms = new LocalCollection(this, "groupRooms");
    this.supportTickets = new LocalCollection(this, "supportTickets");
    this.persist();
  }

  load() {
    if (existsSync(this.filePath)) {
      try {
        const parsed = JSON.parse(readFileSync(this.filePath, "utf8"));
        const users = Array.isArray(parsed.users)
          ? parsed.users.filter((user) => !REMOVED_BOT_IDS.has(String(user?.id || "")))
          : [];
        return {
          users,
          sessions: Array.isArray(parsed.sessions)
            ? parsed.sessions.filter((session) => !REMOVED_BOT_IDS.has(String(session?.userId || "")))
            : [],
          posts: Array.isArray(parsed.posts)
            ? parsed.posts.filter((post) => !REMOVED_BOT_IDS.has(String(post?.authorId || "")))
            : [],
          groupRooms: Array.isArray(parsed.groupRooms) ? parsed.groupRooms.map(normalizeGroupRoom) : [],
          supportTickets: Array.isArray(parsed.supportTickets) ? parsed.supportTickets : []
        };
      } catch {
        return seedLocalData();
      }
    }

    return seedLocalData();
  }

  persist() {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    writeFileSync(tempPath, JSON.stringify(this.data, null, 2));
    renameSync(tempPath, this.filePath);
  }
}

function seedUser({ id, email, fullName, age, location, bio, gender, interestedIn, interests, work, school, zodiacSign }) {
  return normalizeUser({
    id,
    email,
    passwordHash: passwordHash("flame123"),
    joinedAt: Date.now() - 1000 * 60 * 60 * 24 * 14,
    lastLoginAt: Date.now() - 1000 * 60 * 60 * 2,
    lastActiveAt: Date.now() - 1000 * 60 * 20,
    state: {
      ...clone(defaultState),
      user: {
        ...clone(defaultState.user),
        fullName,
        age,
        location,
        bio,
        gender,
        interestedIn,
        interests,
        work,
        school,
        zodiacSign,
        onboardingCompleted: true
      }
    }
  });
}

function seedLocalData() {
  return {
    users: [],
    sessions: [],
    posts: [],
    groupRooms: [],
    supportTickets: []
  };
}

function withTimeout(promise, timeoutMs, message) {
  let timeout;
  const timer = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(timeout));
}

export class FlameDatabase {
  constructor() {
    this.uri = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
    this.dbName = process.env.MONGODB_DB || "flame";
    const requestedDatastore = String(process.env.FLAME_DATASTORE || "").toLowerCase();
    const requestedMongo = ["mongo", "mongodb"].includes(requestedDatastore);
    this.mongoTimeoutMs = Math.max(requestedMongo ? 60000 : 1500, Number(process.env.MONGODB_TIMEOUT_MS) || 5000);
    this.mongoSocketTimeoutMs = Math.max(0, Number(process.env.MONGODB_SOCKET_TIMEOUT_MS) || 0);
    this.autoIndex = String(process.env.FLAME_AUTO_INDEX || "true").toLowerCase() !== "false";
    this.localDbPath = process.env.FLAME_LOCAL_DB_PATH || join(SERVER_DIR, "..", "..", ".flame-data", "flame users", "flame-users.json");
    this.forceLocal = ["local", "json", "file"].includes(requestedDatastore);
    this.forceMongo = requestedMongo;
    this.client = this.forceLocal ? null : this.createMongoClient();
    this.onlineUserIds = new Set();
    this.storageMode = "mongo";
  }

  createMongoClient() {
    return new MongoClient(this.uri, {
      serverSelectionTimeoutMS: this.mongoTimeoutMs,
      connectTimeoutMS: this.mongoTimeoutMs,
      socketTimeoutMS: this.mongoSocketTimeoutMs
    });
  }

  async init() {
    if (this.forceLocal) {
      this.useLocalStore("FLAME_DATASTORE=local");
      await this.seedPresentationUsers();
      return;
    }

    try {
      await withTimeout(this.initMongo(), this.mongoTimeoutMs + 5000, "MongoDB initialization timed out.");
      this.storageMode = "mongo";
      return;
    } catch (error) {
      try {
        await withTimeout(this.client?.close(true) || Promise.resolve(), 1000, "MongoDB cleanup timed out.");
      } catch {
        // Ignore cleanup errors before switching to local JSON storage.
      }
      if (this.forceMongo) {
        this.client = this.createMongoClient();
        console.error(`MongoDB datastore is required but unavailable: ${error.message}`);
        throw error;
      }
      this.useLocalStore(error.message || "MongoDB is unavailable");
      await this.seedPresentationUsers();
    }
  }

  async initMongo() {
    if (!this.client) this.client = this.createMongoClient();
    await this.client.connect();
    this.db = this.client.db(this.dbName);
    this.users = this.db.collection("users");
    this.sessions = this.db.collection("sessions");
    this.posts = this.db.collection("posts");
    this.groupRooms = this.db.collection("groupRooms");
    this.supportTickets = this.db.collection("supportTickets");
    await this.db.command({ ping: 1 });

    if (this.autoIndex) {
      this.ensureIndexes().catch((error) => {
        console.warn(`MongoDB index check failed: ${error.message}`);
      });
    }
    await this.seedPresentationUsers();
  }

  async ensureIndexes() {
    const indexSpecs = [
      [this.users, { email: 1 }, { unique: true }],
      [this.users, { id: 1 }, { unique: true }],
      [this.users, { lastActiveAt: -1 }],
      [this.users, { joinedAt: -1 }],
      [this.users, { "state.privacy.discoverable": 1 }],
      [this.sessions, { token: 1 }, { unique: true }],
      [this.sessions, { userId: 1 }],
      [this.sessions, { lastSeenAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }],
      [this.posts, { id: 1 }, { unique: true }],
      [this.posts, { authorId: 1 }],
      [this.posts, { tags: 1 }],
      [this.posts, { createdAt: -1 }],
      [this.posts, { createdAt: -1, id: -1 }],
      [this.groupRooms, { id: 1 }, { unique: true }],
      [this.groupRooms, { creatorId: 1 }],
      [this.groupRooms, { updatedAt: -1 }],
      [this.supportTickets, { userId: 1 }],
      [this.supportTickets, { createdAt: -1 }]
    ];

    for (const [collection, keys, options = {}] of indexSpecs) {
      await collection.createIndex(keys, options);
    }

    await Promise.all([
      this.users.find({ id: { $ne: "" } }).project(PUBLIC_USER_PROJECTION).limit(20).toArray(),
      this.posts.find({}).sort({ createdAt: -1 }).limit(20).toArray()
    ]);
  }

  useLocalStore(reason) {
    const store = new LocalJsonStore(this.localDbPath);
    store.init();
    this.localStore = store;
    this.users = store.users;
    this.sessions = store.sessions;
    this.posts = store.posts;
    this.groupRooms = store.groupRooms;
    this.supportTickets = store.supportTickets;
    this.storageMode = "local";
    console.warn(`Using local Flame datastore at ${this.localDbPath}. Reason: ${reason}`);
  }

  presentationUserDocument(profile, now = Date.now()) {
    const lastActiveAt = now - Math.max(1, Number(profile.lastActiveMinutes) || 5) * 60_000;
    return normalizeUser({
      id: profile.id,
      email: profile.email,
      passwordHash: passwordHash(randomUUID()),
      joinedAt: now - 1000 * 60 * 60 * 24 * 20,
      lastLoginAt: lastActiveAt,
      lastActiveAt,
      state: {
        ...clone(defaultState),
        privacy: {
          ...clone(defaultState.privacy),
          discoverable: true,
          showDistance: true,
          showOnline: true
        },
        user: {
          ...clone(defaultState.user),
          fullName: profile.fullName,
          age: profile.age,
          birthDate: profile.birthDate,
          gender: profile.gender,
          interestedIn: profile.interestedIn,
          location: profile.location,
          bio: profile.bio,
          image: profile.image,
          media: [profile.image],
          interests: profile.interests,
          zodiacSign: profile.zodiacSign,
          work: profile.work,
          school: profile.school,
          onboardingCompleted: true
        }
      }
    });
  }

  async seedPresentationUsers() {
    const now = Date.now();
    for (const profile of PRESENTATION_USERS) {
      const existing = await this.users.findOne({ id: profile.id }, { projection: { _id: 0, id: 1 } });
      if (existing) {
        await this.users.updateOne(
          { id: profile.id },
          {
            $set: {
              lastActiveAt: now - Math.max(1, Number(profile.lastActiveMinutes) || 5) * 60_000,
              "state.privacy.discoverable": true,
              "state.privacy.showDistance": true,
              "state.privacy.showOnline": true,
              "state.user.fullName": profile.fullName,
              "state.user.age": profile.age,
              "state.user.birthDate": profile.birthDate,
              "state.user.gender": profile.gender,
              "state.user.interestedIn": profile.interestedIn,
              "state.user.location": profile.location,
              "state.user.bio": profile.bio,
              "state.user.image": profile.image,
              "state.user.media": [profile.image],
              "state.user.interests": profile.interests,
              "state.user.zodiacSign": profile.zodiacSign,
              "state.user.work": profile.work,
              "state.user.school": profile.school,
              "state.user.onboardingCompleted": true
            }
          }
        );
        continue;
      }

      const existingEmail = await this.users.findOne({ email: profile.email }, { projection: { _id: 0, id: 1 } });
      if (existingEmail) continue;

      await this.users.insertOne(this.presentationUserDocument(profile, now));
    }
  }

  async publicState(user, { includeFeed = true, includeProfiles = true } = {}) {
    const normalized = normalizeUser(user);
    const profiles = includeProfiles ? await this.discoverProfiles(normalized) : [];
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
    const blockedIds = new Set(normalized.state.blockedIds || []);
    const visibleMatches = normalized.state.matches.filter((match) => !match.blockedAt && !blockedIds.has(match.profileId));
    const matchIds = visibleMatches.map((match) => match.profileId);
    const activeUserIds = await this.activeUserIds();
    const matchUsers = matchIds.length
      ? await this.users.find({ id: { $in: matchIds } }).project(PUBLIC_USER_PROJECTION).toArray()
      : [];
    const storyViewerIds = Array.from(
      new Set(
        normalized.state.stories.flatMap((story) =>
          [
            ...Object.keys(story.views || {}),
            ...Object.keys(story.reactions || {}),
            ...(story.replies || []).map((reply) => reply.userId)
          ].filter((userId) => userId && userId !== normalized.id)
        )
      )
    );
    const storyViewerUsers = storyViewerIds.length
      ? await this.users.find({ id: { $in: storyViewerIds } }).project(PUBLIC_USER_PROJECTION).toArray()
      : [];
    const storyViewerMap = new Map(storyViewerUsers.map((viewer) => [viewer.id, viewer]));
    const matchProfileMap = new Map(
      matchUsers.map((matchUser) => [
        matchUser.id,
        publicProfile(matchUser, activeUserIds, normalized.id)
      ])
    );
    const state = clone(normalized.state);
    state.stories = normalized.state.stories
      .map((story) => publicStoryForOwner(story, normalized.id, storyViewerMap, activeUserIds))
      .filter(Boolean);
    state.matches = visibleMatches.map((match) => {
      const profile = profileMap.get(match.profileId) || matchProfileMap.get(match.profileId) || match.profile;
      return profile ? { ...match, profile: clone(profile) } : match;
    });

    return {
      auth: {
        isAuthenticated: true,
        id: normalized.id,
        email: normalized.email,
        joinedAt: normalized.joinedAt,
        lastLoginAt: normalized.lastLoginAt
      },
      ...state,
      profiles,
      ...(includeFeed ? { feed: await this.publicFeed(normalized.id) } : {})
    };
  }

  authState(user) {
    const normalized = normalizeUser(user);
    const state = clone(normalized.state);
    delete state.verification;
    return {
      auth: {
        isAuthenticated: true,
        id: normalized.id,
        email: normalized.email,
        joinedAt: normalized.joinedAt,
        lastLoginAt: normalized.lastLoginAt
      },
      ...state,
      profiles: [],
      feed: []
    };
  }

  async activeUserIds() {
    return new Set(this.onlineUserIds);
  }

  setOnlineUserIds(userIds) {
    this.onlineUserIds = new Set(Array.from(userIds || []).map(String));
  }

  async discoverProfiles(currentUser, { limit = 240 } = {}) {
    const normalizedCurrent = normalizeUser(currentUser);
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 240));
    const users = await this.users
      .find({
        id: { $ne: normalizedCurrent.id },
        "state.privacy.discoverable": { $ne: false }
      })
      .project(PUBLIC_USER_PROJECTION)
      .sort({ lastActiveAt: -1, joinedAt: -1 })
      .limit(safeLimit)
      .toArray();
    const activeUserIds = await this.activeUserIds();
    const blockedIds = new Set(normalizedCurrent.state.blockedIds || []);

    const realProfiles = users
      .map((user) => normalizeUser(user))
      .filter((user) => !blockedIds.has(user.id))
      .filter((user) => !(user.state.blockedIds || []).includes(normalizedCurrent.id))
      .map((user) => publicProfile(user, activeUserIds, normalizedCurrent.id));

    return realProfiles;
  }

  async publicFeed(viewerId, { limit = 40 } = {}) {
    const safeLimit = Math.max(1, Math.min(60, Number(limit) || 40));
    const posts = await this.posts
      .find({})
      .project({ _id: 0 })
      .sort({ createdAt: -1, id: -1 })
      .limit(safeLimit)
      .toArray();
    const authorIds = new Set();

    for (const post of posts) {
      if (post.authorId) authorIds.add(post.authorId);
      for (const userId of Object.keys(post.reactions || {})) {
        if (userId) authorIds.add(userId);
      }
      const collectCommentAuthors = (comments = []) => {
        for (const comment of comments) {
          if (comment.authorId) authorIds.add(comment.authorId);
          for (const userId of Object.keys(comment.reactions || {})) {
            if (userId) authorIds.add(userId);
          }
          collectCommentAuthors(comment.replies || []);
        }
      };
      collectCommentAuthors(post.comments || []);
    }

    const users = authorIds.size
      ? await this.users.find({ id: { $in: Array.from(authorIds) } }).project(PUBLIC_USER_PROJECTION).toArray()
      : [];
    const userMap = new Map(users.map((user) => [user.id, normalizeUser(user)]));
    const activeUserIds = await this.activeUserIds();

    return posts.map((post) => publicFeedPost(post, userMap, activeUserIds, viewerId));
  }

  async groupRoomUserMap(rooms) {
    const userIds = new Set();
    for (const rawRoom of rooms) {
      const room = normalizeGroupRoom(rawRoom);
      if (room.creatorId) userIds.add(room.creatorId);
      for (const member of room.members) if (member.userId) userIds.add(member.userId);
      for (const seat of room.seats) if (seat.userId) userIds.add(seat.userId);
      for (const reaction of room.reactions) if (reaction.userId) userIds.add(reaction.userId);
    }

    const users = userIds.size
      ? await this.users.find({ id: { $in: Array.from(userIds) } }).project(PUBLIC_USER_PROJECTION).toArray()
      : [];
    return new Map(users.map((user) => [user.id, normalizeUser(user)]));
  }

  async publicGroupRooms(rooms, viewerId) {
    const userMap = await this.groupRoomUserMap(rooms);
    const activeUserIds = await this.activeUserIds();
    return rooms
      .map((room) => publicGroupRoom(room, userMap, activeUserIds, viewerId))
      .filter(Boolean);
  }

  async publicGroupRoom(room, viewerId) {
    const rooms = await this.publicGroupRooms([room], viewerId);
    return rooms[0] || null;
  }

  async saveGroupRoom(room) {
    const normalized = normalizeGroupRoom(room);
    const cleanRoom = withoutMongoId(normalized);
    const existing = await this.groupRooms.findOne({ id: cleanRoom.id }, { projection: { _id: 0, id: 1 } });
    if (existing) {
      await this.groupRooms.updateOne({ id: cleanRoom.id }, { $set: cleanRoom });
    } else {
      await this.groupRooms.insertOne(cleanRoom);
    }
    return cleanRoom;
  }

  async loadGroupRoom(roomId) {
    const id = String(roomId || "");
    const room = id ? await this.groupRooms.findOne({ id }, { projection: { _id: 0 } }) : null;
    if (!room) {
      const error = new Error("Room not found.");
      error.status = 404;
      throw error;
    }
    const normalized = normalizeGroupRoom(room);
    if (normalized.closedAt) {
      const error = new Error("This room is already closed.");
      error.status = 410;
      throw error;
    }
    return normalized;
  }

  async listGroupRooms(user) {
    const rooms = await this.groupRooms
      .find({ closedAt: 0 })
      .project({ _id: 0 })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(80)
      .toArray();
    return this.publicGroupRooms(rooms, normalizeUser(user).id);
  }

  async createGroupRoom(user, { name, description, maxMembers }) {
    const normalizedUser = normalizeUser(user);
    const now = Date.now();
    const room = await this.saveGroupRoom({
      id: randomUUID(),
      name,
      description,
      maxMembers,
      creatorId: normalizedUser.id,
      members: [{ userId: normalizedUser.id, joinedAt: now }],
      seats: [],
      reactions: [],
      createdAt: now,
      updatedAt: now,
      closedAt: 0
    });
    return this.publicGroupRoom(room, normalizedUser.id);
  }

  async joinGroupRoom(user, roomId) {
    const normalizedUser = normalizeUser(user);
    const room = await this.loadGroupRoom(roomId);
    const alreadyJoined = room.members.some((member) => member.userId === normalizedUser.id);
    if (!alreadyJoined) {
      if (room.members.length >= room.maxMembers) {
        const error = new Error("This room is already full.");
        error.status = 409;
        throw error;
      }
      room.members.push({ userId: normalizedUser.id, joinedAt: Date.now() });
    }
    room.updatedAt = Date.now();
    const savedRoom = await this.saveGroupRoom(room);
    return this.publicGroupRoom(savedRoom, normalizedUser.id);
  }

  async leaveGroupRoom(user, roomId) {
    const normalizedUser = normalizeUser(user);
    const room = await this.loadGroupRoom(roomId);
    room.members = room.members.filter((member) => member.userId !== normalizedUser.id);
    room.seats = room.seats.filter((seat) => seat.userId !== normalizedUser.id);
    room.reactions = room.reactions.filter((reaction) => reaction.userId !== normalizedUser.id);
    room.updatedAt = Date.now();
    const savedRoom = await this.saveGroupRoom(room);
    return this.publicGroupRoom(savedRoom, normalizedUser.id);
  }

  async chooseGroupRoomSeat(user, { roomId, seatIndex }) {
    const normalizedUser = normalizeUser(user);
    const room = await this.loadGroupRoom(roomId);
    const index = Number(seatIndex);
    if (!Number.isInteger(index) || index < 0 || index >= room.maxMembers) {
      const error = new Error("Choose an available seat.");
      error.status = 400;
      throw error;
    }

    const alreadyJoined = room.members.some((member) => member.userId === normalizedUser.id);
    if (!alreadyJoined) {
      if (room.members.length >= room.maxMembers) {
        const error = new Error("This room is already full.");
        error.status = 409;
        throw error;
      }
      room.members.push({ userId: normalizedUser.id, joinedAt: Date.now() });
    }

    const occupiedByOther = room.seats.some((seat) => seat.seatIndex === index && seat.userId !== normalizedUser.id);
    if (occupiedByOther) {
      const error = new Error("That seat is already taken.");
      error.status = 409;
      throw error;
    }

    const previousSeat = room.seats.find((seat) => seat.userId === normalizedUser.id);
    room.seats = room.seats.filter((seat) => seat.userId !== normalizedUser.id && seat.seatIndex !== index);
    room.seats.push({
      seatIndex: index,
      userId: normalizedUser.id,
      micOn: Boolean(previousSeat?.micOn),
      updatedAt: Date.now()
    });
    room.updatedAt = Date.now();
    const savedRoom = await this.saveGroupRoom(room);
    return this.publicGroupRoom(savedRoom, normalizedUser.id);
  }

  async updateGroupRoomMic(user, { roomId, micOn }) {
    const normalizedUser = normalizeUser(user);
    const room = await this.loadGroupRoom(roomId);
    const seat = room.seats.find((item) => item.userId === normalizedUser.id);
    if (!seat) {
      const error = new Error("Choose a seat before using the mic.");
      error.status = 409;
      throw error;
    }
    seat.micOn = Boolean(micOn);
    seat.updatedAt = Date.now();
    room.updatedAt = Date.now();
    const savedRoom = await this.saveGroupRoom(room);
    return this.publicGroupRoom(savedRoom, normalizedUser.id);
  }

  async sendGroupRoomReaction(user, { roomId, emoji }) {
    const normalizedUser = normalizeUser(user);
    const room = await this.loadGroupRoom(roomId);
    const seat = room.seats.find((item) => item.userId === normalizedUser.id);
    if (!seat) {
      const error = new Error("Choose a seat before sending a reaction.");
      error.status = 409;
      throw error;
    }
    const reaction = ROOM_REACTIONS.has(String(emoji || "")) ? String(emoji) : "heart";
    room.reactions = [
      ...room.reactions,
      {
        id: randomUUID(),
        userId: normalizedUser.id,
        seatIndex: seat.seatIndex,
        emoji: reaction,
        createdAt: Date.now()
      }
    ].slice(-40);
    room.updatedAt = Date.now();
    const savedRoom = await this.saveGroupRoom(room);
    return this.publicGroupRoom(savedRoom, normalizedUser.id);
  }

  async deleteGroupRoom(user, roomId) {
    const normalizedUser = normalizeUser(user);
    const room = await this.loadGroupRoom(roomId);
    if (room.creatorId !== normalizedUser.id) {
      const error = new Error("Only the room creator can close this room.");
      error.status = 403;
      throw error;
    }
    await this.groupRooms.deleteOne({ id: room.id });
    return { roomId: room.id };
  }

  async findUserByEmail(email) {
    const user = await this.users.findOne({ email: email.trim().toLowerCase() });
    return user ? normalizeUser(user) : null;
  }

  async findUserAuthByEmail(email) {
    return this.users.findOne(
      { email: email.trim().toLowerCase() },
      {
        projection: {
          _id: 0,
          id: 1,
          email: 1,
          passwordHash: 1,
          joinedAt: 1,
          lastLoginAt: 1,
          lastActiveAt: 1
        }
      }
    );
  }

  async findUserById(id) {
    const user = await this.users.findOne({ id }, { projection: USER_WITHOUT_MATCH_PROFILE_PROJECTION });
    return user ? normalizeUser(user) : null;
  }

  async findUserBySession(token) {
    const session = await this.sessions.findOne({ token });
    if (!session) return null;

    const user = await this.users.findOne({ id: session.userId }, { projection: USER_WITHOUT_MATCH_PROFILE_PROJECTION });
    if (!user) return null;

    await this.sessions.updateOne({ token }, { $set: { lastSeenAt: Date.now() } });
    return normalizeUser(user);
  }

  async createSession(user) {
    const token = randomUUID();
    await this.sessions.insertOne({
      token,
      userId: user.id,
      createdAt: Date.now(),
      lastSeenAt: Date.now()
    });
    return token;
  }

  async deleteSession(token) {
    await this.sessions.deleteOne({ token });
  }

  async markLastActive(userId, lastActiveAt = Date.now()) {
    await this.users.updateOne({ id: userId }, { $set: { lastActiveAt } });
    return lastActiveAt;
  }

  async login(email, password) {
    const user = await this.findUserAuthByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) return null;

    const lastLoginAt = Date.now();
    await this.users.updateOne({ id: user.id }, { $set: { lastLoginAt, lastActiveAt: lastLoginAt } });
    const fullUser = await this.findUserById(user.id);
    const token = await this.createSession(user);
    const sessionUser = fullUser || { ...user, lastLoginAt, lastActiveAt: lastLoginAt };
    return {
      token,
      state: await this.publicState(sessionUser, { includeFeed: false, includeProfiles: false }),
      hydrate: true
    };
  }

  async signup({ fullName, email, password, age, birthDate, gender, interestedIn }) {
    const normalizedEmail = email.trim().toLowerCase();
    if (await this.findUserAuthByEmail(normalizedEmail)) {
      const error = new Error("An account with this email already exists.");
      error.status = 409;
      throw error;
    }

    const now = Date.now();
    const calculatedAge = ageFromBirthDate(birthDate, new Date(now));
    const profileAge = calculatedAge === null ? age : calculatedAge;
    if (calculatedAge !== null && calculatedAge < 18) {
      const error = new Error("You must be at least 18 years old to sign up.");
      error.status = 400;
      throw error;
    }

    const user = normalizeUser({
      id: randomUUID(),
      email: normalizedEmail,
      passwordHash: passwordHash(password),
      joinedAt: now,
      lastLoginAt: now,
      lastActiveAt: now,
      state: {
        ...clone(defaultState),
        user: {
          ...clone(defaultState.user),
          fullName,
          age: Math.max(18, Math.min(99, Number(profileAge) || 18)),
          birthDate: birthDate || "",
          gender: gender || "",
          interestedIn: interestedIn || ""
        }
      }
    });

    await this.users.insertOne(user);
    const token = await this.createSession(user);
    return { token, state: await this.publicState(user, { includeFeed: false, includeProfiles: false }), hydrate: true };
  }

  async saveState(user, nextState) {
    const normalized = normalizeUser(user);
    const state = normalizeUser({ ...normalized, state: nextState }).state;
    await this.users.updateOne({ id: normalized.id }, { $set: { state } });
    return normalizeUser({ ...normalized, state });
  }

  async addActivityEvent(userId, event) {
    const recipientId = String(userId || "");
    if (!recipientId || event?.actor?.id === recipientId) return null;

    const recipient = await this.findUserById(recipientId);
    if (!recipient) return null;

    const state = clone(recipient.state);
    const events = Array.isArray(state.events) ? state.events.map(normalizeActivityEvent) : [];
    const normalizedEvent = normalizeActivityEvent(event);
    state.events = [normalizedEvent, ...events.filter((item) => item.id !== normalizedEvent.id)].slice(0, 80);

    const savedUser = await this.saveState(recipient, state);
    return {
      userId: savedUser.id,
      state: await this.publicState(savedUser)
    };
  }

  async addActivityEvents(userIds, eventFactory) {
    const events = [];
    const seen = new Set();
    for (const userId of userIds) {
      const targetId = String(userId || "");
      if (!targetId || seen.has(targetId)) continue;
      seen.add(targetId);

      const event = typeof eventFactory === "function" ? eventFactory(targetId) : eventFactory;
      const savedEvent = await this.addActivityEvent(targetId, event);
      if (savedEvent) events.push(savedEvent);
    }
    return events;
  }

  async notifyMatchedUsersOfPost(author, post) {
    const normalized = normalizeUser(author);
    const targetIds = normalized.state.matches
      .filter((match) => !match.deletedAt)
      .map((match) => match.profileId)
      .filter((profileId) => profileId && profileId !== normalized.id);

    return this.addActivityEvents(targetIds, () =>
      createActivityEvent("match_post", normalized, {
        postId: post.id,
        text: post.text || ""
      })
    );
  }

  async markActivityEventsRead(user) {
    const normalized = normalizeUser(user);
    const readAt = Date.now();
    const state = clone(normalized.state);
    state.events = (Array.isArray(state.events) ? state.events : []).map((event) =>
      event.readAt ? event : { ...event, readAt }
    );

    const savedUser = await this.saveState(normalized, state);
    return this.publicState(savedUser);
  }

  async patchState(user, patcher) {
    const nextState = patcher(clone(normalizeUser(user).state));
    const savedUser = await this.saveState(user, nextState);
    return this.publicState(savedUser);
  }

  async matchedUserStates(user) {
    const normalized = normalizeUser(user);
    const targetIds = normalized.state.matches
      .filter((match) => !match.deletedAt)
      .map((match) => match.profileId)
      .filter((profileId) => profileId && profileId !== normalized.id);

    const states = [];
    for (const targetId of Array.from(new Set(targetIds))) {
      const target = await this.findUserById(targetId);
      if (!target) continue;
      states.push({
        userId: target.id,
        state: await this.publicState(target)
      });
    }
    return states;
  }

  async createStory(user, { type = "text", text = "", media = "", name = "", mime = "", music = null }) {
    const normalized = normalizeUser(user);
    const now = Date.now();
    const storyType = ["image", "video"].includes(type) ? type : "text";
    const story = normalizeStory({
      id: randomUUID(),
      type: storyType,
      text,
      media: storyType === "text" ? "" : media,
      name,
      mime,
      music,
      createdAt: now,
      expiresAt: now + STORY_TTL_MS
    });

    const state = clone(normalized.state);
    state.stories = [story, ...(state.stories || []).map((item) => normalizeStory(item)).filter(Boolean)]
      .filter(Boolean)
      .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index)
      .slice(0, 8);

    const savedUser = await this.saveState(normalized, state);
    return {
      state: await this.publicState(savedUser),
      viewerStates: await this.matchedUserStates(savedUser)
    };
  }

  async deleteStory(user, storyId = "") {
    const normalized = normalizeUser(user);
    const state = clone(normalized.state);
    const id = String(storyId || "");
    state.stories = (state.stories || [])
      .map((story) => normalizeStory(story))
      .filter(Boolean)
      .filter((story) => (id ? story.id !== id : false));

    const savedUser = await this.saveState(normalized, state);
    return {
      state: await this.publicState(savedUser),
      viewerStates: await this.matchedUserStates(savedUser)
    };
  }

  async viewStory(user, { profileId = "", storyId = "" }) {
    const viewer = normalizeUser(user);
    const targetId = String(profileId || "");
    if (!targetId || !storyId) {
      const error = new Error("Choose a story to view.");
      error.status = 400;
      throw error;
    }

    const target = targetId === viewer.id ? viewer : await this.findUserById(targetId);
    if (!target) {
      const error = new Error("Story owner was not found.");
      error.status = 404;
      throw error;
    }

    const targetUser = normalizeUser(target);
    const state = clone(targetUser.state);
    let found = false;
    let changed = false;
    state.stories = (state.stories || [])
      .map((item) => {
        const story = normalizeStory(item);
        if (!story) return null;
        if (story.id !== storyId) return story;

        found = true;
        if (targetUser.id === viewer.id) return story;
        changed = true;
        return {
          ...story,
          views: {
            ...(story.views || {}),
            [viewer.id]: Date.now()
          }
        };
      })
      .filter(Boolean);

    if (!found) {
      const error = new Error("Story is no longer available.");
      error.status = 404;
      throw error;
    }

    if (!changed) {
      return { state: await this.publicState(viewer), viewerStates: [] };
    }

    const savedTarget = await this.saveState(targetUser, state);
    const viewerStates = await this.matchedUserStates(savedTarget);
    viewerStates.push({
      userId: savedTarget.id,
      state: await this.publicState(savedTarget)
    });

    const seen = new Set();
    return {
      state: await this.publicState(viewer),
      viewerStates: viewerStates.filter((item) => {
        if (!item?.userId || seen.has(item.userId)) return false;
        seen.add(item.userId);
        return true;
      })
    };
  }

  async replyToStory(user, { profileId = "", storyId = "", text = "" }) {
    const sender = normalizeUser(user);
    const targetId = String(profileId || "");
    const message = String(text || "").trim().slice(0, 240);
    if (!targetId || !storyId || !message) {
      const error = new Error("Write a reply to send.");
      error.status = 400;
      throw error;
    }

    const target = targetId === sender.id ? sender : await this.findUserById(targetId);
    if (!target) {
      const error = new Error("Story owner was not found.");
      error.status = 404;
      throw error;
    }

    const targetUser = normalizeUser(target);
    const state = clone(targetUser.state);
    let found = false;
    state.stories = (state.stories || [])
      .map((item) => {
        const story = normalizeStory(item);
        if (!story) return null;
        if (story.id !== storyId) return story;

        found = true;
        const views = { ...(story.views || {}) };
        if (targetUser.id !== sender.id) views[sender.id] = Date.now();
        return {
          ...story,
          views,
          replies: [
            ...(Array.isArray(story.replies) ? story.replies : []),
            {
              id: randomUUID(),
              userId: sender.id,
              text: message,
              createdAt: Date.now()
            }
          ].slice(-80)
        };
      })
      .filter(Boolean);

    if (!found) {
      const error = new Error("Story is no longer available.");
      error.status = 404;
      throw error;
    }

    const storyPreview = messageStoryReplyPreview({
      id: state.stories.find((story) => story?.id === storyId)?.id || storyId,
      ownerId: targetUser.id,
      ownerName: firstName(targetUser.state.user.fullName, targetUser.email),
      ...(state.stories.find((story) => story?.id === storyId) || {}),
      replyText: message
    });
    const savedTarget = await this.saveState(targetUser, state);
    let messageResult = null;
    if (savedTarget.id !== sender.id) {
      messageResult = await this.sendMessage(sender, {
        profileId: savedTarget.id,
        text: message,
        senderText: `You replied to ${firstName(targetUser.state.user.fullName, targetUser.email)}'s story`,
        recipientText: `${firstName(sender.state.user.fullName, sender.email)} replied to your story`,
        storyReply: storyPreview
      });
    }

    const finalTarget = await this.findUserById(savedTarget.id);
    const ownerState = messageResult?.recipientState || await this.publicState(finalTarget || savedTarget);
    const requesterState =
      messageResult?.senderState ||
      (savedTarget.id === sender.id ? await this.publicState(savedTarget) : await this.publicState(sender));
    const viewerStates = await this.matchedUserStates(finalTarget || savedTarget);
    if (savedTarget.id !== sender.id) {
      viewerStates.push({
        userId: savedTarget.id,
        state: ownerState
      });
    }

    const seen = new Set();
    return {
      state: requesterState,
      viewerStates: viewerStates.filter((item) => {
        if (!item?.userId || seen.has(item.userId)) return false;
        seen.add(item.userId);
        return true;
      })
    };
  }

  async reactToStory(user, { profileId = "", storyId = "", reaction = "" }) {
    const normalized = normalizeUser(user);
    const targetId = String(profileId || normalized.id);
    const target = targetId === normalized.id ? normalized : await this.findUserById(targetId);
    if (!target) {
      const error = new Error("Story owner was not found.");
      error.status = 404;
      throw error;
    }

    const targetUser = normalizeUser(target);
    const state = clone(targetUser.state);
    let found = false;
    state.stories = (state.stories || [])
      .map((item) => {
        const story = normalizeStory(item);
        if (!story) return null;
        if (story.id !== storyId) return story;

        found = true;
        const reactions = { ...(story.reactions || {}) };
        if (!reaction || reactions[normalized.id] === reaction) delete reactions[normalized.id];
        else reactions[normalized.id] = reaction;
        return { ...story, reactions };
      })
      .filter(Boolean);

    if (!found) {
      const error = new Error("Story is no longer available.");
      error.status = 404;
      throw error;
    }

    const savedTarget = await this.saveState(targetUser, state);
    const requesterState = savedTarget.id === normalized.id
      ? await this.publicState(savedTarget)
      : await this.publicState(normalized);
    const viewerStates = await this.matchedUserStates(savedTarget);
    if (savedTarget.id !== normalized.id) {
      viewerStates.push({
        userId: savedTarget.id,
        state: await this.publicState(savedTarget)
      });
    }

    const seen = new Set();
    return {
      state: requesterState,
      viewerStates: viewerStates.filter((item) => {
        if (!item?.userId || seen.has(item.userId)) return false;
        seen.add(item.userId);
        return true;
      })
    };
  }

  async blockUser(user, { profileId = "" }) {
    const normalized = normalizeUser(user);
    const targetId = String(profileId || "");
    if (!targetId || targetId === normalized.id) {
      const error = new Error("Choose a user to block.");
      error.status = 400;
      throw error;
    }

    const recipient = await this.findUserById(targetId);
    if (!recipient) {
      const error = new Error("This profile is no longer available.");
      error.status = 404;
      throw error;
    }

    const now = Date.now();
    const state = clone(normalized.state);
    state.blockedIds = Array.from(new Set([...(state.blockedIds || []), targetId]));
    state.likedIds = (state.likedIds || []).filter((id) => id !== targetId);
    state.passedIds = Array.from(new Set([...(state.passedIds || []), targetId]));
    state.matches = (state.matches || []).map((match) =>
      match.profileId === targetId
        ? { ...match, archivedAt: 0, deletedAt: now, blockedAt: now, blockedBy: normalized.id }
        : match
    );

    const recipientState = clone(normalizeUser(recipient).state);
    recipientState.matches = (recipientState.matches || []).map((match) =>
      match.profileId === normalized.id
        ? { ...match, archivedAt: 0, deletedAt: now, blockedAt: now, blockedBy: normalized.id }
        : match
    );

    const [savedSender, savedRecipient] = await Promise.all([
      this.saveState(normalized, state),
      this.saveState(recipient, recipientState)
    ]);

    return {
      senderId: savedSender.id,
      recipientId: savedRecipient.id,
      senderState: await this.publicState(savedSender),
      recipientState: await this.publicState(savedRecipient)
    };
  }

  async recordSwipe(user, { profileId, action }) {
    const normalized = normalizeUser(user);
    const recipient = action === "pass" ? null : await this.findUserById(profileId);
    if (
      normalized.state.blockedIds.includes(profileId) ||
      recipient?.state?.blockedIds?.includes(normalized.id)
    ) {
      const error = new Error("This profile is unavailable.");
      error.status = 403;
      throw error;
    }
    const state = clone(normalized.state);

    if (action === "pass") {
      state.passedIds = Array.from(new Set([...state.passedIds, profileId]));
      state.likedIds = state.likedIds.filter((id) => id !== profileId);
    } else {
      state.likedIds = Array.from(new Set([...state.likedIds, profileId]));
      state.passedIds = state.passedIds.filter((id) => id !== profileId);
    }

    const savedSender = await this.saveState(normalized, state);

    if (recipient?.state.likedIds.includes(normalized.id)) {
      return { ...(await this.createMatch(savedSender, profileId)), matched: true };
    }

    return {
      matched: false,
      senderId: savedSender.id,
      recipientId: recipient?.id || null,
      senderState: await this.publicState(savedSender),
      recipientState: recipient ? await this.publicState(recipient) : null
    };
  }

  async createMatch(user, profileId) {
    const normalized = normalizeUser(user);
    const recipient = await this.findUserById(profileId);
    if (!recipient) {
      const error = new Error("This profile is no longer available.");
      error.status = 404;
      throw error;
    }
    const normalizedRecipient = normalizeUser(recipient);
    if (
      normalized.state.blockedIds.includes(profileId) ||
      normalizedRecipient.state.blockedIds.includes(normalized.id)
    ) {
      const error = new Error("This profile is unavailable.");
      error.status = 403;
      throw error;
    }

    const state = upsertMatch(clone(normalized.state), profileId);
    const savedSender = await this.saveState(normalized, state);

    const recipientState = upsertMatch(clone(normalizedRecipient.state), normalized.id);
    const savedRecipient = await this.saveState(normalizedRecipient, recipientState);

    return {
      senderId: savedSender.id,
      recipientId: savedRecipient.id,
      senderState: await this.publicState(savedSender),
      recipientState: await this.publicState(savedRecipient)
    };
  }

  async markConversationRead(user, profileId) {
    const normalized = normalizeUser(user);
    const readAt = Date.now();
    const match = normalized.state.matches.find((item) => item.profileId === profileId);
    const readMessageIds = (match?.messages || [])
      .filter((message) => message.from === "them" && !message.readAt)
      .map((message) => message.id);

    if (readMessageIds.length === 0) {
      return {
        senderId: normalized.id,
        recipientId: profileId,
        senderState: await this.publicState(normalized, { includeFeed: false }),
        recipientState: null
      };
    }

    const savedSender = await this.saveState(normalized, markRead(clone(normalized.state), profileId, readAt));
    const recipient = await this.findUserById(profileId);
    let savedRecipient = null;

    if (recipient && normalized.state.privacy.readReceipts !== false) {
      savedRecipient = await this.saveState(
        recipient,
        markSentSeen(clone(recipient.state), normalized.id, readMessageIds, readAt)
      );
    }

    return {
      senderId: savedSender.id,
      recipientId: savedRecipient?.id || null,
      senderState: await this.publicState(savedSender, { includeFeed: false }),
      recipientState: savedRecipient ? await this.publicState(savedRecipient, { includeFeed: false }) : null
    };
  }

  async appendMessagesToUser(user, profileId, messages, profile = null) {
    const normalized = normalizeUser(user);
    const state = clone(normalized.state);
    for (const message of messages) {
      appendMessage(state, profileId, message, profile);
    }
    return this.saveState(normalized, state);
  }

  async sendMessage(sender, { profileId, text, messageId, type = "text", media = "", name = "", mime = "", storyReply = null, replyTo = null, senderText = "", recipientText = "" }) {
    const normalizedSender = normalizeUser(sender);
    const senderMatch = normalizedSender.state.matches.find(
      (match) => match.profileId === profileId && !match.blockedAt && !match.deletedAt
    );
    if (!senderMatch) {
      const error = new Error("Messages are available after you match.");
      error.status = 403;
      throw error;
    }
    const recipient = await this.findUserById(profileId);
    const normalizedRecipient = recipient ? normalizeUser(recipient) : null;
    if (
      normalizedSender.state.blockedIds.includes(profileId) ||
      normalizedRecipient?.state.blockedIds.includes(normalizedSender.id)
    ) {
      const error = new Error("This conversation is blocked.");
      error.status = 403;
      throw error;
    }
    const now = Date.now();
    const id = messageId || randomUUID();
    const conversationId = conversationIdFor(normalizedSender.id, profileId);
    const replyPreview = messageStoryReplyPreview(storyReply);
    let quotedMessage = null;
    if (replyTo?.id) {
      const sourceMessage = (senderMatch.messages || []).find((message) => message.id === replyTo.id && !message.unsent);
      if (!sourceMessage) {
        const error = new Error("The message you are replying to is no longer available.");
        error.status = 400;
        throw error;
      }
      quotedMessage = {
        id: sourceMessage.id,
        text: String(sourceMessage.text || sourceMessage.name || "Attachment").slice(0, 180),
        senderId: sourceMessage.senderId || (sourceMessage.from === "me" ? normalizedSender.id : profileId),
        type: ["text", "image", "video", "audio", "file"].includes(sourceMessage.type) ? sourceMessage.type : "text"
      };
    }
    const baseMessage = {
      id,
      text,
      ts: now,
      senderId: normalizedSender.id,
      profileId,
      conversationId,
      status: "sent",
      deliveredAt: normalizedRecipient ? now : 0,
      type,
      reactions: {},
      ...(replyPreview ? { storyReply: replyPreview } : {}),
      ...(quotedMessage ? { replyTo: quotedMessage } : {}),
      ...(type !== "text" ? { media, name, mime } : {})
    };
    const senderMessage = { ...baseMessage, text: senderText || text, from: "me" };

    if (recipient) {
      const recipientMessage = { ...baseMessage, profileId: normalizedSender.id, text: recipientText || text, from: "them" };
      const [savedSender, savedRecipient] = await Promise.all([
        this.appendMessagesToUser(normalizedSender, normalizedRecipient.id, [senderMessage]),
        this.appendMessagesToUser(normalizedRecipient, normalizedSender.id, [recipientMessage])
      ]);

      return {
        senderId: normalizedSender.id,
        recipientId: normalizedRecipient.id,
        conversationId,
        senderMessage,
        recipientMessage,
        senderState: await this.publicState(savedSender, { includeFeed: false }),
        recipientState: await this.publicState(savedRecipient, { includeFeed: false })
      };
    }

    const error = new Error("This conversation is no longer available.");
    error.status = 404;
    throw error;
  }

  async patchMessagePair(user, profileId, messageId, ownUpdater, recipientUpdater, { requireOwnMessage = false, ownershipError = "You can only change your own messages." } = {}) {
    const normalized = normalizeUser(user);
    const recipient = await this.findUserById(profileId);
    const ownState = clone(normalized.state);
    const ownMatch = ownState.matches.find((match) => match.profileId === profileId);
    const ownMessage = ownMatch?.messages?.find((message) => message.id === messageId);

    if (!ownMessage) {
      const error = new Error("Message not found.");
      error.status = 404;
      throw error;
    }
    if (requireOwnMessage && ownMessage.from !== "me") {
      const error = new Error(ownershipError);
      error.status = 403;
      throw error;
    }

    const ownResult = updateMessage(ownState, profileId, messageId, ownUpdater);
    const savedSender = await this.saveState(normalized, ownResult.state);
    let savedRecipient = null;

    if (recipient) {
      const recipientState = clone(recipient.state);
      const recipientResult = updateMessage(recipientState, normalized.id, messageId, recipientUpdater);
      if (recipientResult.changed) {
        savedRecipient = await this.saveState(recipient, recipientResult.state);
      }
    }

    return {
      senderId: savedSender.id,
      recipientId: savedRecipient?.id || null,
      senderState: await this.publicState(savedSender, { includeFeed: false }),
      recipientState: savedRecipient ? await this.publicState(savedRecipient, { includeFeed: false }) : null
    };
  }

  async reactToMessage(user, { profileId, messageId, reaction }) {
    const toggleReaction = (message, key) => {
      if (message.unsent) return message;
      const reactions = { ...(message.reactions || {}) };
      if (!reaction || reactions[key] === reaction) delete reactions[key];
      else reactions[key] = reaction;
      return { ...message, reactions };
    };

    return this.patchMessagePair(
      user,
      profileId,
      messageId,
      (message) => toggleReaction(message, "me"),
      (message) => toggleReaction(message, "them")
    );
  }

  async unsendMessage(user, { profileId, messageId }) {
    const markUnsent = (message) => ({
      ...message,
      text: "",
      media: "",
      name: "",
      mime: "",
      type: "text",
      reactions: {},
      unsent: true,
      unsentAt: Date.now()
    });

    return this.patchMessagePair(user, profileId, messageId, markUnsent, markUnsent, {
      requireOwnMessage: true,
      ownershipError: "You can only unsend your own messages."
    });
  }

  async editMessage(user, { profileId, messageId, text }) {
    const normalized = normalizeUser(user);
    const message = normalized.state.matches
      .find((match) => match.profileId === profileId)
      ?.messages?.find((item) => item.id === messageId);
    if (message?.unsent || (message && message.type !== "text")) {
      const error = new Error("Only active text messages can be edited.");
      error.status = 400;
      throw error;
    }
    const updateText = (message) => ({
      ...message,
      text,
      editedAt: Date.now()
    });

    return this.patchMessagePair(user, profileId, messageId, updateText, updateText, {
      requireOwnMessage: true,
      ownershipError: "You can only edit your own messages."
    });
  }

  async removeMessageForUser(user, { profileId, messageId }) {
    const normalized = normalizeUser(user);
    const state = clone(normalized.state);
    state.matches = state.matches.map((match) =>
      match.profileId === profileId
        ? {
            ...match,
            messages: (match.messages || []).filter((message) => message.id !== messageId),
            pinnedMessageIds: (match.pinnedMessageIds || []).filter((id) => id !== messageId)
          }
        : match
    );
    const savedUser = await this.saveState(normalized, state);
    return this.publicState(savedUser, { includeFeed: false });
  }

  async togglePinnedMessage(user, { profileId, messageId, pinned }) {
    const normalized = normalizeUser(user);
    const state = clone(normalized.state);
    const match = state.matches.find((item) => item.profileId === profileId);
    if (!match) {
      const error = new Error("Conversation not found.");
      error.status = 404;
      throw error;
    }

    const messages = Array.isArray(match.messages) ? match.messages : [];
    const message = messages.find((item) => item.id === messageId);
    if (pinned && (!message || message.unsent)) {
      const error = new Error("Message not found.");
      error.status = 404;
      throw error;
    }

    const pinnedIds = Array.isArray(match.pinnedMessageIds)
      ? match.pinnedMessageIds.map((id) => String(id || "").slice(0, 120)).filter(Boolean)
      : [];
    const nextPinnedIds = pinned
      ? [...pinnedIds.filter((id) => id !== messageId), messageId]
      : pinnedIds.filter((id) => id !== messageId);
    const existingMessageIds = new Set(messages.filter((item) => !item.unsent).map((item) => item.id));

    state.matches = state.matches.map((item) =>
      item.profileId === profileId
        ? {
            ...item,
            pinnedMessageIds: nextPinnedIds.filter((id) => existingMessageIds.has(id)).slice(-80)
          }
        : item
    );

    const savedUser = await this.saveState(normalized, state);
    return this.publicState(savedUser, { includeFeed: false });
  }

  async archiveConversation(user, { profileId, archived = true }) {
    const normalized = normalizeUser(user);
    const state = clone(normalized.state);
    let changed = false;
    state.matches = state.matches.map((match) => {
      if (match.profileId !== profileId) return match;
      changed = true;
      return { ...match, archivedAt: archived ? Date.now() : 0, deletedAt: 0 };
    });

    if (!changed) {
      const error = new Error("Conversation not found.");
      error.status = 404;
      throw error;
    }

    const savedUser = await this.saveState(normalized, state);
    return this.publicState(savedUser, { includeFeed: false });
  }

  async deleteConversation(user, { profileId }) {
    const normalized = normalizeUser(user);
    const state = clone(normalized.state);
    let changed = false;
    state.matches = state.matches.map((match) => {
      if (match.profileId !== profileId) return match;
      changed = true;
      return { ...match, messages: [], pinnedMessageIds: [], archivedAt: 0, deletedAt: Date.now() };
    });

    if (!changed) {
      const error = new Error("Conversation not found.");
      error.status = 404;
      throw error;
    }

    const savedUser = await this.saveState(normalized, state);
    return this.publicState(savedUser, { includeFeed: false });
  }

  async createPost(user, { text, type = "text", media = "", name = "", mime = "", tags = [] }) {
    const normalized = normalizeUser(user);
    const now = Date.now();
    const post = {
      id: randomUUID(),
      authorId: normalized.id,
      text: text || "",
      media: type === "text" ? null : { type, src: media, name, mime },
      tags: Array.isArray(tags) ? tags.filter(Boolean).slice(0, 8) : [],
      createdAt: now,
      updatedAt: now,
      reactions: {},
      comments: [],
      shares: []
    };

    await this.posts.insertOne(post);
    const events = await this.notifyMatchedUsersOfPost(normalized, post);
    return {
      state: await this.publicState(normalized),
      events
    };
  }

  async updatePost(user, { postId, text, tags }) {
    const normalized = normalizeUser(user);
    const post = await this.posts.findOne({ id: postId });
    if (!post) {
      const error = new Error("Post not found.");
      error.status = 404;
      throw error;
    }
    if (post.authorId !== normalized.id) {
      const error = new Error("You can only edit your own posts.");
      error.status = 403;
      throw error;
    }

    const updates = { updatedAt: Date.now() };
    if (text !== undefined) updates.text = text;
    if (tags !== undefined) updates.tags = Array.isArray(tags) ? tags.filter(Boolean).slice(0, 8) : [];

    await this.posts.updateOne({ id: postId }, { $set: updates });
    return {
      state: await this.publicState(normalized),
      events: []
    };
  }

  async deletePost(user, { postId }) {
    const normalized = normalizeUser(user);
    const post = await this.posts.findOne({ id: postId });
    if (!post) {
      const error = new Error("Post not found.");
      error.status = 404;
      throw error;
    }
    if (post.authorId !== normalized.id) {
      const error = new Error("You can only delete your own posts.");
      error.status = 403;
      throw error;
    }

    await this.posts.deleteOne({ id: postId });
    return {
      state: await this.publicState(normalized),
      events: []
    };
  }

  async reactToPost(user, { postId, reaction }) {
    const normalized = normalizeUser(user);
    const post = await this.posts.findOne({ id: postId });
    if (!post) {
      const error = new Error("Post not found.");
      error.status = 404;
      throw error;
    }

    const previousReaction = post.reactions?.[normalized.id] || "";
    const changed = previousReaction !== reaction;
    const update = reaction
      ? { $set: { [`reactions.${normalized.id}`]: reaction, updatedAt: Date.now() } }
      : { $unset: { [`reactions.${normalized.id}`]: "" }, $set: { updatedAt: Date.now() } };
    await this.posts.updateOne({ id: postId }, update);
    const events =
      changed && reaction && post.authorId !== normalized.id
        ? await this.addActivityEvents([post.authorId], () =>
            createActivityEvent("post_reaction", normalized, {
              postId,
              reaction,
              text: post.text || ""
            })
          )
        : [];
    return {
      state: await this.publicState(normalized),
      events
    };
  }

  async commentOnPost(user, { postId, text, parentCommentId = "" }) {
    const normalized = normalizeUser(user);
    const post = await this.posts.findOne({ id: postId });
    if (!post) {
      const error = new Error("Post not found.");
      error.status = 404;
      throw error;
    }

    const comment = {
      id: randomUUID(),
      authorId: normalized.id,
      text,
      createdAt: Date.now(),
      reactions: {},
      replies: []
    };

    if (parentCommentId) {
      const comments = Array.isArray(post.comments) ? post.comments : [];
      const parentComment = comments.find((item) => item.id === parentCommentId);
      const result = await this.posts.updateOne(
        { id: postId, "comments.id": parentCommentId },
        {
          $push: { "comments.$.replies": comment },
          $set: { updatedAt: Date.now() }
        }
      );
      if (result.matchedCount === 0) {
        const error = new Error("Comment not found.");
        error.status = 404;
        throw error;
      }
      const targetIds = [parentComment?.authorId, post.authorId].filter(
        (targetId) => targetId && targetId !== normalized.id
      );
      const events = await this.addActivityEvents(targetIds, () =>
        createActivityEvent("comment_reply", normalized, {
          postId,
          commentId: comment.id,
          parentCommentId,
          text
        })
      );
      return {
        state: await this.publicState(normalized),
        events
      };
    }

    await this.posts.updateOne(
      { id: postId },
      {
        $push: { comments: comment },
        $set: { updatedAt: Date.now() }
      }
    );
    const events =
      post.authorId !== normalized.id
        ? await this.addActivityEvents([post.authorId], () =>
            createActivityEvent("post_comment", normalized, {
              postId,
              commentId: comment.id,
              text
            })
          )
        : [];
    return {
      state: await this.publicState(normalized),
      events
    };
  }

  async reactToComment(user, { postId, commentId, parentCommentId = "", reaction }) {
    const normalized = normalizeUser(user);
    const post = await this.posts.findOne({ id: postId });
    if (!post) {
      const error = new Error("Post not found.");
      error.status = 404;
      throw error;
    }

    const comments = Array.isArray(post.comments) ? post.comments : [];
    const parentComment = parentCommentId
      ? comments.find((comment) => comment.id === parentCommentId)
      : null;
    const targetComment = parentCommentId
      ? parentComment?.replies?.find((reply) => reply.id === commentId)
      : comments.find((comment) => comment.id === commentId);

    if (!targetComment) {
      const error = new Error("Comment not found.");
      error.status = 404;
      throw error;
    }

    const reactionPath = parentCommentId
      ? `comments.$[comment].replies.$[reply].reactions.${normalized.id}`
      : `comments.$.reactions.${normalized.id}`;
    const update = reaction
      ? { $set: { [reactionPath]: reaction, updatedAt: Date.now() } }
      : { $unset: { [reactionPath]: "" }, $set: { updatedAt: Date.now() } };
    const options = parentCommentId
      ? { arrayFilters: [{ "comment.id": parentCommentId }, { "reply.id": commentId }] }
      : undefined;

    await this.posts.updateOne(
      parentCommentId ? { id: postId } : { id: postId, "comments.id": commentId },
      update,
      options
    );
    const events =
      reaction && targetComment.authorId !== normalized.id
        ? await this.addActivityEvents([targetComment.authorId], () =>
            createActivityEvent("comment_reaction", normalized, {
              postId,
              commentId,
              parentCommentId,
              reaction,
              text: targetComment.text || ""
            })
          )
        : [];
    return {
      state: await this.publicState(normalized),
      events
    };
  }

  async sharePost(user, { postId }) {
    const normalized = normalizeUser(user);
    const post = await this.posts.findOne({ id: postId });
    if (!post) {
      const error = new Error("Post not found.");
      error.status = 404;
      throw error;
    }

    const shares = Array.isArray(post.shares) ? post.shares : [];
    const alreadyShared = shares.some((share) => share.userId === normalized.id);
    if (!alreadyShared) {
      await this.posts.updateOne(
        { id: postId },
        {
          $push: { shares: { userId: normalized.id, createdAt: Date.now() } },
          $set: { updatedAt: Date.now() }
        }
      );
    }
    const events =
      !alreadyShared && post.authorId !== normalized.id
        ? await this.addActivityEvents([post.authorId], () =>
            createActivityEvent("post_share", normalized, {
              postId,
              text: post.text || ""
            })
          )
        : [];
    return {
      state: await this.publicState(normalized),
      events
    };
  }

  async listTickets(user) {
    return this.supportTickets
      .find({ userId: user.id })
      .project({ _id: 0 })
      .sort({ createdAt: -1 })
      .limit(25)
      .toArray();
  }

  async createTicket(user, { subject, message }) {
    const ticket = {
      id: `FL-${Math.floor(1000 + Math.random() * 9000)}`,
      userId: user.id,
      email: user.email,
      subject,
      message,
      status: "open",
      createdAt: Date.now()
    };
    await this.supportTickets.insertOne(ticket);
    return ticket;
  }
}
