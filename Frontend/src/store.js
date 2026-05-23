import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  connectRealtime,
  disconnectRealtime,
  jsonBody,
  markRealtimeConversationRead,
  reactRealtimePost,
  reactRealtimeMessage,
  removeRealtimeMessageForYou,
  sendRealtimeMessage,
  sendRealtimeTyping,
  setToken,
  unsendRealtimeMessage
} from "./api.js";

const DEFAULT_PROFILE_IMAGE = "/flame-logo.gif";
const REMOVED_BOT_IDS = new Set(["jessica", "emma", "sophia", "liam"]);
const legacyAssetMap = {
  "/src/assets/jessica.jpg": DEFAULT_PROFILE_IMAGE,
  "/src/assets/user-emma.jpg": DEFAULT_PROFILE_IMAGE,
  "/src/assets/user-sophia.jpg": DEFAULT_PROFILE_IMAGE,
  "/src/assets/user-male.jpg": DEFAULT_PROFILE_IMAGE
};

const fallbackState = {
  auth: {
    isAuthenticated: false,
    id: "",
    email: "",
    joinedAt: null,
    lastLoginAt: null
  },
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
  profiles: [],
  feed: [],
  events: []
};

let currentProfiles = [];
const profileCache = new Map();

function resolveAsset(value) {
  return legacyAssetMap[value] || value || DEFAULT_PROFILE_IMAGE;
}

function normalizeProfile(profile) {
  if (!profile?.id || REMOVED_BOT_IDS.has(String(profile.id))) return null;

  return {
    ...profile,
    image: resolveAsset(profile.image),
    activeStory: normalizeStory(profile.activeStory),
    interests: Array.isArray(profile.interests) ? profile.interests : [],
    details: Array.isArray(profile.details) ? profile.details : []
  };
}

function normalizeStory(story) {
  if (!story?.id) return null;
  const expiresAt = Number(story.expiresAt) || 0;
  if (expiresAt <= Date.now()) return null;

  const type = ["image", "video"].includes(story.type) ? story.type : "text";
  const text = String(story.text || "");
  const media = type === "text" ? "" : String(story.media || "");
  const rawMusic = story.music?.id && story.music?.title ? story.music : null;
  const musicSource = rawMusic?.source || "synth";
  const music = rawMusic
    ? {
        source: ["synth", "upload", "youtube"].includes(musicSource) ? musicSource : "synth",
        id: rawMusic.id,
        title: rawMusic.title,
        artist: rawMusic.artist || ""
      }
    : null;

  if (music?.source === "upload") {
    music.src = rawMusic.src || "";
    music.mime = rawMusic.mime || "";
  }

  if (music?.source === "youtube") {
    music.youtubeId = rawMusic.youtubeId || "";
    music.thumbnail = rawMusic.thumbnail || "";
  }

  if (music) {
    music.startAt = Math.max(0, Number(rawMusic.startAt) || 0);
    music.duration = 60;
  }

  if (type === "text" ? !text.trim() && !music : !media) return null;

  return {
    id: story.id,
    type,
    text,
    media,
    name: story.name || "",
    mime: story.mime || "",
    ...(music ? { music } : {}),
    reaction: story.reaction || "",
    reactionCounts: story.reactionCounts || {},
    viewCount: Number(story.viewCount) || 0,
    viewers: Array.isArray(story.viewers)
      ? story.viewers
          .map((viewer) => ({
            id: viewer.id || "",
            name: viewer.name || "Flame user",
            image: resolveAsset(viewer.image),
            online: Boolean(viewer.online),
            lastActiveAt: viewer.lastActiveAt || null,
            reaction: viewer.reaction || "",
            viewedAt: Number(viewer.viewedAt) || Date.now()
          }))
          .filter((viewer) => viewer.id)
      : [],
    reactionUsers: Array.isArray(story.reactionUsers)
      ? story.reactionUsers
          .map((item) => ({
            reaction: item?.reaction || "",
            user: {
              id: item?.user?.id || "",
              name: item?.user?.name || "Flame user",
              image: resolveAsset(item?.user?.image),
              online: Boolean(item?.user?.online),
              lastActiveAt: item?.user?.lastActiveAt || null
            }
          }))
          .filter((item) => item.reaction && item.user.id)
      : [],
    replies: Array.isArray(story.replies)
      ? story.replies
          .map((reply) => ({
            id: reply?.id || "",
            text: reply?.text || "",
            createdAt: Number(reply?.createdAt) || Date.now(),
            user: {
              id: reply?.user?.id || "",
              name: reply?.user?.name || "Flame user",
              image: resolveAsset(reply?.user?.image),
              online: Boolean(reply?.user?.online),
              lastActiveAt: reply?.user?.lastActiveAt || null
            }
          }))
          .filter((reply) => reply.id && reply.text && reply.user.id)
      : [],
    replyCount: Number(story.replyCount) || 0,
    createdAt: Number(story.createdAt) || Date.now(),
    expiresAt
  };
}

function normalizeComment(comment) {
  return {
    ...comment,
    text: comment.text || "",
    author: {
      id: comment.author?.id || "",
      name: comment.author?.name || "Flame user",
      image: resolveAsset(comment.author?.image),
      online: Boolean(comment.author?.online),
      lastActiveAt: comment.author?.lastActiveAt || null
    },
    reaction: comment.reaction || "",
    reactionCounts: comment.reactionCounts || {},
    reactionUsers: Array.isArray(comment.reactionUsers)
      ? comment.reactionUsers
          .map((item) => ({
            reaction: item.reaction || "",
            user: {
              id: item.user?.id || "",
              name: item.user?.name || "Flame user",
              image: resolveAsset(item.user?.image),
              online: Boolean(item.user?.online),
              lastActiveAt: item.user?.lastActiveAt || null
            }
          }))
          .filter((item) => item.reaction && item.user.id)
      : [],
    replies: Array.isArray(comment.replies) ? comment.replies.map(normalizeComment) : []
  };
}

function normalizePost(post) {
  if (!post?.id) return null;
  return {
    ...post,
    text: post.text || "",
    media: post.media || null,
    tags: Array.isArray(post.tags) ? post.tags.filter(Boolean) : [],
    author: {
      id: post.author?.id || "",
      name: post.author?.name || "Flame user",
      image: resolveAsset(post.author?.image),
      online: Boolean(post.author?.online),
      lastActiveAt: post.author?.lastActiveAt || null
    },
    reaction: post.reaction || "",
    reactionCounts: post.reactionCounts || {},
    reactionUsers: Array.isArray(post.reactionUsers)
      ? post.reactionUsers
          .map((item) => ({
            reaction: item.reaction || "",
            user: {
              id: item.user?.id || "",
              name: item.user?.name || "Flame user",
              image: resolveAsset(item.user?.image),
              online: Boolean(item.user?.online),
              lastActiveAt: item.user?.lastActiveAt || null
            }
          }))
          .filter((item) => item.reaction && item.user.id)
      : [],
    comments: Array.isArray(post.comments) ? post.comments.map(normalizeComment) : [],
    commentCount: Number(post.commentCount) || 0,
    shareCount: Number(post.shareCount) || 0,
    sharedByMe: Boolean(post.sharedByMe),
    canManage: Boolean(post.canManage)
  };
}

function nextReactionCounts(counts = {}, previous = "", next = "") {
  const result = { ...counts };
  if (previous) result[previous] = Math.max(0, Number(result[previous] || 0) - 1);
  if (next) result[next] = Number(result[next] || 0) + 1;
  Object.keys(result).forEach((key) => result[key] <= 0 && delete result[key]);
  return result;
}

function viewerReactionUser(state, reaction) {
  const id = state.auth?.id || "";
  if (!id || !reaction) return null;
  return {
    reaction,
    user: {
      id,
      name: state.user?.fullName || state.auth?.email?.split("@")[0] || "You",
      image: resolveAsset(state.user?.image),
      online: true,
      lastActiveAt: Date.now()
    }
  };
}

function applyPostReactionToPost(post, reaction, state) {
  if (!post?.id) return post;
  const previous = post.reaction || "";
  const viewerId = state.auth?.id || "";
  const reactionUsers = Array.isArray(post.reactionUsers)
    ? post.reactionUsers.filter((item) => item.user?.id !== viewerId)
    : [];
  const viewer = viewerReactionUser(state, reaction);
  if (viewer) reactionUsers.unshift(viewer);

  return {
    ...post,
    reaction,
    reactionCounts: nextReactionCounts(post.reactionCounts || {}, previous, reaction),
    reactionUsers
  };
}

function normalizeActivityEvent(event) {
  if (!event?.id) return null;
  return {
    id: event.id,
    type: event.type || "activity",
    actor: {
      id: event.actor?.id || "",
      name: event.actor?.name || "Flame user",
      image: resolveAsset(event.actor?.image),
    },
    postId: event.postId || "",
    commentId: event.commentId || "",
    parentCommentId: event.parentCommentId || "",
    reaction: event.reaction || "",
    text: event.text || "",
    createdAt: Number(event.createdAt) || Date.now(),
    readAt: Number(event.readAt) || 0
  };
}

function mergeState(next) {
  const user = { ...fallbackState.user, ...(next?.user || {}) };
  user.image = resolveAsset(user.image);
  user.interests = Array.isArray(user.interests)
    ? Array.from(new Set(user.interests.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, 12)
    : [];
  user.zodiacSign = user.zodiacSign || "";
  user.onboardingCompleted = Boolean(user.onboardingCompleted);
  if (Array.isArray(user.media)) {
    user.media = user.media.map(resolveAsset);
  }

  const matches = Array.isArray(next?.matches)
    ? next.matches
        .filter((match) => !REMOVED_BOT_IDS.has(String(match.profileId)))
        .filter((match) => !match.blockedAt)
        .map((match) => ({
          ...match,
          archivedAt: Number(match.archivedAt) || 0,
          deletedAt: Number(match.deletedAt) || 0,
          blockedAt: Number(match.blockedAt) || 0,
          blockedBy: match.blockedBy || "",
          messages: Array.isArray(match.messages) ? match.messages : [],
          pinnedMessageIds: Array.isArray(match.pinnedMessageIds)
            ? Array.from(new Set(match.pinnedMessageIds.map(String).filter(Boolean))).slice(0, 80)
            : []
        }))
    : [];
  const mergedProfiles = new Map(profileCache);
  for (const match of matches) {
    const profile = normalizeProfile(match.profile);
    if (profile) mergedProfiles.set(profile.id, profile);
  }
  for (const profile of Array.isArray(next?.profiles) ? next.profiles : []) {
    const normalized = normalizeProfile(profile);
    if (normalized) mergedProfiles.set(normalized.id, normalized);
  }
  currentProfiles = Array.from(mergedProfiles.values());
  profileCache.clear();
  for (const profile of currentProfiles) {
    profileCache.set(profile.id, profile);
  }

  const state = {
    ...fallbackState,
    ...next,
    auth: { ...fallbackState.auth, ...(next?.auth || {}) },
    privacy: { ...fallbackState.privacy, ...(next?.privacy || {}) },
    user,
    likedIds: Array.isArray(next?.likedIds)
      ? next.likedIds.filter((id) => !REMOVED_BOT_IDS.has(String(id)))
      : [],
    passedIds: Array.isArray(next?.passedIds)
      ? next.passedIds.filter((id) => !REMOVED_BOT_IDS.has(String(id)))
      : [],
    blockedIds: Array.isArray(next?.blockedIds)
      ? Array.from(new Set(next.blockedIds.map(String).filter(Boolean)))
      : [],
    matches,
    stories: Array.isArray(next?.stories) ? next.stories.map(normalizeStory).filter(Boolean) : [],
    profiles: currentProfiles,
    feed: Array.isArray(next?.feed) ? next.feed.map(normalizePost).filter(Boolean) : [],
    events: Array.isArray(next?.events) ? next.events.map(normalizeActivityEvent).filter(Boolean) : []
  };
  delete state.verification;
  return state;
}

function offlineError(error) {
  return error?.status === 401
    ? "Please log in again."
    : "Cannot reach the Flame backend. Make sure the API server is running.";
}

export function useFlameStore() {
  const [state, setState] = useState(fallbackState);
  const [hydrated, setHydrated] = useState(false);
  const [lastError, setLastError] = useState("");
  const [typingByProfile, setTypingByProfile] = useState({});
  const postReactionQueue = useRef(new Map());

  const withPendingPostReactions = useCallback((nextState) => {
    const queue = postReactionQueue.current;
    if (!queue.size || !Array.isArray(nextState.feed)) return nextState;
    return {
      ...nextState,
      feed: nextState.feed.map((post) => {
        const pending = queue.get(post.id);
        return pending ? applyPostReactionToPost(post, pending.reaction, nextState) : post;
      })
    };
  }, []);

  const applyServerState = useCallback((nextState) => {
    setState(withPendingPostReactions(mergeState(nextState)));
    setLastError("");
  }, [withPendingPostReactions]);

  const applyFeed = useCallback((feed) => {
    setState((current) =>
      withPendingPostReactions({
        ...current,
        feed: Array.isArray(feed) ? feed.map(normalizePost).filter(Boolean) : []
      })
    );
    setLastError("");
  }, [withPendingPostReactions]);

  const request = useCallback(
    async (path, options, config = {}) => {
      try {
        const result = await api(path, options);
        if (result.state && !config.skipStateApply) applyServerState(result.state);
        return { ok: true, ...result };
      } catch (error) {
        const message = error.message || offlineError(error);
        setLastError(message);
        if (error.status === 401) {
          setToken("");
          setState((current) => ({
            ...current,
            auth: { ...current.auth, isAuthenticated: false }
          }));
        }
        return { ok: false, error: message };
      }
    },
    [applyServerState]
  );

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const result = await request("/session", { method: "GET" });
      if (!cancelled) {
        if (!result.ok) setState(fallbackState);
        setHydrated(true);
      }
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [request]);

  useEffect(() => {
    return () => {
      postReactionQueue.current.forEach((entry) => {
        if (entry.timer) window.clearTimeout(entry.timer);
      });
      postReactionQueue.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!state.auth.isAuthenticated) {
      disconnectRealtime();
      return undefined;
    }

    const socket = connectRealtime();
    const handleStateUpdate = (payload) => {
      if (payload?.state) applyServerState(payload.state);
    };
    const handlePresenceUpdate = ({ userId, online, lastActiveAt }) => {
      const status = {
        online: Boolean(online),
        ...(lastActiveAt ? { lastActiveAt } : {})
      };
      setState((current) => {
        const profiles = current.profiles.map((profile) =>
          profile.id === userId ? { ...profile, ...status } : profile
        );
        const matches = current.matches.map((match) =>
          match.profileId === userId
            ? {
                ...match,
                profile: match.profile ? { ...match.profile, ...status } : match.profile
              }
            : match
        );

        currentProfiles = profiles;
        profileCache.clear();
        for (const profile of profiles) profileCache.set(profile.id, profile);

        return { ...current, profiles, matches };
      });
    };
    const handleTypingUpdate = ({ profileId, typing }) => {
      if (!profileId) return;
      setTypingByProfile((current) => ({ ...current, [profileId]: Boolean(typing) }));
    };
    const handleFeedUpdate = async () => {
      const result = await request("/feed", { method: "GET" });
      if (result.feed) applyFeed(result.feed);
    };
    const handleConnect = () => setLastError("");
    const handleConnectError = (error) => {
      setLastError(error?.message || "Realtime messaging is unavailable.");
    };
    const pingPresence = () => socket.emit("presence:ping");

    socket.on("state:update", handleStateUpdate);
    socket.on("presence:update", handlePresenceUpdate);
    socket.on("typing:update", handleTypingUpdate);
    socket.on("feed:update", handleFeedUpdate);
    socket.on("connect", handleConnect);
    socket.on("connect_error", handleConnectError);
    pingPresence();
    const presenceTimer = window.setInterval(pingPresence, 30000);

    return () => {
      window.clearInterval(presenceTimer);
      socket.off("state:update", handleStateUpdate);
      socket.off("presence:update", handlePresenceUpdate);
      socket.off("typing:update", handleTypingUpdate);
      socket.off("feed:update", handleFeedUpdate);
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
    };
  }, [applyFeed, applyServerState, request, state.auth.isAuthenticated]);

  const login = useCallback(
    async ({ email, password }) => {
      try {
        const result = await api("/auth/login", {
          method: "POST",
          body: jsonBody({ email, password })
        });
        setToken(result.token);
        if (result.state) applyServerState(result.state);
        window.setTimeout(() => {
          request("/session", { method: "GET" });
        }, 0);
        return { ok: true, ...result };
      } catch (error) {
        const message = error.message || offlineError(error);
        setLastError(message);
        return { ok: false, error: message };
      }
    },
    [applyServerState, request]
  );

  const signup = useCallback(
    async (payload) => {
      const result = await request("/auth/signup", {
        method: "POST",
        body: jsonBody(payload)
      });
      if (result.ok) {
        setToken(result.token);
        window.setTimeout(() => {
          request("/session", { method: "GET" });
        }, 0);
      }
      return result;
    },
    [request]
  );

  const logout = useCallback(async () => {
    await request("/auth/logout", { method: "POST", body: jsonBody() });
    disconnectRealtime();
    setToken("");
    setState((current) => ({
      ...current,
      auth: { ...current.auth, isAuthenticated: false }
    }));
  }, [request]);

  const setLight = useCallback(
    (light) => {
      setState((current) => ({ ...current, light }));
      request("/theme", { method: "PATCH", body: jsonBody({ light }) });
    },
    [request]
  );

  const like = useCallback(
    (id, action = "like") => {
      setState((current) => ({
        ...current,
        likedIds: Array.from(new Set([...current.likedIds, id])),
        passedIds: current.passedIds.filter((passedId) => passedId !== id)
      }));
      request("/swipes", { method: "POST", body: jsonBody({ profileId: id, action }) });
    },
    [request]
  );

  const pass = useCallback(
    (id) => {
      setState((current) => ({
        ...current,
        passedIds: Array.from(new Set([...current.passedIds, id])),
        likedIds: current.likedIds.filter((likedId) => likedId !== id)
      }));
      request("/swipes", { method: "POST", body: jsonBody({ profileId: id, action: "pass" }) });
    },
    [request]
  );

  const addMatch = useCallback(
    (id) => {
      setState((current) => {
        if (current.matches.some((match) => match.profileId === id)) return current;
        return {
          ...current,
          matches: [{ profileId: id, matchedAt: Date.now(), messages: [], pinnedMessageIds: [] }, ...current.matches]
        };
      });
      request("/matches", { method: "POST", body: jsonBody({ profileId: id }) });
    },
    [request]
  );

  const sendMessage = useCallback(
    (profileId, content) => {
      const payload =
        typeof content === "string"
          ? { type: "text", text: content }
          : { type: content?.type || "text", ...content };
      const trimmed = String(payload.text || "").trim();
      const isMedia = ["image", "video", "audio"].includes(payload.type);
      const storyReply = payload.storyReply && typeof payload.storyReply === "object"
        ? {
            id: payload.storyReply.id || "",
            ownerId: payload.storyReply.ownerId || "",
            ownerName: payload.storyReply.ownerName || "Story",
            type: ["image", "video"].includes(payload.storyReply.type) ? payload.storyReply.type : "text",
            text: payload.storyReply.text || "",
            media: resolveAsset(payload.storyReply.media),
            name: payload.storyReply.name || "",
            replyText: payload.storyReply.replyText || "",
            createdAt: Number(payload.storyReply.createdAt) || Date.now()
          }
        : null;
      if ((!isMedia && !trimmed) || (isMedia && !payload.media)) return;

      const now = Date.now();
      const messageId = `${now}-${Math.random().toString(36).slice(2)}`;
      const message = {
        id: messageId,
        from: "me",
        text: trimmed,
        ts: now,
        type: payload.type,
        reactions: {},
        ...(storyReply ? { storyReply } : {}),
        ...(isMedia
          ? {
              media: payload.media,
              name: payload.name || "",
              mime: payload.mime || ""
            }
          : {})
      };
      setState((current) => ({
        ...current,
        matches: current.matches.map((match) =>
          match.profileId === profileId
            ? {
                ...match,
                messages: [...match.messages, message]
              }
            : match
        )
      }));

      sendRealtimeMessage({ profileId, messageId, ...message })
        .then((result) => {
          if (result.state) applyServerState(result.state);
        })
        .catch(() => {
          request("/messages", { method: "POST", body: jsonBody({ profileId, messageId, ...message }) });
        });
    },
    [applyServerState, request]
  );

  const patchMessageLocal = useCallback((profileId, messageId, updater) => {
    setState((current) => ({
      ...current,
      matches: current.matches.map((match) =>
        match.profileId === profileId
          ? {
              ...match,
              messages: match.messages.map((message) =>
                message.id === messageId ? updater(message) : message
              )
            }
          : match
      )
    }));
  }, []);

  const reactToMessage = useCallback(
    (profileId, messageId, reaction) => {
      patchMessageLocal(profileId, messageId, (message) => {
        const reactions = { ...(message.reactions || {}) };
        if (!reaction || reactions.me === reaction) delete reactions.me;
        else reactions.me = reaction;
        return { ...message, reactions };
      });

      reactRealtimeMessage({ profileId, messageId, reaction })
        .then((result) => {
          if (result.state) applyServerState(result.state);
        })
        .catch(() => {
          request("/messages/reactions", { method: "POST", body: jsonBody({ profileId, messageId, reaction }) });
        });
    },
    [applyServerState, patchMessageLocal, request]
  );

  const unsendMessage = useCallback(
    (profileId, messageId) => {
      patchMessageLocal(profileId, messageId, (message) => ({
        ...message,
        text: "",
        media: "",
        name: "",
        mime: "",
        type: "text",
        reactions: {},
        unsent: true,
        unsentAt: Date.now()
      }));

      unsendRealtimeMessage({ profileId, messageId })
        .then((result) => {
          if (result.state) applyServerState(result.state);
        })
        .catch(() => {
          request("/messages/unsend", { method: "POST", body: jsonBody({ profileId, messageId }) });
        });
    },
    [applyServerState, patchMessageLocal, request]
  );

  const removeMessageForYou = useCallback(
    (profileId, messageId) => {
      setState((current) => ({
        ...current,
        matches: current.matches.map((match) =>
          match.profileId === profileId
            ? {
                ...match,
                messages: match.messages.filter((message) => message.id !== messageId),
                pinnedMessageIds: (match.pinnedMessageIds || []).filter((id) => id !== messageId)
              }
            : match
        )
      }));

      removeRealtimeMessageForYou({ profileId, messageId })
        .then((result) => {
          if (result.state) applyServerState(result.state);
        })
        .catch(() => {
          request("/messages/remove-for-you", { method: "POST", body: jsonBody({ profileId, messageId }) });
        });
    },
    [applyServerState, request]
  );

  const togglePinnedMessage = useCallback(
    (profileId, messageId, pinned) => {
      setState((current) => ({
        ...current,
        matches: current.matches.map((match) => {
          if (match.profileId !== profileId) return match;
          const currentPins = Array.isArray(match.pinnedMessageIds) ? match.pinnedMessageIds : [];
          const pinnedMessageIds = pinned
            ? [...currentPins.filter((id) => id !== messageId), messageId].slice(-80)
            : currentPins.filter((id) => id !== messageId);
          return { ...match, pinnedMessageIds };
        })
      }));

      return request("/messages/pins", {
        method: "POST",
        body: jsonBody({ profileId, messageId, pinned })
      });
    },
    [request]
  );

  const archiveConversation = useCallback(
    (profileId, archived = true) => {
      const archivedAt = archived ? Date.now() : 0;
      setState((current) => ({
        ...current,
        matches: current.matches.map((match) =>
          match.profileId === profileId
            ? { ...match, archivedAt, deletedAt: 0 }
            : match
        )
      }));

      return request("/messages/archive", {
        method: "POST",
        body: jsonBody({ profileId, archived })
      });
    },
    [request]
  );

  const deleteConversation = useCallback(
    (profileId) => {
      setState((current) => ({
        ...current,
        matches: current.matches.map((match) =>
          match.profileId === profileId
            ? { ...match, messages: [], pinnedMessageIds: [], archivedAt: 0, deletedAt: Date.now() }
            : match
        )
      }));

      return request("/messages/delete-conversation", {
        method: "POST",
        body: jsonBody({ profileId })
      });
    },
    [request]
  );

  const blockUser = useCallback(
    (profileId) => {
      setState((current) => ({
        ...current,
        blockedIds: Array.from(new Set([...(current.blockedIds || []), profileId])),
        matches: current.matches.filter((match) => match.profileId !== profileId),
        profiles: current.profiles.filter((profile) => profile.id !== profileId),
        likedIds: current.likedIds.filter((id) => id !== profileId),
        passedIds: Array.from(new Set([...(current.passedIds || []), profileId]))
      }));

      return request("/blocks", {
        method: "POST",
        body: jsonBody({ profileId })
      });
    },
    [request]
  );

  const readConversation = useCallback(
    (profileId) => {
      if (!profileId) return;
      setTypingByProfile((current) => ({ ...current, [profileId]: false }));
      markRealtimeConversationRead({ profileId })
        .then((result) => {
          if (result.state) applyServerState(result.state);
        })
        .catch(() => {
          request("/messages/read", { method: "POST", body: jsonBody({ profileId }) });
        });
    },
    [applyServerState, request]
  );

  const sendTypingStatus = useCallback((profileId, typing) => {
    if (!profileId) return;
    sendRealtimeTyping({ profileId, typing });
  }, []);

  const setUserProfile = useCallback(
    async (updates, options = {}) => {
      if (options.optimistic !== false) {
        setState((current) => ({ ...current, user: { ...current.user, ...updates } }));
      }
      return request("/profile", { method: "PATCH", body: jsonBody(updates) });
    },
    [request]
  );

  const updatePrivacy = useCallback(
    (updates) => {
      setState((current) => ({ ...current, privacy: { ...current.privacy, ...updates } }));
      request("/privacy", { method: "PATCH", body: jsonBody(updates) });
    },
    [request]
  );

  const createPost = useCallback(
    async (content) => {
      return request("/posts", {
        method: "POST",
        body: jsonBody(content)
      });
    },
    [request]
  );

  const updatePost = useCallback(
    async (postId, updates) => {
      return request("/posts", {
        method: "PATCH",
        body: jsonBody({ postId, ...updates })
      });
    },
    [request]
  );

  const deletePost = useCallback(
    async (postId) => {
      return request("/posts", {
        method: "DELETE",
        body: jsonBody({ postId })
      });
    },
    [request]
  );

  const reactToPost = useCallback(
    (postId, reaction) => {
      const safePostId = String(postId || "");
      const safeReaction = String(reaction || "");
      if (!safePostId) {
        return Promise.resolve({ ok: false, error: "Choose a post to react to." });
      }

      let foundPost = false;
      let rollbackPost = null;
      setState((current) => {
        const targetPost = current.feed.find((post) => post.id === safePostId);
        if (!targetPost) return current;
        foundPost = true;
        rollbackPost = targetPost;
        return {
          ...current,
          feed: current.feed.map((post) =>
            post.id === safePostId ? applyPostReactionToPost(post, safeReaction, current) : post
          )
        };
      });

      if (!foundPost) {
        return Promise.resolve({ ok: false, error: "Post not found." });
      }

      const queue = postReactionQueue.current;
      const existing = queue.get(safePostId);
      if (existing?.timer) window.clearTimeout(existing.timer);

      const entry = existing || {
        seq: 0,
        reaction: safeReaction,
        rollbackPost,
        resolvers: []
      };
      entry.seq += 1;
      entry.reaction = safeReaction;
      entry.rollbackPost = existing?.rollbackPost || rollbackPost;

      const promise = new Promise((resolve) => {
        entry.resolvers.push(resolve);
      });
      const seq = entry.seq;

      entry.timer = window.setTimeout(async () => {
        const active = queue.get(safePostId);
        if (!active || active.seq !== seq) return;

        active.timer = null;
        const sentReaction = active.reaction;
        let result;

        try {
          result = await reactRealtimePost({ postId: safePostId, reaction: sentReaction });
        } catch {
          result = await request(
            "/posts/reactions",
            {
              method: "POST",
              body: jsonBody({ postId: safePostId, reaction: sentReaction })
            },
            { skipStateApply: true }
          );
        }

        const latest = queue.get(safePostId);
        if (latest !== active || latest.seq !== seq) {
          active.resolvers.forEach((resolve) => resolve(result?.ok ? result : { ok: false, error: "Reaction superseded." }));
          return;
        }

        queue.delete(safePostId);

        if (result?.ok) {
          if (result.state) applyServerState(result.state);
          active.resolvers.forEach((resolve) => resolve({ ok: true, ...result }));
          return;
        }

        setState((current) => ({
          ...current,
          feed: current.feed.map((post) =>
            post.id === safePostId && post.reaction === sentReaction
              ? active.rollbackPost || post
              : post
          )
        }));
        active.resolvers.forEach((resolve) => resolve(result || { ok: false, error: "Reaction failed." }));
      }, 120);

      queue.set(safePostId, entry);
      return promise;
    },
    [applyServerState, request]
  );

  const commentOnPost = useCallback(
    async (postId, text, parentCommentId = "") => {
      return request("/posts/comments", {
        method: "POST",
        body: jsonBody({ postId, text, parentCommentId })
      });
    },
    [request]
  );

  const reactToComment = useCallback(
    async (postId, commentId, reaction, parentCommentId = "") => {
      return request("/posts/comments/reactions", {
        method: "POST",
        body: jsonBody({ postId, commentId, reaction, parentCommentId })
      });
    },
    [request]
  );

  const sharePost = useCallback(
    async (postId) => {
      return request("/posts/share", {
        method: "POST",
        body: jsonBody({ postId })
      });
    },
    [request]
  );

  const refreshFeed = useCallback(async () => {
    const result = await request("/feed", { method: "GET" });
    if (result.feed) applyFeed(result.feed);
    return result;
  }, [applyFeed, request]);

  const createStory = useCallback(
    async (content) => {
      return request("/stories", {
        method: "POST",
        body: jsonBody(content)
      });
    },
    [request]
  );

  const deleteStory = useCallback(
    async (storyId) => {
      return request("/stories", {
        method: "DELETE",
        body: jsonBody({ storyId })
      });
    },
    [request]
  );

  const reactToStory = useCallback(
    async (profileId, storyId, reaction) => {
      return request("/stories/reactions", {
        method: "POST",
        body: jsonBody({ profileId, storyId, reaction })
      });
    },
    [request]
  );

  const viewStory = useCallback(
    async (profileId, storyId) => {
      return request("/stories/views", {
        method: "POST",
        body: jsonBody({ profileId, storyId })
      });
    },
    [request]
  );

  const replyToStory = useCallback(
    async (profileId, storyId, text) => {
      return request("/stories/replies", {
        method: "POST",
        body: jsonBody({ profileId, storyId, text })
      });
    },
    [request]
  );

  const markEventsRead = useCallback(
    async () => {
      return request("/events/read", {
        method: "POST",
        body: jsonBody()
      });
    },
    [request]
  );

  const activateBoost = useCallback(
    async (durationMs) => {
      const result = await request("/boost", {
        method: "POST",
        body: jsonBody({ durationMs })
      });
      return result;
    },
    [request]
  );

  const createSupportTicket = useCallback(
    async ({ subject, message }) => {
      return request("/support-tickets", {
        method: "POST",
        body: jsonBody({ subject, message })
      });
    },
    [request]
  );

  return {
    state,
    hydrated,
    lastError,
    typingByProfile,
    login,
    signup,
    logout,
    setLight,
    like,
    pass,
    addMatch,
    sendMessage,
    reactToMessage,
    unsendMessage,
    removeMessageForYou,
    togglePinnedMessage,
    archiveConversation,
    deleteConversation,
    blockUser,
    readConversation,
    sendTypingStatus,
    setUserProfile,
    updatePrivacy,
    createPost,
    updatePost,
    deletePost,
    reactToPost,
    commentOnPost,
    reactToComment,
    sharePost,
    refreshFeed,
    createStory,
    deleteStory,
    reactToStory,
    viewStory,
    replyToStory,
    markEventsRead,
    activateBoost,
    createSupportTicket
  };
}

export function profileById(id) {
  if (REMOVED_BOT_IDS.has(String(id))) return null;
  return currentProfiles.find((p) => p.id === id) || profileCache.get(id);
}

export function profileForMatch(match) {
  if (!match?.profileId || REMOVED_BOT_IDS.has(String(match.profileId))) return null;

  return (
    profileById(match.profileId) ||
    normalizeProfile(match.profile) || {
      id: match.profileId,
      name: match.profile?.name || "Match",
      age: match.profile?.age || 18,
      image: resolveAsset(match.profile?.image),
      online: false,
      lastActiveAt: match.profile?.lastActiveAt || null,
      distance: match.profile?.distance || "Nearby",
      activeStory: normalizeStory(match.profile?.activeStory),
      likesYou: false,
      bio: match.profile?.bio || "Profile details are syncing.",
      prompt: match.profile?.prompt || "Start the conversation.",
      interests: Array.isArray(match.profile?.interests) ? match.profile.interests : [],
      details: Array.isArray(match.profile?.details)
        ? match.profile.details
        : [
            { label: "Location", value: match.profile?.distance || "Nearby" },
            { label: "Work", value: "Not shared" },
            { label: "School", value: "Not shared" },
            { label: "Looking for", value: "Not shared" }
          ]
    }
  );
}
