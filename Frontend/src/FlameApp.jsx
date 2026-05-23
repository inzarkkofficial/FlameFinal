import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import { Room, RoomEvent, Track, VideoPresets } from "livekit-client";
import { profileForMatch, useFlameStore } from "./store.js";
import { LoginPage, SignupPage } from "./AuthPages.jsx";
import { api, connectRealtime, createLiveKitCallToken, sendCallSignal } from "./api.js";
import { useTheme } from "./theme.jsx";
import { AppSurface, PageFrame } from "./ui.jsx";
import "./flame.css";
import "./auth.css";

const LOGO_SRC = "/flame-logo.gif";
const MATCH_BURST_MS = 2800;
const BOOST_MS = 20000;
const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_POST_MEDIA_BYTES = 10 * 1024 * 1024;
const MAX_STORY_MEDIA_BYTES = MAX_POST_MEDIA_BYTES;
const MAX_STORY_AUDIO_BYTES = 8 * 1024 * 1024;
const QUICK_REPLIES = [
  "Your profile caught my eye.",
  "Coffee this week?",
  "What is your perfect weekend?"
];
const REACTION_OPTIONS = ["❤️", "😂", "😮", "😢", "👍"];

const ONBOARDING_INTERESTS = [
  "Music",
  "Gaming",
  "Anime",
  "Travel",
  "Fitness",
  "Food",
  "Photography",
  "Movies",
  "Coding",
  "Fashion",
  "Sports",
  "Books"
];
const ZODIAC_SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces"
];
const NOTO_EMOJI_BASE = "https://fonts.gstatic.com/s/e/notoemoji/latest";
const FEED_REACTIONS = [
  { id: "love", label: "Heart", code: "2764_fe0f" },
  { id: "wow", label: "Wow", code: "1f62e" },
  { id: "laugh", label: "Haha", code: "1f602" },
  { id: "sad", label: "Cry", code: "1f622" },
  { id: "angry", label: "Angry", code: "1f620" },
  { id: "care", label: "Care", code: "1f917" }
];
const POST_MOOD_OPTIONS = [
  { id: "soft", label: "Soft" },
  { id: "playful", label: "Playful" },
  { id: "date-night", label: "Date night" },
  { id: "adventurous", label: "Adventurous" }
];
const PROFILE_BACKGROUND_PRESETS = [
  { id: "blush", label: "Blush", value: "linear-gradient(135deg, #fff1f5 0%, #ffd7e5 48%, #fffaf7 100%)" },
  { id: "sunrise", label: "Sunrise", value: "linear-gradient(135deg, #fff0da 0%, #ff9fb3 48%, #fff8fb 100%)" },
  { id: "rose", label: "Rose", value: "radial-gradient(circle at 28% 24%, #ff9fbc 0%, #fff2f6 38%, #fffaf8 100%)" },
  { id: "clean", label: "Clean", value: "linear-gradient(135deg, #ffffff 0%, #fff6f9 100%)" }
];
const STORY_MUSIC_LIBRARY = [
  {
    id: "neon-heart",
    source: "synth",
    title: "Neon Heart",
    artist: "Flame Originals",
    tags: ["pop", "bright", "romance", "upbeat"],
    bpm: 104,
    chords: [["C4", "E4", "G4"], ["G3", "B3", "D4"], ["A3", "C4", "E4"], ["F3", "A3", "C4"]],
    bass: ["C2", "G2", "A2", "F2"],
    melody: ["E5", "G5", "B4", "C5"]
  },
  {
    id: "midnight-chat",
    source: "synth",
    title: "Midnight Chat",
    artist: "Flame Originals",
    tags: ["lofi", "chill", "night", "soft"],
    bpm: 82,
    chords: [["D3", "F3", "A3"], ["A2", "C3", "E3"], ["B2", "D3", "F3"], ["G2", "B2", "D3"]],
    bass: ["D2", "A1", "B1", "G1"],
    melody: ["A4", "F4", "D4", "E4"]
  },
  {
    id: "sunset-pulse",
    source: "synth",
    title: "Sunset Pulse",
    artist: "Flame Originals",
    tags: ["dance", "warm", "travel", "feel good"],
    bpm: 118,
    chords: [["F3", "A3", "C4"], ["C4", "E4", "G4"], ["D3", "F3", "A3"], ["B2", "D3", "G3"]],
    bass: ["F2", "C2", "D2", "G1"],
    melody: ["C5", "E5", "A4", "G4"]
  },
  {
    id: "soft-launch",
    source: "synth",
    title: "Soft Launch",
    artist: "Flame Originals",
    tags: ["acoustic", "sweet", "date", "calm"],
    bpm: 92,
    chords: [["G3", "B3", "D4"], ["E3", "G3", "B3"], ["C3", "E3", "G3"], ["D3", "F3", "A3"]],
    bass: ["G2", "E2", "C2", "D2"],
    melody: ["B4", "D5", "G4", "A4"]
  },
  {
    id: "main-character",
    source: "synth",
    title: "Main Character",
    artist: "Flame Originals",
    tags: ["bold", "cinematic", "confident", "glow"],
    bpm: 96,
    chords: [["A3", "C4", "E4"], ["F3", "A3", "C4"], ["C4", "E4", "G4"], ["G3", "B3", "D4"]],
    bass: ["A2", "F2", "C2", "G2"],
    melody: ["E5", "C5", "G5", "B4"]
  }
];

const DETAIL_LABELS = {
  Location: "pin",
  Zodiac: "star",
  Work: "work",
  School: "school",
  "Looking for": "heart"
};
const COMMON_LOCATIONS = [
  "Manila, Philippines",
  "Quezon City, Philippines",
  "Caloocan, Philippines",
  "Makati, Philippines",
  "Taguig, Philippines",
  "Pasig, Philippines",
  "Pasay, Philippines",
  "Paranaque, Philippines",
  "Mandaluyong, Philippines",
  "Marikina, Philippines",
  "Las Pinas, Philippines",
  "Muntinlupa, Philippines",
  "Valenzuela, Philippines",
  "Cebu City, Philippines",
  "Davao City, Philippines",
  "Baguio, Philippines",
  "Iloilo City, Philippines",
  "Bacolod, Philippines",
  "Cagayan de Oro, Philippines",
  "General Santos, Philippines",
  "Zamboanga City, Philippines",
  "San Fernando, Pampanga",
  "Angeles City, Pampanga",
  "Antipolo, Rizal",
  "Dasmarinas, Cavite",
  "San Francisco, CA"
];

function cleanLocationSuggestion(value) {
  const location = String(value || "").trim().replace(/\s+/g, " ");
  if (!location || ["Hidden", "Nearby", "Not shared"].includes(location)) return "";
  return location;
}

function normalizeViewerProfile(profile = {}) {
  const name = profile.name || profile.fullName || "Flame user";
  const interests = Array.from(
    new Set([
      ...(Array.isArray(profile.interests) ? profile.interests : []),
      profile.gender,
      profile.interestedIn
    ].filter(Boolean))
  );
  const details = Array.isArray(profile.details) && profile.details.length > 0
    ? profile.details
    : [
        { label: "Location", value: profile.location || profile.distance || "Nearby" },
        { label: "Zodiac", value: profile.zodiacSign || "Not shared" },
        { label: "Work", value: profile.work || "Not shared" },
        { label: "School", value: profile.school || "Not shared" },
        {
          label: "Looking for",
          value: profile.interestedIn ? `Interested in ${profile.interestedIn}` : "Not shared"
        }
      ];

  return {
    id: profile.id || "",
    name,
    age: Math.max(18, Math.min(99, Number(profile.age) || 18)),
    image: profile.image || LOGO_SRC,
    background: profile.background || "",
    online: Boolean(profile.online),
    activeStory: activeStoryFrom(profile.activeStory),
    lastActiveAt: profile.lastActiveAt || null,
    bio: profile.bio || "New to Flame.",
    prompt: profile.prompt || "Signed up and ready to connect.",
    interests,
    details
  };
}

function profileForSummary(summary, state) {
  if (!summary) return null;
  if (summary.id && summary.id === state.auth?.id) return normalizeViewerProfile({ ...state.user, id: state.auth.id });
  const knownProfile =
    state.profiles.find((profile) => profile.id === summary.id) ||
    state.matches.map(profileForMatch).find((profile) => profile?.id === summary.id);
  return normalizeViewerProfile(knownProfile || summary);
}

function activeStoryFrom(value, now = Date.now()) {
  const stories = Array.isArray(value) ? value : value ? [value] : [];
  return (
    stories
      .filter((story) => story?.id && Number(story.expiresAt) > now && storyHasContent(story))
      .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))[0] || null
  );
}

function storyHasContent(story) {
  if (!story) return false;
  const type = ["image", "video"].includes(story.type) ? story.type : "text";
  const hasMusic = Boolean(story.music?.id && story.music?.title);
  if (type === "text") return Boolean(String(story.text || "").trim() || hasMusic);
  return Boolean(story.media);
}

function storyPostedAgo(story, now = Date.now()) {
  const ms = Math.max(0, now - Number(story?.createdAt || now));
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatClipTime(seconds = 0) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(value / 60);
  const remainder = String(value % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function reactionTotal(counts = {}) {
  return Object.values(counts).reduce((sum, count) => sum + Number(count || 0), 0);
}

function nextReactionCounts(counts = {}, previous = "", next = "") {
  const result = { ...counts };
  if (previous) result[previous] = Math.max(0, Number(result[previous] || 0) - 1);
  if (next) result[next] = Number(result[next] || 0) + 1;
  Object.keys(result).forEach((key) => result[key] <= 0 && delete result[key]);
  return result;
}

function musicTrackFrom(music) {
  if (!music?.id) return null;
  if (music.source && music.source !== "synth") return music;
  return STORY_MUSIC_LIBRARY.find((track) => track.id === music.id) || null;
}

function youtubeWatchUrl(youtubeId, startAt = 0) {
  const id = String(youtubeId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!id) return "";
  const params = new URLSearchParams({ v: id });
  const start = Math.max(0, Math.floor(Number(startAt) || 0));
  if (start > 0) params.set("t", `${start}s`);
  return `https://www.youtube.com/watch?${params.toString()}`;
}

function youtubeAutoplayUrl(youtubeId, startAt = 0) {
  const id = String(youtubeId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!id) return "";
  const start = Math.max(0, Math.floor(Number(startAt) || 0));
  const params = new URLSearchParams({
    autoplay: "1",
    controls: "0",
    modestbranding: "1",
    playsinline: "1",
    rel: "0",
    start: String(start),
    end: String(start + 60)
  });
  return `https://www.youtube.com/embed/${id}?${params.toString()}`;
}

let primedStoryAudio = null;

function stopPrimedStoryAudio() {
  if (!primedStoryAudio?.audio) return;
  primedStoryAudio.audio.pause();
  primedStoryAudio = null;
}

function primeStoryMusic(story) {
  stopPrimedStoryAudio();
  const music = story?.music;
  if (!music || music.source !== "upload" || !music.src) return;

  const audio = new Audio(music.src);
  const startAt = Math.max(0, Number(music.startAt) || 0);
  audio.preload = "auto";
  audio.autoplay = true;

  const seekToStart = () => {
    try {
      audio.currentTime = Math.min(startAt, Number.isFinite(audio.duration) ? Math.max(0, audio.duration - 0.25) : startAt);
    } catch {
      // Metadata may not be ready yet.
    }
  };

  audio.addEventListener("loadedmetadata", seekToStart, { once: true });
  audio.addEventListener("canplay", () => audio.play().catch(() => {}), { once: true });
  seekToStart();
  audio.play().catch(() => {});
  primedStoryAudio = { storyId: story.id, audio };
}

function takePrimedStoryAudio(storyId) {
  if (!primedStoryAudio || primedStoryAudio.storyId !== storyId) return null;
  const audio = primedStoryAudio.audio;
  primedStoryAudio = null;
  return audio;
}

function searchStoryMusic(query) {
  const q = query.trim().toLowerCase();
  if (!q) return STORY_MUSIC_LIBRARY;
  return STORY_MUSIC_LIBRARY.filter((track) =>
    [track.title, track.artist, ...track.tags].some((value) => value.toLowerCase().includes(q))
  );
}

function noteFrequency(note) {
  const match = String(note || "").match(/^([A-G])(#?)(-?\d)$/);
  if (!match) return 440;

  const [, letter, sharp, octaveText] = match;
  const semitones = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  const octave = Number(octaveText);
  return 440 * 2 ** ((semitones[letter] + (sharp ? 1 : 0) + (octave - 4) * 12) / 12);
}

function linksFromText(text = "") {
  return Array.from(String(text).matchAll(/https?:\/\/[^\s]+/gi)).map((match) =>
    match[0].replace(/[),.;!?]+$/, "")
  );
}

const VOICE_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
  "audio/ogg;codecs=opus"
];

function supportedVoiceMimeType() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  return VOICE_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function voiceFileExtension(mime = "") {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

export default function FlameApp() {
  const {
    state,
    hydrated,
    typingByProfile,
    login,
    signup,
    logout,
    setLight: setServerLight,
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
    reactToPost: reactToFeedPost,
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
    activateBoost: activateServerBoost,
    createSupportTicket
  } = useFlameStore();
  const {
    light,
    setLight: setLocalLight,
    syncFromServer: syncThemeFromServer
  } = useTheme();
  const [tab, setTab] = useState("home");
  const [pageTransition, setPageTransition] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [noticesRead, setNoticesRead] = useState(false);
  const [match, setMatch] = useState(null);
  const [chatWith, setChatWith] = useState(null);
  const [pendingCallSignal, setPendingCallSignal] = useState(null);
  const [matchBurst, setMatchBurst] = useState(null);
  const [hearts, setHearts] = useState([]);
  const [toast, setToast] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [authPage, setAuthPage] = useState("login");
  const timers = useRef({ toast: null, burst: null, modal: null });
  const boostUntil = state.boostUntil || 0;

  useEffect(() => {
    if (!boostUntil) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [boostUntil]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  useLayoutEffect(() => {
    if (!hydrated) return;
    syncThemeFromServer(Boolean(state.light));
  }, [hydrated, state.light, syncThemeFromServer]);

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach((id) => {
        if (id) window.clearTimeout(id);
      });
    };
  }, []);

  const boostActive = boostUntil > now;
  const boostSeconds = Math.max(0, Math.ceil((boostUntil - now) / 1000));
  const profileTabs = new Set(["edit-profile"]);
  const settingsTabs = new Set(["privacy", "about", "help"]);

  const showToast = (msg) => {
    window.clearTimeout(timers.current.toast);
    setToast(msg);
    timers.current.toast = window.setTimeout(() => setToast(null), 1800);
  };

  const setAppLight = useCallback(
    (nextLight) => {
      setLocalLight(Boolean(nextLight));
      setServerLight(Boolean(nextLight));
    },
    [setLocalLight, setServerLight]
  );

  const navigateTo = (nextTab) => {
    if (nextTab === tab) return;
    setPageTransition(false);
    setTab(nextTab);
  };

  const openChatWith = (profileId) => {
    readConversation(profileId);
    setPageTransition(false);
    setChatWith(profileId);
  };

  const popHeart = (x, y) => {
    const id = Date.now() + Math.random();
    setHearts((items) => [...items, { id, x, y }]);
    window.setTimeout(() => {
      setHearts((items) => items.filter((heart) => heart.id !== id));
    }, 900);
  };

  const startMatchCelebration = (profile) => {
    window.clearTimeout(timers.current.burst);
    window.clearTimeout(timers.current.modal);
    setMatchBurst({ id: `${profile.id}-${Date.now()}`, profile });
    timers.current.modal = window.setTimeout(() => setMatch(profile), 420);
    timers.current.burst = window.setTimeout(() => setMatchBurst(null), MATCH_BURST_MS);
  };

  const handleSwipe = (profile, dir) => {
    if (dir === "pass") {
      pass(profile.id);
      showToast(`Passed on ${profile.name}`);
      return;
    }

    like(profile.id, dir);
    const shouldMatch = dir === "super" || profile.likesYou || Math.random() > 0.45;

    if (shouldMatch) {
      addMatch(profile.id);
      showToast(`You matched with ${profile.name}`);
      startMatchCelebration(profile);
    } else {
      showToast(dir === "super" ? `Super liked ${profile.name}` : `Liked ${profile.name}`);
    }
  };

  const activateBoost = async () => {
    setNow(Date.now());
    const result = await activateServerBoost(BOOST_MS);
    showToast(result.ok ? (boostActive ? "Boost extended" : "Boost active") : result.error);
  };

  const scrollHomeToTop = () => {
    const home = document.querySelector(".home-screen .feed-list") || document.querySelector(".home-screen");
    home?.scrollTo?.({ top: 0, behavior: "smooth" });
    home?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const refreshHomeFeed = async () => {
    scrollHomeToTop();
    const result = await refreshFeed();
    scrollHomeToTop();
    showToast(result.ok ? "Feed refreshed" : result.error);
  };

  const activeChatMessageCount = chatWith
    ? state.matches.find((item) => item.profileId === chatWith)?.messages.length || 0
    : 0;
  const activityEvents = Array.isArray(state.events) ? state.events : [];
  const latestActivityId = activityEvents[0]?.id || "";
  const hasServerUnreadActivity = activityEvents.some((event) => !event.readAt);
  const hasUnreadActivity = Boolean(latestActivityId && hasServerUnreadActivity && !noticesRead);
  const markNotificationsRead = () => {
    setNoticesRead(true);
    if (hasServerUnreadActivity) markEventsRead();
  };

  useEffect(() => {
    if (latestActivityId) setNoticesRead(false);
  }, [latestActivityId]);

  useEffect(() => {
    if (state.auth.isAuthenticated && chatWith) readConversation(chatWith);
  }, [activeChatMessageCount, chatWith, readConversation, state.auth.isAuthenticated]);

  useEffect(() => {
    if (!state.auth.isAuthenticated) return undefined;

    const socket = connectRealtime();
    const handleIncomingCallInvite = (payload) => {
      if (!payload || payload.kind !== "invite" || !payload.profileId) return;
      if (chatWith === payload.profileId) return;

      const matched = state.matches.some(
        (item) => item.profileId === payload.profileId && !item.deletedAt && !item.blockedAt
      );
      if (!matched) return;

      setPendingCallSignal(payload);
      readConversation(payload.profileId);
      setPageTransition(false);
      setChatWith(payload.profileId);
    };

    socket.on("call:signal", handleIncomingCallInvite);
    return () => socket.off("call:signal", handleIncomingCallInvite);
  }, [chatWith, readConversation, state.auth.isAuthenticated, state.matches]);

  if (!hydrated) {
    return <AppSurface light={light} aria-hidden />;
  }

  if (!state.auth.isAuthenticated) {
    return (
      <AppSurface light={light} mode="auth-mode">
        {authPage === "login" ? (
          <LoginPage
            onLogin={async (credentials) => {
              const result = await login(credentials);
              if (result.ok) showToast("Welcome back");
              return result;
            }}
            onSwitchToSignup={() => setAuthPage("signup")}
          />
        ) : (
          <SignupPage
            onSignup={async (data) => {
              const result = await signup(data);
              if (result.ok) showToast("Account created");
              return result;
            }}
            onSwitchToLogin={() => setAuthPage("login")}
          />
        )}
        <div className="sr-live" role="status" aria-live="polite" aria-atomic="true">
          {toast}
        </div>
        <AnimatePresence>
          {toast && (
            <motion.div
              className="toast"
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </AppSurface>
    );
  }

  if (!state.user.onboardingCompleted) {
    return (
      <AppSurface light={light} mode="onboarding-mode">
        <FirstTimeOnboarding
          user={state.user}
          onComplete={async (data) => {
            const result = await setUserProfile({ ...data, onboardingCompleted: true }, { optimistic: false });
            showToast(result.ok ? "You're all set" : result.error);
          }}
        />
        <div className="sr-live" role="status" aria-live="polite" aria-atomic="true">
          {toast}
        </div>
        <AnimatePresence>
          {toast && (
            <motion.div
              className="toast"
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </AppSurface>
    );
  }

  const matchedRecord = chatWith
    ? state.matches.find((item) => item.profileId === chatWith)
    : null;
  const matchedProfile = matchedRecord ? profileForMatch(matchedRecord) : null;

  return (
    <AppSurface light={light} mode="app-mode" homeActive={!chatWith && tab === "home"}>
      <AnimatePresence mode="wait">
        {!chatWith ? (
          <PageFrame key={tab} routeKey={tab}>
            {tab === "home" && (
              <HomeScreen
                state={state}
                onMenu={() => setMenuOpen(true)}
                onNotif={() => setNotifOpen(true)}
                hasNotifications={hasUnreadActivity}
                onCreatePost={async (content) => {
                  const result = await createPost(content);
                  showToast(result.ok ? "Post shared" : result.error);
                  return result;
                }}
                onReactPost={reactToFeedPost}
                onUpdatePost={async (postId, updates) => {
                  const result = await updatePost(postId, updates);
                  showToast(result.ok ? "Post updated" : result.error);
                  return result;
                }}
                onDeletePost={async (postId) => {
                  const result = await deletePost(postId);
                  showToast(result.ok ? "Post deleted" : result.error);
                  return result;
                }}
                onCommentPost={async (postId, text, parentCommentId = "") => {
                  const result = await commentOnPost(postId, text, parentCommentId);
                  if (!result.ok) showToast(result.error);
                  return result;
                }}
                onReactComment={async (postId, commentId, reaction, parentCommentId = "") => {
                  const result = await reactToComment(postId, commentId, reaction, parentCommentId);
                  if (!result.ok) showToast(result.error);
                  return result;
                }}
                onSharePost={async (postId) => {
                  const result = await sharePost(postId);
                  showToast(result.ok ? "Post shared as a message" : result.error);
                  return result;
                }}
                shareTargets={state.matches
                  .filter((item) => !item.archivedAt && !item.deletedAt && !item.blockedAt)
                  .map((item) => profileForMatch(item))
                  .filter(Boolean)}
                onSharePostMessage={async (post, target) => {
                  const messageText = [
                    `Shared ${post.author?.name || "someone"}'s post`,
                    post.text || post.media?.name || "View this post on Flame."
                  ].filter(Boolean).join(": ");
                  if (post.media?.type && post.media?.src) {
                    sendMessage(target.id, {
                      type: post.media.type,
                      text: messageText,
                      media: post.media.src,
                      name: post.media.name || "shared-post",
                      mime: post.media.mime || ""
                    });
                  } else {
                    sendMessage(target.id, { type: "text", text: messageText });
                  }
                  const result = await sharePost(post.id);
                  showToast(result.ok ? `Shared with ${target.name}` : result.error);
                  return result;
                }}
              />
            )}

            {tab === "discover" && (
              <Discover
                state={state}
                boostActive={boostActive}
                boostSeconds={boostSeconds}
                onBoost={activateBoost}
                onMenu={() => setMenuOpen(true)}
                onNotif={() => setNotifOpen(true)}
                hasNotifications={hasUnreadActivity}
                onSwipe={handleSwipe}
                onPop={popHeart}
              />
            )}

            {tab === "messages" && (
              <MessagesScreen
                state={state}
                onOpenChat={openChatWith}
                onArchiveConversation={archiveConversation}
                onDeleteConversation={deleteConversation}
                onCreateStory={async (story) => {
                  const result = await createStory(story);
                  showToast(result.ok ? "Story shared for 24 hours" : result.error);
                  return result;
                }}
                onDeleteStory={async (storyId) => {
                  const result = await deleteStory(storyId);
                  showToast(result.ok ? "Story removed" : result.error);
                  return result;
                }}
                onReactStory={async (profileId, storyId, reaction) => {
                  const result = await reactToStory(profileId, storyId, reaction);
                  if (!result.ok) showToast(result.error);
                  return result;
                }}
                onViewStory={async (profileId, storyId) => {
                  const result = await viewStory(profileId, storyId);
                  if (!result.ok) showToast(result.error);
                  return result;
                }}
                onReplyStory={async (profileId, storyId, text) => {
                  const result = await replyToStory(profileId, storyId, text);
                  showToast(result.ok ? "Reply sent" : result.error);
                  return result;
                }}
              />
            )}

            {tab === "matches" && <MatchHistory state={state} posts={state.feed} onOpenChat={openChatWith} />}

            {tab === "profile" && (
              <ProfileScreen
                matchCount={state.matches.length}
                likedCount={state.likedIds.length}
                user={state.user}
                posts={state.feed}
                onEditProfile={() => navigateTo("edit-profile")}
                onUpdateProfile={setUserProfile}
              />
            )}

            {tab === "settings" && (
              <SettingsScreen
                light={light}
                setLight={setAppLight}
                user={state.user}
                privacy={state.privacy}
                onEditProfile={() => navigateTo("edit-profile")}
                onPrivacy={() => navigateTo("privacy")}
                onAbout={() => navigateTo("about")}
                onHelp={() => navigateTo("help")}
                onLogout={() => {
                  logout();
                  navigateTo("discover");
                  setChatWith(null);
                }}
                onUpdateProfile={setUserProfile}
              />
            )}

            {tab === "edit-profile" && (
              <EditProfile
                user={state.user}
                profiles={state.profiles}
                onSave={async (data) => {
                  const result = await setUserProfile(data, { optimistic: false });
                  if (result.ok) {
                    navigateTo("profile");
                    showToast("Profile updated");
                  } else {
                    showToast(result.error);
                  }
                }}
                onCancel={() => navigateTo("profile")}
              />
            )}

            {tab === "privacy" && (
              <PrivacySettings
                privacy={state.privacy}
                onSave={(updates) => {
                  updatePrivacy(updates);
                  navigateTo("settings");
                  showToast("Privacy settings saved");
                }}
                onCancel={() => navigateTo("settings")}
              />
            )}

            {tab === "about" && <AboutApp onBack={() => navigateTo("settings")} />}

            {tab === "help" && (
              <HelpCenter
                onBack={() => navigateTo("settings")}
                onTicket={async (ticket) => {
                  const result = await createSupportTicket(ticket);
                  if (result.ok) showToast(`Ticket ${result.ticket.id} created`);
                  else showToast(result.error);
                  return result;
                }}
              />
            )}
          </PageFrame>
        ) : (
          <PageFrame key={`chat-${chatWith}`} routeKey={`chat-${chatWith}`}>
            {matchedRecord ? (
              <ChatScreen
                profile={matchedProfile}
                user={{ ...state.user, id: state.auth?.id }}
                userStories={state.stories}
                messages={matchedRecord.messages}
                pinnedMessageIds={matchedRecord.pinnedMessageIds}
                posts={state.feed}
                forwardTargets={state.matches
                  .filter((item) => !item.archivedAt && !item.deletedAt)
                  .map((item) => profileForMatch(item))
                  .filter(Boolean)
                  .filter((item) => item.id !== matchedProfile.id)}
                isTyping={Boolean(typingByProfile[matchedProfile.id])}
                onSend={(content) => sendMessage(matchedProfile.id, content)}
                onForward={(message, target) => {
                  const type = message.type || "text";
                  const content =
                    type !== "text" && message.media
                      ? {
                          type,
                          text: message.text || (type === "audio" ? "Voice message" : ""),
                          media: message.media,
                          name: message.name || "",
                          mime: message.mime || ""
                        }
                      : { type: "text", text: message.text || "" };
                  sendMessage(target.id, content);
                  showToast(`Forwarded to ${target.name}`);
                }}
                onReport={async (message) => {
                  const result = await createSupportTicket({
                    subject: `Reported message from ${matchedProfile.name}`,
                    message: [
                      `Conversation: ${matchedProfile.name}`,
                      `Message type: ${message.type || "text"}`,
                      `Message text: ${message.text || "(no text)"}`,
                      `Message id: ${message.id}`
                    ].join("\n")
                  });
                  showToast(result.ok ? "Report sent" : result.error);
                  return result;
                }}
                onReact={(messageId, reaction) => reactToMessage(matchedProfile.id, messageId, reaction)}
                onUnsend={(messageId) => unsendMessage(matchedProfile.id, messageId)}
                onRemove={(messageId) => removeMessageForYou(matchedProfile.id, messageId)}
                onTogglePinned={(messageId, pinned) => togglePinnedMessage(matchedProfile.id, messageId, pinned)}
                onArchiveConversation={async () => {
                  await archiveConversation(matchedProfile.id, true);
                  setChatWith(null);
                  showToast("Conversation archived");
                }}
                onDeleteConversation={async () => {
                  await deleteConversation(matchedProfile.id);
                  setChatWith(null);
                  showToast("Conversation deleted");
                }}
                onBlockConversation={async () => {
                  const result = await blockUser(matchedProfile.id);
                  showToast(result.ok ? `${matchedProfile.name} blocked` : result.error);
                  if (result.ok) setChatWith(null);
                  return result;
                }}
                onTyping={(typing) => sendTypingStatus(matchedProfile.id, typing)}
                pendingCallSignal={pendingCallSignal?.profileId === matchedProfile.id ? pendingCallSignal : null}
                onPendingCallHandled={(callId) => {
                  setPendingCallSignal((current) => (current?.callId === callId ? null : current));
                }}
                onClose={() => setChatWith(null)}
              />
            ) : (
              <section className="screen" aria-label="Conversation unavailable">
                <header className="topbar">
                  <button className="icon-btn" onClick={() => setChatWith(null)} aria-label="Back to messages">
                    <BackIcon />
                  </button>
                  <h1 className="page-title">Messages</h1>
                  <span className="topbar-spacer" />
                </header>
                <EmptyState title="Conversation unavailable" subtitle="Go back to messages and try opening this match again." />
              </section>
            )}
          </PageFrame>
        )}
      </AnimatePresence>

      <div className={`page-loader ${pageTransition ? "active" : ""}`} aria-hidden="true">
        <span />
      </div>

      {!chatWith && (
          <BottomNav
            tab={profileTabs.has(tab) ? "profile" : settingsTabs.has(tab) ? "settings" : tab}
            setTab={navigateTo}
            unread={state.matches.filter((m) => !m.archivedAt && !m.deletedAt && m.messages.length === 0).length}
            onHomeRefresh={refreshHomeFeed}
            onNotifications={() => setNotifOpen(true)}
            onLogout={() => {
              logout();
              setChatWith(null);
              setTab("home");
              showToast("Logged out");
            }}
          />
      )}

      <AnimatePresence>
        {(menuOpen || notifOpen) && (
          <motion.div
            className="drawer-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setMenuOpen(false);
              setNotifOpen(false);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {menuOpen && (
          <motion.aside
            className="drawer menu-drawer"
            role="dialog"
            aria-label="Menu"
            initial={{ x: "-105%" }}
            animate={{ x: 0 }}
            exit={{ x: "-105%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
          >
            <div className="drawer-head">
              <div className="drawer-brand">
                <img src={LOGO_SRC} alt="" />
                <div>
                  <b>Flame</b>
                  <span>Find better matches</span>
                </div>
              </div>
              <button className="icon-btn round" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
                x
              </button>
            </div>
            <div className="drawer-user">
              <img src={state.user.image} alt="" />
              <div>
                <b>{state.user.fullName}</b>
                <span>{state.user.location}</span>
              </div>
            </div>
            {["home", "discover", "messages", "matches", "profile"].map((item) => (
              <button
                key={item}
                className="drawer-link"
                onClick={() => {
                  navigateTo(item);
                  setMenuOpen(false);
                }}
              >
                {item === "profile"
                  ? "Settings"
                  : item === "matches"
                    ? "Match History"
                    : item === "home"
                      ? "Home Feed"
                    : item.charAt(0).toUpperCase() + item.slice(1)}
              </button>
            ))}
            <button className="drawer-link accent-link" onClick={activateBoost}>
              Upgrade Spotlight
            </button>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notifOpen && (
          <motion.aside
            className="drawer notification-drawer"
            role="dialog"
            aria-label="Notifications"
            initial={{ x: "105%" }}
            animate={{ x: 0 }}
            exit={{ x: "105%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
          >
            <div className="drawer-head">
              <div>
                <h2>Notifications</h2>
                <p>Latest activity</p>
              </div>
              <button
                className="icon-btn round"
                aria-label="Close notifications"
                onClick={() => setNotifOpen(false)}
              >
                x
              </button>
            </div>
            {activityEvents.length > 0 ? (
              activityEvents.map((event) => (
                <button
                  key={event.id}
                  className={`notice activity-notice ${!noticesRead ? "unread" : ""}`}
                  onClick={() => {
                    navigateTo("home");
                    setNoticesRead(true);
                    setNotifOpen(false);
                  }}
                >
                  <img src={event.actor?.image || LOGO_SRC} alt="" />
                  <span className="notice-copy">
                    <b>{activityEventTitle(event)}</b>
                    <span>{activityEventPreview(event)}</span>
                    <small>{relativeTime(event.createdAt)}</small>
                  </span>
                </button>
              ))
            ) : (
              <div className="notice-empty">
                <img src={LOGO_SRC} alt="" />
                <b>No activity yet</b>
                <span>Post, comment, and match activity will appear here.</span>
              </div>
            )}
            <button
              className={`notice boost-notice ${boostActive && !noticesRead ? "unread" : ""}`}
              onClick={() => {
                activateBoost();
                setNoticesRead(true);
                setNotifOpen(false);
              }}
            >
              <b>{boostActive ? "Boost is live" : "Boost is ready"}</b>
              <span>{boostActive ? "Your profile is getting more visibility." : "Use Spotlight whenever you need it."}</span>
            </button>
            <button
              className="drawer-primary"
              onClick={() => {
                setNoticesRead(true);
                setNotifOpen(false);
              }}
            >
              Mark all read
            </button>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {match && (
          <MatchModal
            profile={match}
            user={state.user}
            onClose={() => setMatch(null)}
            onMessage={() => {
              const id = match.id;
              setMatch(null);
              navigateTo("messages");
              setChatWith(id);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hearts.map((heart) => (
          <motion.div
            key={heart.id}
            className="heart-pop"
            initial={{ x: heart.x - 14, y: heart.y - 14, opacity: 1, scale: 0.6 }}
            animate={{ y: heart.y - 100, opacity: 0, scale: 1.6 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.85, ease: "easeOut" }}
          >
            <HeartIcon fill />
          </motion.div>
        ))}
      </AnimatePresence>

      <AnimatePresence>
        {matchBurst && <MatchBurst key={matchBurst.id} />}
      </AnimatePresence>

      <div className="sr-live" role="status" aria-live="polite" aria-atomic="true">
        {toast}
      </div>
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </AppSurface>
  );
}

function FirstTimeOnboarding({ user, onComplete }) {
  const [step, setStep] = useState(0);
  const [interests, setInterests] = useState(
    Array.isArray(user.interests) ? user.interests.filter(Boolean).slice(0, 12) : []
  );
  const [interestText, setInterestText] = useState("");
  const [zodiacSign, setZodiacSign] = useState(user.zodiacSign || "");
  const [saving, setSaving] = useState(false);
  const lastInterestTap = useRef(0);
  const firstName = String(user.fullName || "there").trim().split(/\s+/)[0] || "there";

  const addInterest = (value = interestText) => {
    const text = String(value || "").trim();
    if (!text) return;
    const canonical = ONBOARDING_INTERESTS.find((item) => item.toLowerCase() === text.toLowerCase()) || text;
    setInterests((current) => {
      if (current.some((item) => item.toLowerCase() === canonical.toLowerCase()) || current.length >= 12) {
        return current;
      }
      return [...current, canonical];
    });
    setInterestText("");
  };

  const toggleInterest = (interest) => {
    setInterests((current) =>
      current.includes(interest)
        ? current.filter((item) => item !== interest)
        : [...current, interest].slice(0, 12)
    );
  };

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    await onComplete({
      interests,
      zodiacSign
    });
    setSaving(false);
  };

  return (
    <section className="onboarding-screen" aria-label="First time setup">
      <motion.div
        className="onboarding-card"
        key={step}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
      >
        <div className="onboarding-brand">
          <img src={LOGO_SRC} alt="" />
          <span>Flame</span>
        </div>

        <div className="onboarding-progress" aria-hidden="true">
          {[0, 1, 2, 3].map((item) => (
            <i key={item} className={item <= step ? "active" : ""} />
          ))}
        </div>

        {step === 0 && (
          <div className="onboarding-pane welcome-pane">
            <p className="onboarding-kicker">Welcome, {firstName}</p>
            <h1>Find genuine connections based on shared interests and personality.</h1>
            <button className="cta" type="button" onClick={() => setStep(1)}>
              Get Started
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="onboarding-pane">
            <h1>What are you into?</h1>
            <div className="interest-grid" role="group" aria-label="Select interests">
              {ONBOARDING_INTERESTS.map((interest) => (
                <button
                  key={interest}
                  type="button"
                  className={`interest-chip ${interests.includes(interest) ? "active" : ""}`}
                  onClick={() => toggleInterest(interest)}
                >
                  {interest}
                </button>
              ))}
            </div>
            <label className="onboarding-typebox">
              Type an interest
              <input
                value={interestText}
                onChange={(event) => setInterestText(event.target.value)}
                onDoubleClick={() => addInterest()}
                onPointerDown={() => {
                  const now = Date.now();
                  if (now - lastInterestTap.current < 360) addInterest();
                  lastInterestTap.current = now;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addInterest();
                  }
                }}
                list="flame-interest-options"
                placeholder="Double tap or press Enter to add"
              />
              <datalist id="flame-interest-options">
                {ONBOARDING_INTERESTS.map((interest) => (
                  <option key={interest} value={interest} />
                ))}
              </datalist>
            </label>
            {interests.length > 0 && (
              <div className="selected-interest-row">
                {interests.map((interest) => (
                  <button key={interest} type="button" onClick={() => toggleInterest(interest)}>
                    {interest} x
                  </button>
                ))}
              </div>
            )}
            <div className="onboarding-actions">
              <button className="secondary-cta" type="button" onClick={() => setStep(0)}>
                Back
              </button>
              <button className="cta" type="button" disabled={interests.length === 0} onClick={() => setStep(2)}>
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-pane">
            <h1>What's your zodiac sign?</h1>
            <label className="onboarding-select">
              Zodiac sign
              <select value={zodiacSign} onChange={(event) => setZodiacSign(event.target.value)}>
                <option value="">Select your sign</option>
                {ZODIAC_SIGNS.map((sign) => (
                  <option key={sign} value={sign}>
                    {sign}
                  </option>
                ))}
              </select>
            </label>
            <div className="onboarding-actions">
              <button className="secondary-cta" type="button" onClick={() => setStep(1)}>
                Back
              </button>
              <button className="cta" type="button" disabled={!zodiacSign} onClick={() => setStep(3)}>
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="onboarding-pane completion-pane">
            <div className="completion-mark">OK</div>
            <h1>You're all set.</h1>
            <button className="cta" type="button" onClick={finish} disabled={saving}>
              {saving ? "Saving..." : "Start Exploring"}
            </button>
          </div>
        )}
      </motion.div>
    </section>
  );
}

function AuthScreen({ onLogin, onSignup }) {
  const [mode, setMode] = useState("login");
  const [error, setError] = useState("");
  const [loginForm, setLoginForm] = useState({
    email: "",
    password: ""
  });
  const [signupForm, setSignupForm] = useState({
    fullName: "",
    email: "",
    password: "",
    age: 24
  });

  const submitLogin = (event) => {
    event.preventDefault();
    const result = onLogin(loginForm);
    setError(result.ok ? "" : result.error);
  };

  const submitSignup = (event) => {
    event.preventDefault();
    const result = onSignup(signupForm);
    setError(result.ok ? "" : result.error);
  };

  return (
    <section className="auth-screen" aria-label="Log in or sign up">
      <motion.div
        className="auth-panel"
        initial={{ opacity: 0, y: 22, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", damping: 24, stiffness: 220 }}
      >
        <img className="auth-logo" src={LOGO_SRC} alt="" />
        <h1>Flame</h1>
        <p>Swipe, match, and chat with people nearby.</p>

        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          {["login", "signup"].map((item) => (
            <button
              key={item}
              type="button"
              className={mode === item ? "active" : ""}
              onClick={() => {
                setMode(item);
                setError("");
              }}
            >
              {item === "login" ? "Log In" : "Sign Up"}
            </button>
          ))}
        </div>

        {error && <div className="form-error">{error}</div>}

        {mode === "login" ? (
          <form className="auth-form" onSubmit={submitLogin}>
            <label>
              Email
              <input
                type="email"
                value={loginForm.email}
                onChange={(event) => setLoginForm((prev) => ({ ...prev, email: event.target.value }))}
                autoComplete="email"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
                autoComplete="current-password"
                required
              />
            </label>
            <button type="submit" className="cta">Log In</button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={submitSignup}>
            <label>
              Full Name
              <input
                type="text"
                value={signupForm.fullName}
                onChange={(event) => setSignupForm((prev) => ({ ...prev, fullName: event.target.value }))}
                autoComplete="name"
                required
              />
            </label>
            <div className="form-grid">
              <label>
                Age
                <input
                  type="number"
                  min="18"
                  max="99"
                  value={signupForm.age}
                  onChange={(event) => setSignupForm((prev) => ({ ...prev, age: event.target.value }))}
                  required
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={signupForm.email}
                  onChange={(event) => setSignupForm((prev) => ({ ...prev, email: event.target.value }))}
                  autoComplete="email"
                  required
                />
              </label>
            </div>
            <label>
              Password
              <input
                type="password"
                value={signupForm.password}
                onChange={(event) => setSignupForm((prev) => ({ ...prev, password: event.target.value }))}
                autoComplete="new-password"
                required
              />
            </label>
            <button type="submit" className="cta">Create Account</button>
          </form>
        )}
      </motion.div>
    </section>
  );
}

function AnimatedEmoji({ reaction, className = "" }) {
  return (
    <img
      className={`animated-emoji ${className}`}
      src={`${NOTO_EMOJI_BASE}/${reaction.code}/512.webp`}
      alt={reaction.label}
      loading="lazy"
    />
  );
}

function cleanPostTag(value) {
  return String(value || "")
    .trim()
    .replace(/^#+/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 24)
    .toLowerCase();
}

function parsePostTags(value) {
  return String(value || "")
    .split(/[\s,]+/)
    .map(cleanPostTag)
    .filter(Boolean);
}

function HomeScreen({
  state,
  onMenu,
  onNotif,
  hasNotifications,
  onCreatePost,
  onReactPost,
  onUpdatePost,
  onDeletePost,
  onCommentPost,
  onReactComment,
  onSharePost,
  shareTargets = [],
  onSharePostMessage
}) {
  const [text, setText] = useState("");
  const [media, setMedia] = useState(null);
  const [tagDraft, setTagDraft] = useState("");
  const [tags, setTags] = useState([]);
  const [composerError, setComposerError] = useState("");
  const [commentDrafts, setCommentDrafts] = useState({});
  const [replyDrafts, setReplyDrafts] = useState({});
  const [activeReply, setActiveReply] = useState("");
  const [openComments, setOpenComments] = useState({});
  const [activeReactionPost, setActiveReactionPost] = useState("");
  const [activeCommentReaction, setActiveCommentReaction] = useState("");
  const [openCommentReactors, setOpenCommentReactors] = useState("");
  const [viewingProfile, setViewingProfile] = useState(null);
  const [busy, setBusy] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mood, setMood] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [reactionBurst, setReactionBurst] = useState("");
  const [feedReady, setFeedReady] = useState(false);
  const [postMenuOpen, setPostMenuOpen] = useState("");
  const [editingPostId, setEditingPostId] = useState("");
  const [editPostText, setEditPostText] = useState("");
  const [activeSharePost, setActiveSharePost] = useState("");
  const imageInput = useRef(null);
  const videoInput = useRef(null);
  const feed = state.feed || [];
  const visibleFeed = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return feed;
    return feed.filter((post) =>
      [
        post.text,
        post.author?.name,
        relativeTime(post.createdAt),
        ...(post.tags || [])
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [feed, searchQuery]);

  useEffect(() => {
    const id = window.setTimeout(() => setFeedReady(true), 320);
    return () => window.clearTimeout(id);
  }, []);

  const openUserProfile = (summary) => {
    const profile = profileForSummary(summary, state);
    if (profile) setViewingProfile(profile);
  };

  const addTags = (value = tagDraft) => {
    const nextTags = parsePostTags(value);
    if (nextTags.length === 0) return;
    setTags((current) => Array.from(new Set([...current, ...nextTags])).slice(0, 8));
    setTagDraft("");
    setComposerError("");
  };

  const removeTag = (tag) => {
    setTags((current) => current.filter((item) => item !== tag));
  };

  const readMedia = (file, expectedType) => {
    if (!file) return;
    setComposerError("");

    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    const type = isVideo ? "video" : isImage ? "image" : "";

    if (!type || (expectedType && type !== expectedType)) {
      setComposerError(`Choose a valid ${expectedType || "image or video"} file.`);
      return;
    }

    if (file.size > MAX_POST_MEDIA_BYTES) {
      setComposerError("Image or video must be 10MB or smaller.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setMedia({
        type,
        src: reader.result,
        name: file.name,
        mime: file.type
      });
      if (imageInput.current) imageInput.current.value = "";
      if (videoInput.current) videoInput.current.value = "";
    };
    reader.onerror = () => {
      setComposerError("Could not read that media file. Please try another one.");
    };
    reader.readAsDataURL(file);
  };

  const dropComposerMedia = (event) => {
    event.preventDefault();
    setDragActive(false);
    readMedia(event.dataTransfer.files?.[0]);
  };

  const submitPost = async (event) => {
    event.preventDefault();
    const body = text.trim();
    if (!body && !media) return;
    const finalTags = Array.from(new Set([...tags, ...parsePostTags(tagDraft), mood].filter(Boolean))).slice(0, 8);

    setBusy("post");
    const result = await onCreatePost({
      type: media?.type || "text",
      text: body,
      media: media?.src || "",
      name: media?.name || "",
      mime: media?.mime || "",
      tags: finalTags
    });
    setBusy("");
    if (result.ok) {
      setText("");
      setMedia(null);
      setTags([]);
      setTagDraft("");
      setMood("");
      setComposerError("");
      setComposerOpen(false);
    }
  };

  const submitComment = async (event, postId) => {
    event.preventDefault();
    const comment = (commentDrafts[postId] || "").trim();
    if (!comment) return;

    setBusy(`comment-${postId}`);
    const result = await onCommentPost(postId, comment);
    setBusy("");
    if (result.ok) {
      setCommentDrafts((current) => ({ ...current, [postId]: "" }));
    }
  };

  const submitReply = async (event, postId, commentId) => {
    event.preventDefault();
    const key = `${postId}:${commentId}`;
    const reply = (replyDrafts[key] || "").trim();
    if (!reply) return;

    setBusy(`reply-${key}`);
    const result = await onCommentPost(postId, reply, commentId);
    setBusy("");
    if (result.ok) {
      setReplyDrafts((current) => ({ ...current, [key]: "" }));
      setActiveReply("");
    }
  };

  const totalCommentReactions = (comment) =>
    Object.values(comment.reactionCounts || {}).reduce((sum, count) => sum + Number(count || 0), 0);

  const reactToFeedComment = async (postId, comment, reaction, parentCommentId = "") => {
    const key = `${postId}:${parentCommentId || "root"}:${comment.id}`;
    setBusy(`comment-reaction-${key}`);
    await onReactComment?.(postId, comment.id, comment.reaction === reaction ? "" : reaction, parentCommentId);
    setBusy("");
    setActiveCommentReaction("");
  };

  const startEditingPost = (post) => {
    setPostMenuOpen("");
    setActiveSharePost("");
    setEditingPostId(post.id);
    setEditPostText(post.text || "");
  };

  const submitPostEdit = async (event, post) => {
    event.preventDefault();
    setBusy(`edit-${post.id}`);
    const result = await onUpdatePost?.(post.id, { text: editPostText.trim() });
    setBusy("");
    if (result?.ok) {
      setEditingPostId("");
      setEditPostText("");
    }
  };

  const deleteFeedPost = async (post) => {
    setPostMenuOpen("");
    if (!window.confirm("Delete this post?")) return;
    setBusy(`delete-${post.id}`);
    const result = await onDeletePost?.(post.id);
    setBusy("");
    if (result?.ok) {
      setEditingPostId("");
      setActiveSharePost("");
    }
  };

  const share = (postId) => {
    setPostMenuOpen("");
    setEditingPostId("");
    setActiveSharePost((current) => (current === postId ? "" : postId));
  };

  const sharePostToMessage = async (post, target) => {
    setBusy(`share-${post.id}-${target.id}`);
    const result = onSharePostMessage
      ? await onSharePostMessage(post, target)
      : await onSharePost?.(post.id);
    setBusy("");
    if (result?.ok) setActiveSharePost("");
  };

  return (
    <section className="screen home-screen" aria-label="Home feed">
      <header className="topbar home-topbar">
        <button className="icon-btn glass-icon" type="button" onClick={onMenu} aria-label="Open menu">
          <MenuIcon />
        </button>
        <div className="brand home-brand" aria-label="Flame home">
          <img className="brand-logo pulse" src={LOGO_SRC} alt="" />
          <span className="brand-text">Flame</span>
        </div>
        <div className="home-topbar-actions">
          <button
            className={`icon-btn glass-icon ${searchOpen ? "active" : ""}`}
            type="button"
            onClick={() => {
              setSearchOpen((value) => !value);
              setComposerOpen(false);
            }}
            aria-label="Search feed"
          >
            <SearchIcon />
            <span className="home-search-label">Search Flame</span>
          </button>
          <button
            className={`icon-btn quick-post ${composerOpen ? "active" : ""}`}
            type="button"
            onClick={() => {
              setComposerOpen((value) => !value);
              setSearchOpen(false);
            }}
            aria-label="Create a post"
          >
            <PlusIcon />
          </button>
          <button className={`icon-btn bell glass-icon ${hasNotifications ? "ringing" : ""}`} type="button" onClick={onNotif} aria-label="Open notifications">
            <BellIcon />
            {hasNotifications && <span className="dot" />}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {searchOpen && (
          <motion.div
            className="feed-search-panel"
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <SearchIcon />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search posts, tags, people"
              aria-label="Search posts, tags, and people"
              autoFocus
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery("")} aria-label="Clear search">
                <XIcon />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {composerOpen && (
          <motion.form
            className={`feed-composer ${dragActive ? "drag-active" : ""}`}
            onSubmit={submitPost}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={dropComposerMedia}
            initial={{ opacity: 0, y: -20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ type: "spring", damping: 24, stiffness: 260 }}
          >
            <div className="composer-topline">
              <div className="composer-head">
                <button
                  type="button"
                  className="avatar-button"
                  onClick={() => setViewingProfile(normalizeViewerProfile({ ...state.user, id: state.auth?.id }))}
                  aria-label="View your profile"
                >
                  <img src={state.user.image} alt="" loading="lazy" />
                </button>
                <div>
                  <b>{state.user.fullName || "You"}</b>
                  <span>{mood ? POST_MOOD_OPTIONS.find((item) => item.id === mood)?.label : "Create a moment"}</span>
                </div>
              </div>
              <button className="icon-btn round composer-close" type="button" onClick={() => setComposerOpen(false)} aria-label="Close composer">
                <XIcon />
              </button>
            </div>

            <div className="composer-textbox">
              <textarea
                rows="2"
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  event.currentTarget.style.height = "auto";
                  event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
                }}
                placeholder="Share something with Flame..."
                maxLength={500}
                aria-label="Post text"
              />
              <span>{text.length}/500</span>
            </div>

            {media && (
              <div className="composer-preview">
                {media.type === "image" ? (
                  <img src={media.src} alt={media.name || "Post preview"} />
                ) : (
                  <video src={media.src} controls preload="metadata" />
                )}
                <button type="button" onClick={() => setMedia(null)} aria-label="Remove attached media">
                  <XIcon />
                </button>
              </div>
            )}

            <div className="composer-enhancers">
              <div className="composer-mood-row" aria-label="Feeling or mood">
                <span>
                  <SmileIcon />
                  Mood
                </span>
                {POST_MOOD_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={mood === option.id ? "active" : ""}
                    onClick={() => setMood((current) => (current === option.id ? "" : option.id))}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="composer-tag-box">
                <div className="composer-tag-row">
                  <input
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === ",") {
                        event.preventDefault();
                        addTags();
                      }
                    }}
                    placeholder="Add tag"
                    aria-label="Add post tag"
                    disabled={tags.length >= 8}
                  />
                  <button type="button" onClick={() => addTags()} disabled={!tagDraft.trim() || tags.length >= 8}>
                    Add
                  </button>
                </div>
                {tags.length > 0 && (
                  <div className="composer-tags" aria-label="Post tags">
                    {tags.map((tag) => (
                      <button key={tag} type="button" onClick={() => removeTag(tag)} aria-label={`Remove ${tag} tag`}>
                        #{tag}
                        <span>x</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {composerError && <p className="composer-error" role="alert">{composerError}</p>}
            <div className="composer-actions">
              <div className="composer-media-actions">
                <button type="button" className="composer-media-btn" onClick={() => imageInput.current?.click()}>
                  <ImageIcon />
                  <span>
                    <b>Photo</b>
                    <small>{media?.type === "image" ? media.name || "Selected" : "Gallery"}</small>
                  </span>
                </button>
                <button type="button" className="composer-media-btn" onClick={() => videoInput.current?.click()}>
                  <VideoIcon />
                  <span>
                    <b>Video</b>
                    <small>{media?.type === "video" ? media.name || "Selected" : "Clips"}</small>
                  </span>
                </button>
                <div className="composer-drop-state" aria-hidden="true">
                  <PaperclipIcon />
                  <span>{dragActive ? "Release to attach" : "Drop media"}</span>
                </div>
              </div>
              <button className="cta compact composer-post-btn" type="submit" disabled={busy === "post" || (!text.trim() && !media)}>
                {busy === "post" ? "Posting" : "Post"}
              </button>
            </div>
            <input ref={imageInput} type="file" accept="image/*" hidden onChange={(event) => readMedia(event.target.files?.[0], "image")} />
            <input ref={videoInput} type="file" accept="video/*" hidden onChange={(event) => readMedia(event.target.files?.[0], "video")} />
          </motion.form>
        )}
      </AnimatePresence>

      <div className="home-desktop-layout">
        <div className="home-feed-column">
          <div className="feed-list">
        {!feedReady ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div className="feed-slide" key={`feed-skeleton-${index}`}>
              <FeedSkeleton />
            </div>
          ))
        ) : visibleFeed.length === 0 ? (
          <div className="feed-slide feed-empty-slide">
            <EmptyState
              title={searchQuery ? "No posts found" : "No posts yet"}
              subtitle={searchQuery ? "Try another search or browse the full feed." : "Post a message, photo, or video to start the home feed."}
            />
            <button type="button" className="cta compact empty-post-btn" onClick={() => setComposerOpen(true)}>
              Create post
            </button>
          </div>
        ) : (
          visibleFeed.map((post) => {
            const totalReactions = Object.values(post.reactionCounts || {}).reduce((sum, count) => sum + count, 0);
            const comments = post.comments || [];
            const reactors = post.reactionUsers || [];
            const reactionEntries = FEED_REACTIONS.filter((reaction) => post.reactionCounts?.[reaction.id] > 0);
            const currentReaction = FEED_REACTIONS.find((reaction) => reaction.id === post.reaction);
            const commentsOpen = openComments[post.id] ?? comments.length > 0;
            return (
              <div key={post.id} className="feed-slide">
                <article
                  className="feed-post"
                >
                <div className="feed-post-head">
                  <button
                    type="button"
                    className="avatar-button"
                    onClick={() => openUserProfile(post.author)}
                    aria-label={`View ${post.author.name}'s profile`}
                  >
                    <img src={post.author.image} alt="" loading="lazy" />
                  </button>
                  <div>
                    <b>{post.author.name}</b>
                    <span>{relativeTime(post.createdAt)}</span>
                  </div>
                  {post.canManage && (
                    <div className="feed-owner-actions">
                      <button
                        type="button"
                        className="feed-owner-menu-btn"
                        onClick={() => setPostMenuOpen((current) => (current === post.id ? "" : post.id))}
                        aria-label="Post options"
                        aria-expanded={postMenuOpen === post.id}
                      >
                        <MoreIcon />
                      </button>
                      {postMenuOpen === post.id && (
                        <div className="feed-owner-menu">
                          <button type="button" onClick={() => startEditingPost(post)}>
                            Edit post
                          </button>
                          <button type="button" className="danger" onClick={() => deleteFeedPost(post)} disabled={busy === `delete-${post.id}`}>
                            Delete post
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {editingPostId === post.id ? (
                  <form className="post-edit-form" onSubmit={(event) => submitPostEdit(event, post)}>
                    <textarea
                      value={editPostText}
                      onChange={(event) => setEditPostText(event.target.value)}
                      maxLength={1200}
                      placeholder="Update your post..."
                      aria-label="Edit post text"
                      autoFocus
                    />
                    <div>
                      <button type="button" className="secondary-cta compact" onClick={() => setEditingPostId("")}>
                        Cancel
                      </button>
                      <button className="cta compact" type="submit" disabled={busy === `edit-${post.id}`}>
                        Save
                      </button>
                    </div>
                  </form>
                ) : (
                  post.text && <p className="feed-copy">{post.text}</p>
                )}
                {post.media?.type === "image" && <img className="feed-media" src={post.media.src} alt={post.media.name || "Post media"} loading="lazy" />}
                {post.media?.type === "video" && <video className="feed-media" src={post.media.src} controls preload="metadata" />}
                {post.tags?.length > 0 && (
                  <div className="feed-tags">
                    {post.tags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                )}

                <div className="feed-stats">
                  <span className="feed-reaction-summary">
                    {reactionEntries.length > 0 && (
                      <span className="feed-reaction-icons" aria-hidden="true">
                        {reactionEntries.slice(0, 3).map((reaction) => (
                          <AnimatedEmoji key={reaction.id} reaction={reaction} className="mini" />
                        ))}
                      </span>
                    )}
                    {totalReactions} {totalReactions === 1 ? "reaction" : "reactions"}
                  </span>
                  <span>{post.commentCount} comments</span>
                  <span>{post.shareCount} shares</span>
                </div>

                {reactors.length > 0 && (
                  <div className="feed-reactors" aria-label="People who reacted">
                    {reactors.slice(0, 6).map((item) => {
                      const reaction = FEED_REACTIONS.find((option) => option.id === item.reaction);
                      return (
                        <button
                          key={`${post.id}-${item.user.id}-${item.reaction}`}
                          type="button"
                          className="feed-reactor"
                          onClick={() => openUserProfile(item.user)}
                          aria-label={`View ${item.user.name}'s profile`}
                        >
                          <img src={item.user.image} alt="" loading="lazy" />
                          {reaction && <AnimatedEmoji reaction={reaction} className="micro" />}
                          <span>{item.user.name}</span>
                        </button>
                      );
                    })}
                    {reactors.length > 6 && <span className="feed-reactor-more">+{reactors.length - 6} more</span>}
                  </div>
                )}

                <div className="feed-tools">
                  <div
                    className={`feed-like-wrap ${activeReactionPost === post.id ? "open" : ""}`}
                    onMouseLeave={() => setActiveReactionPost("")}
                  >
                    <button
                      type="button"
                      className={`feed-tool-btn ${post.reaction ? "active" : ""}`}
                      onClick={() => setActiveReactionPost((current) => (current === post.id ? "" : post.id))}
                      aria-label="Choose reaction"
                      aria-expanded={activeReactionPost === post.id}
                    >
                      {currentReaction ? <AnimatedEmoji reaction={currentReaction} className="tiny" /> : <HeartIcon />}
                      <span>{currentReaction?.label || "Like"}</span>
                    </button>
                    <div className="feed-reactions" aria-label="React to post">
                      {FEED_REACTIONS.map((reaction) => (
                        <button
                          key={reaction.id}
                          type="button"
                          className={`feed-reaction ${post.reaction === reaction.id ? "active" : ""}`}
                          onClick={() => {
                            const nextReaction = post.reaction === reaction.id ? "" : reaction.id;
                            onReactPost(post.id, nextReaction);
                            if (nextReaction) {
                              const burstKey = `${post.id}:${nextReaction}:${Date.now()}`;
                              setReactionBurst(burstKey);
                              window.setTimeout(() => {
                                setReactionBurst((current) => (current === burstKey ? "" : current));
                              }, 720);
                            }
                            setActiveReactionPost("");
                          }}
                          aria-label={reaction.label}
                          aria-pressed={post.reaction === reaction.id}
                        >
                          <AnimatedEmoji reaction={reaction} />
                          <span>{post.reactionCounts?.[reaction.id] || reaction.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="feed-tool-btn"
                    onClick={() =>
                      setOpenComments((current) => ({
                        ...current,
                        [post.id]: !(current[post.id] ?? comments.length > 0)
                      }))
                    }
                    aria-expanded={commentsOpen}
                  >
                    <MessageIcon />
                    <span>Comment</span>
                  </button>
                  <button className="feed-tool-btn" type="button" onClick={() => share(post.id)} disabled={busy === `share-${post.id}`}>
                    <SendIcon />
                    <span>Message</span>
                  </button>
                </div>

                {activeSharePost === post.id && (
                  <div className="post-share-panel" aria-label="Share post as a message">
                    {shareTargets.length === 0 ? (
                      <p>No matches to message yet.</p>
                    ) : (
                      shareTargets.map((target) => (
                        <button
                          key={target.id}
                          type="button"
                          onClick={() => sharePostToMessage(post, target)}
                          disabled={busy === `share-${post.id}-${target.id}`}
                        >
                          <img src={target.image} alt="" />
                          <span>{target.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}

                <AnimatePresence>
                  {reactionBurst.startsWith(`${post.id}:`) && (
                    <motion.div
                      className="like-burst"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.18 }}
                      transition={{ duration: 0.28, ease: "easeOut" }}
                      aria-hidden="true"
                    >
                      {Array.from({ length: 6 }).map((_, index) => (
                        <span key={index}>
                          <HeartIcon fill />
                        </span>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {commentsOpen && (
                  <div className="feed-comments-panel">
                    {comments.length > 0 ? (
                      <div className="comment-list">
                        {comments.slice(-5).map((comment) => {
                          const replyKey = `${post.id}:${comment.id}`;
                          const replies = comment.replies || [];
                          const commentReactKey = `${post.id}:root:${comment.id}`;
                          const commentReactionTotal = totalCommentReactions(comment);
                          const currentCommentReaction = FEED_REACTIONS.find((reaction) => reaction.id === comment.reaction);
                          return (
                            <div key={comment.id} className="comment-thread">
                              <div className="comment-row">
                                <button
                                  type="button"
                                  className="avatar-button"
                                  onClick={() => openUserProfile(comment.author)}
                                  aria-label={`View ${comment.author.name}'s profile`}
                                >
                                  <img src={comment.author.image} alt="" loading="lazy" />
                                </button>
                                <div className="comment-content">
                                  <p>
                                    <b>{comment.author.name}</b>
                                    <span>{comment.text}</span>
                                  </p>
                                  <button
                                    type="button"
                                    className="comment-reply-trigger"
                                    onClick={() => setActiveReply((current) => (current === replyKey ? "" : replyKey))}
                                  >
                                    Reply{replies.length > 0 ? ` · ${replies.length}` : ""}
                                  </button>
                                  <div className="comment-action-row">
                                    <div
                                      className={`comment-react-wrap ${activeCommentReaction === commentReactKey ? "open" : ""}`}
                                      onMouseLeave={() => setActiveCommentReaction("")}
                                    >
                                      <button
                                        type="button"
                                        className={`comment-action ${comment.reaction ? "active" : ""}`}
                                        onClick={() => setActiveCommentReaction((current) => (current === commentReactKey ? "" : commentReactKey))}
                                      >
                                        {currentCommentReaction ? <AnimatedEmoji reaction={currentCommentReaction} className="micro" /> : <HeartIcon />}
                                        <span>React</span>
                                      </button>
                                      <div className="comment-reactions" aria-label="React to comment">
                                        {FEED_REACTIONS.map((reaction) => (
                                          <button
                                            key={reaction.id}
                                            type="button"
                                            disabled={busy === `comment-reaction-${commentReactKey}`}
                                            onClick={() => reactToFeedComment(post.id, comment, reaction.id)}
                                            aria-label={reaction.label}
                                          >
                                            <AnimatedEmoji reaction={reaction} className="tiny" />
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    {commentReactionTotal > 0 && (
                                      <button
                                        type="button"
                                        className="comment-reaction-count"
                                        onClick={() => setOpenCommentReactors((current) => (current === commentReactKey ? "" : commentReactKey))}
                                        aria-label={`${commentReactionTotal} comment reactions`}
                                      >
                                        {commentReactionTotal}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="comment-reply-trigger"
                                      onClick={() => setActiveReply((current) => (current === replyKey ? "" : replyKey))}
                                    >
                                      Reply{replies.length > 0 ? ` · ${replies.length}` : ""}
                                    </button>
                                  </div>
                                  {openCommentReactors === commentReactKey && (
                                    <div className="comment-reactors">
                                      {(comment.reactionUsers || []).map((item) => {
                                        const reaction = FEED_REACTIONS.find((option) => option.id === item.reaction);
                                        return (
                                          <button
                                            key={`${item.user.id}-${item.reaction}`}
                                            type="button"
                                            onClick={() => openUserProfile(item.user)}
                                          >
                                            <img src={item.user.image} alt="" />
                                            {reaction && <AnimatedEmoji reaction={reaction} className="micro" />}
                                            <span>{item.user.name}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {replies.length > 0 && (
                                <div className="reply-list">
                                  {replies.map((reply) => {
                                    const replyReactKey = `${post.id}:${comment.id}:${reply.id}`;
                                    const replyReactionTotal = totalCommentReactions(reply);
                                    const currentReplyReaction = FEED_REACTIONS.find((reaction) => reaction.id === reply.reaction);
                                    return (
                                      <div key={reply.id} className="reply-thread">
                                        <div className="comment-row reply-row">
                                          <button
                                            type="button"
                                                  className="avatar-button"
                                                  onClick={() => openUserProfile(reply.author)}
                                                  aria-label={`View ${reply.author.name}'s profile`}
                                                >
                                            <img src={reply.author.image} alt="" loading="lazy" />
                                          </button>
                                          <div className="comment-content">
                                            <p>
                                              <b>{reply.author.name}</b>
                                              <span>{reply.text}</span>
                                            </p>
                                            <div className="comment-action-row">
                                              <div
                                                className={`comment-react-wrap ${activeCommentReaction === replyReactKey ? "open" : ""}`}
                                                onMouseLeave={() => setActiveCommentReaction("")}
                                              >
                                                <button
                                                  type="button"
                                                  className={`comment-action ${reply.reaction ? "active" : ""}`}
                                                  onClick={() => setActiveCommentReaction((current) => (current === replyReactKey ? "" : replyReactKey))}
                                                >
                                                  {currentReplyReaction ? <AnimatedEmoji reaction={currentReplyReaction} className="micro" /> : <HeartIcon />}
                                                  <span>React</span>
                                                </button>
                                                <div className="comment-reactions" aria-label="React to reply">
                                                  {FEED_REACTIONS.map((reaction) => (
                                                    <button
                                                      key={reaction.id}
                                                      type="button"
                                                      disabled={busy === `comment-reaction-${replyReactKey}`}
                                                      onClick={() => reactToFeedComment(post.id, reply, reaction.id, comment.id)}
                                                      aria-label={reaction.label}
                                                    >
                                                      <AnimatedEmoji reaction={reaction} className="tiny" />
                                                    </button>
                                                  ))}
                                                </div>
                                              </div>
                                              {replyReactionTotal > 0 && (
                                                <button
                                                  type="button"
                                                  className="comment-reaction-count"
                                                  onClick={() => setOpenCommentReactors((current) => (current === replyReactKey ? "" : replyReactKey))}
                                                  aria-label={`${replyReactionTotal} reply reactions`}
                                                >
                                                  {replyReactionTotal}
                                                </button>
                                              )}
                                            </div>
                                            {openCommentReactors === replyReactKey && (
                                              <div className="comment-reactors">
                                                {(reply.reactionUsers || []).map((item) => {
                                                  const reaction = FEED_REACTIONS.find((option) => option.id === item.reaction);
                                                  return (
                                                    <button
                                                      key={`${item.user.id}-${item.reaction}`}
                                                      type="button"
                                                      onClick={() => openUserProfile(item.user)}
                                                    >
                                                      <img src={item.user.image} alt="" />
                                                      {reaction && <AnimatedEmoji reaction={reaction} className="micro" />}
                                                      <span>{item.user.name}</span>
                                                    </button>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {activeReply === replyKey && (
                                <form className="comment-form reply-form" onSubmit={(event) => submitReply(event, post.id, comment.id)}>
                                  <input
                                    value={replyDrafts[replyKey] || ""}
                                    onChange={(event) => setReplyDrafts((current) => ({ ...current, [replyKey]: event.target.value }))}
                                    placeholder={`Reply to ${comment.author.name}...`}
                                    aria-label={`Reply to ${comment.author.name}`}
                                  />
                                  <button type="submit" disabled={busy === `reply-${replyKey}` || !(replyDrafts[replyKey] || "").trim()}>
                                    <SendIcon />
                                  </button>
                                </form>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="comment-empty">No comments yet.</p>
                    )}

                    <form className="comment-form" onSubmit={(event) => submitComment(event, post.id)}>
                      <input
                        value={commentDrafts[post.id] || ""}
                        onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))}
                        placeholder="Write a comment..."
                        aria-label="Write a comment"
                      />
                      <button type="submit" disabled={busy === `comment-${post.id}` || !(commentDrafts[post.id] || "").trim()}>
                        <SendIcon />
                      </button>
                    </form>
                  </div>
                )}
                </article>
              </div>
            );
          })
            )}
          </div>
        </div>
        <HomeDesktopAside
          state={state}
          feed={feed}
          loading={!feedReady}
          onOpenProfile={openUserProfile}
          onCreatePost={() => {
            setComposerOpen(true);
            setSearchOpen(false);
          }}
        />
      </div>
      <AnimatePresence>
        {viewingProfile && (
          <ProfileViewer
            profile={viewingProfile}
            posts={feed}
            onClose={() => setViewingProfile(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

function HomeDesktopAside({ state, feed = [], loading = false, onOpenProfile, onCreatePost }) {
  const uniqueProfiles = new Map();
  for (const profile of [
    ...(state.profiles || []),
    ...(state.matches || []).map(profileForMatch)
  ]) {
    if (!profile?.id || profile.id === state.auth?.id || uniqueProfiles.has(profile.id)) continue;
    uniqueProfiles.set(profile.id, profile);
  }
  const contacts = Array.from(uniqueProfiles.values()).slice(0, 4);
  const viewer = normalizeViewerProfile({ ...state.user, id: state.auth?.id });
  const totalReactions = feed.reduce(
    (sum, post) => sum + Object.values(post.reactionCounts || {}).reduce((postSum, count) => postSum + Number(count || 0), 0),
    0
  );
  const totalComments = feed.reduce((sum, post) => sum + Number(post.commentCount || post.comments?.length || 0), 0);
  const recentPosts = feed.slice(0, 3);

  return (
    <aside className="home-desktop-aside home-insights" aria-label="Home dashboard">
      <section className="home-side-card home-profile-card">
        <div className="home-mini-profile">
          <img src={state.user.image || LOGO_SRC} alt="" loading="lazy" />
          <span>
            <b>{state.user.fullName || "Your profile"}</b>
            <small>{state.user.location || "Nearby"}</small>
          </span>
        </div>
        <div className="home-profile-actions">
          <button type="button" onClick={onCreatePost}>
            <PlusIcon />
            <span>Create post</span>
          </button>
          <button type="button" onClick={() => onOpenProfile(viewer)}>
            <UserIcon />
            <span>View profile</span>
          </button>
        </div>
      </section>

      <section className="home-side-card home-metrics-card">
        <div className="home-side-card-title">
          <span className="side-card-icon">
            <ActivityIcon />
          </span>
          <b>Feed snapshot</b>
        </div>
        <div className="home-metric-grid">
          <span>
            <b>{feed.length}</b>
            <small>Posts</small>
          </span>
          <span>
            <b>{totalReactions}</b>
            <small>Reactions</small>
          </span>
          <span>
            <b>{totalComments}</b>
            <small>Comments</small>
          </span>
        </div>
      </section>

      <section className="home-side-card home-activity-card">
        <div className="home-side-card-title">
          <span className="side-card-icon flame">
            <FlameIcon />
          </span>
          <b>Latest activity</b>
        </div>
        <div className="home-activity-list">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => <SideCardSkeleton key={`follow-skeleton-${index}`} avatar />)
          ) : recentPosts.length > 0 ? (
            recentPosts.map((post) => (
              <button
                type="button"
                key={post.id}
                className="home-activity-row"
                onClick={() => onOpenProfile(post.author)}
              >
                <img src={post.author?.image || LOGO_SRC} alt="" loading="lazy" />
                <span>
                  <b>{post.author?.name || "Flame user"}</b>
                  <small>{post.text || "Shared a new update"}</small>
                </span>
              </button>
            ))
          ) : (
            <p className="home-side-empty">New feed activity will appear here.</p>
          )}
        </div>
      </section>

      <section className="home-side-card home-contacts-card">
        <div className="home-side-card-title">
          <span className="side-card-icon">
            <UserIcon />
          </span>
          <b>Contacts</b>
        </div>
        <div className="follow-list">
          {contacts.length > 0 ? (
            contacts.map((profile) => (
              <button type="button" key={profile.id} className="follow-row" onClick={() => onOpenProfile(profile)}>
                <img src={profile.image || LOGO_SRC} alt="" loading="lazy" />
                <span>
                  <b>{profile.name || profile.fullName || "Flame user"}</b>
                  <small>{profile.online ? "Online now" : profile.location || "Nearby"}</small>
                </span>
              </button>
            ))
          ) : (
            <p className="home-side-empty">Your contacts will show here.</p>
          )}
        </div>
      </section>
    </aside>
  );
}

function SideCardSkeleton({ avatar = false }) {
  return (
    <div className={`side-skeleton-row ${avatar ? "avatar" : ""}`} aria-hidden="true">
      {avatar && <span className="side-skeleton-avatar" />}
      <span>
        <i />
        <i />
      </span>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <article className="feed-post feed-skeleton" aria-hidden="true">
      <div className="feed-post-head">
        <span className="skeleton-dot" />
        <div>
          <span className="skeleton-line short" />
          <span className="skeleton-line mini" />
        </div>
      </div>
      <span className="skeleton-line wide" />
      <span className="skeleton-line medium" />
      <span className="skeleton-media" />
      <div className="feed-tags">
        <span className="skeleton-pill" />
        <span className="skeleton-pill" />
        <span className="skeleton-pill narrow" />
      </div>
    </article>
  );
}

function Discover({ state, boostActive, boostSeconds, onBoost, onMenu, onNotif, hasNotifications, onSwipe, onPop }) {
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState("discover");
  const [history, setHistory] = useState([]);
  const [forced, setForced] = useState(null);
  const [viewingProfile, setViewingProfile] = useState(null);

  const deck = useMemo(() => {
    const matched = new Set(state.matches.map((match) => match.profileId));
    const pool =
      mode === "nearby"
        ? state.profiles.filter((profile) => profile.online || parseFloat(profile.distance) <= 3.2)
        : state.profiles;
    return pool.filter((profile) => !matched.has(profile.id));
  }, [mode, state.matches, state.profiles]);

  useEffect(() => {
    setIndex(0);
    setHistory([]);
  }, [mode]);

  useEffect(() => {
    if (index >= deck.length) setIndex(0);
  }, [deck.length, index]);

  const visible = useMemo(() => {
    if (deck.length === 0) return [];
    return Array.from({ length: Math.min(3, deck.length) }, (_, offset) => deck[(index + offset) % deck.length]).reverse();
  }, [deck, index]);

  const advance = (dir) => {
    const current = deck[index % Math.max(deck.length, 1)];
    if (!current) return;
    setHistory((items) => [...items, index]);
    setIndex((value) => (value + 1) % Math.max(deck.length, 1));
    onSwipe(current, dir);
  };

  const rewind = () => {
    if (history.length === 0 || forced) return;
    const last = history[history.length - 1];
    setHistory((items) => items.slice(0, -1));
    setIndex(last);
  };

  const trigger = (dir) => {
    if (forced) return;
    setForced(dir);
    window.setTimeout(() => setForced(null), 360);
    if (dir === "like" || dir === "super") {
      onPop(window.innerWidth / 2, window.innerHeight / 2);
    }
    window.setTimeout(() => advance(dir), 280);
  };

  useEffect(() => {
    const onKey = (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "l") trigger("like");
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "n") trigger("pass");
      if (event.key === "ArrowUp" || event.key.toLowerCase() === "s") trigger("super");
      if (event.key === "ArrowDown" || event.key === "Backspace") rewind();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <section className="screen discover-screen" aria-label="Discover profiles">
      <header className="topbar">
        <button className="icon-btn" onClick={onMenu} aria-label="Open menu">
          <MenuIcon />
        </button>
        <div className="brand" aria-label="Flame">
          <img className="brand-logo pulse" src={LOGO_SRC} alt="" />
          <span className="brand-text">Flame</span>
        </div>
        <button className="icon-btn bell" onClick={onNotif} aria-label="Open notifications">
          <BellIcon />
          {hasNotifications && <span className="dot" />}
        </button>
      </header>

      <div className="discover-tools">
        <nav className="tabs" aria-label="Discovery mode">
          {["discover", "nearby"].map((item) => (
            <button
              key={item}
              className={`tab ${mode === item ? "active" : ""}`}
              onClick={() => setMode(item)}
              aria-pressed={mode === item}
            >
              <span>{item === "discover" ? "Discover" : "Nearby"}</span>
              <i />
            </button>
          ))}
        </nav>
        <button className={`boost-chip ${boostActive ? "active" : ""}`} onClick={onBoost}>
          <LightningIcon />
          <span>{boostActive ? `${boostSeconds}s` : "Boost"}</span>
        </button>
      </div>

      <div className={`card-wrap ${boostActive ? "boosted" : ""} ${visible.length === 0 ? "empty" : ""}`}>
        {visible.length === 0 ? (
          <EmptyState title="No signed-up users yet" subtitle="New accounts will appear here after they sign up." />
        ) : (
          <AnimatePresence>
            {visible.map((profile, position) => {
              const isTop = position === visible.length - 1;
              const offset = visible.length - 1 - position;
              return (
                <SwipeCard
                  key={`${profile.id}-${index}-${mode}`}
                  profile={profile}
                  isTop={isTop}
                  offset={offset}
                  forced={isTop ? forced : null}
                  onViewProfile={() => setViewingProfile(normalizeViewerProfile(profile))}
                  onSwipe={(dir) => {
                    if (dir === "like" || dir === "super") {
                      onPop(window.innerWidth / 2, window.innerHeight / 2);
                    }
                    advance(dir);
                  }}
                />
              );
            })}
          </AnimatePresence>
        )}
      </div>

      <div className="deck-meta">
        <span>{deck.length} profiles</span>
        <span>{mode === "nearby" ? "Nearby queue" : "Best picks"}</span>
      </div>

      <div className="actions" role="group" aria-label="Swipe actions">
        <button className="action a-rewind" onClick={rewind} aria-label="Undo last swipe" disabled={history.length === 0}>
          <span className="circ">
            <RewindIcon />
          </span>
          <label>Back</label>
        </button>
        <button className="action a-pass" onClick={() => trigger("pass")} aria-label="Pass on this profile">
          <span className="circ">
            <XIcon />
          </span>
          <label>Pass</label>
        </button>
        <button className="action a-like" onClick={() => trigger("like")} aria-label="Like this profile">
          <span className="circ">
            <HeartIcon fill />
          </span>
          <label>Like</label>
        </button>
        <button className="action a-super" onClick={() => trigger("super")} aria-label="Super like this profile">
          <span className="circ">
            <StarIcon />
          </span>
          <label>Super</label>
        </button>
        <button className="action a-boost" onClick={onBoost} aria-label="Boost your profile">
          <span className="circ">
            <LightningIcon />
          </span>
          <label>{boostActive ? "Live" : "Boost"}</label>
        </button>
      </div>
      <AnimatePresence>
        {viewingProfile && (
          <ProfileViewer
            profile={viewingProfile}
            posts={state.feed}
            onClose={() => setViewingProfile(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

function SwipeCard({ profile, isTop, offset, forced, onSwipe, onViewProfile }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-22, 22]);
  const likeOp = useTransform(x, [40, 160], [0, 1]);
  const nopeOp = useTransform(x, [-160, -40], [1, 0]);
  const supOp = useTransform(y, [-160, -40], [1, 0]);
  const baseScale = 1 - offset * 0.045;
  const baseY = offset * 12;

  const handleDragEnd = (_, info) => {
    const { offset: dragOffset, velocity } = info;
    const power = Math.abs(dragOffset.x) * 0.6 + Math.abs(velocity.x) * 0.3;

    if (dragOffset.y < -120 || velocity.y < -700) onSwipe("super");
    else if (dragOffset.x > 120 || (power > 200 && dragOffset.x > 0)) onSwipe("like");
    else if (dragOffset.x < -120 || (power > 200 && dragOffset.x < 0)) onSwipe("pass");
  };

  let exitX = x.get();
  let exitY = y.get();
  if (forced === "like") exitX = 600;
  if (forced === "pass") exitX = -600;
  if (forced === "super") exitY = -800;

  return (
    <motion.div
      className="deck-card"
      style={isTop ? { x, y, rotate } : undefined}
      drag={isTop}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.72}
      dragSnapToOrigin
      onDragEnd={handleDragEnd}
      initial={{ scale: baseScale - 0.04, y: baseY + 16, opacity: 0 }}
      animate={
        isTop && forced
          ? {
              x: forced === "like" ? 600 : forced === "pass" ? -600 : 0,
              y: forced === "super" ? -800 : 0,
              rotate: forced === "like" ? 22 : forced === "pass" ? -22 : 0,
              opacity: 0,
              transition: { duration: 0.32 }
            }
          : { scale: baseScale, y: baseY, opacity: 1 }
      }
      exit={{
        x: exitX > 50 ? 600 : exitX < -50 ? -600 : 0,
        y: exitY < -100 ? -800 : 0,
        opacity: 0,
        transition: { duration: 0.32 }
      }}
      transition={{ type: "spring", damping: 22, stiffness: 240 }}
      role={isTop ? "group" : undefined}
      aria-label={isTop ? `${profile.name}, ${profile.age}. ${profile.bio}` : undefined}
    >
      <div className="photo">
        <img
          src={profile.image}
          alt={profile.name}
          draggable={false}
          onClick={(event) => {
            if (!isTop) return;
            event.stopPropagation();
            onViewProfile?.();
          }}
        />
        <span className="pill pill-online">
          <i className="dot-green" style={!profile.online ? { background: "#888", boxShadow: "none" } : undefined} />
          {profile.online ? "Online" : activityPillText(profile)}
        </span>
        <span className="pill pill-distance">{profile.distance}</span>

        {isTop && (
          <>
            <motion.div className="stamp like" style={{ opacity: likeOp }}>
              LIKE
            </motion.div>
            <motion.div className="stamp nope" style={{ opacity: nopeOp }}>
              PASS
            </motion.div>
            <motion.div className="stamp sup" style={{ opacity: supOp }}>
              SUPER
            </motion.div>
          </>
        )}

        <div className="overlay">
          <div className="photo-dots" aria-hidden="true">
            <i className="active" />
            <i />
            <i />
            <i />
          </div>
          <div className="name-row">
            <h2>{profile.name}</h2>
            <span className="age">{profile.age}</span>
          </div>
          <p className="bio">{profile.bio}</p>
          <p className="prompt-line">{profile.prompt}</p>
          {isTop && (
            <button className="card-super-like" type="button" onClick={() => onSwipe("super")} aria-label={`Super like ${profile.name}`}>
              <StarIcon />
              <span>Super Like</span>
            </button>
          )}
          <div className="chips">
            {(profile.interests || []).slice(0, 4).map((interest) => (
              <span key={interest} className="chip">
                {interest}
              </span>
            ))}
            {(profile.interests || []).length > 4 && <span className="chip muted">+{profile.interests.length - 4}</span>}
          </div>
          <div className="card-details">
            {(profile.details || []).map((detail) => (
              <div key={detail.label}>
                <DetailIcon type={DETAIL_LABELS[detail.label]} />
                <span>{detail.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function MessagesScreen({
  state,
  onOpenChat,
  onArchiveConversation,
  onDeleteConversation,
  onCreateStory,
  onDeleteStory,
  onReactStory,
  onViewStory,
  onReplyStory
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [openConversationMenu, setOpenConversationMenu] = useState("");
  const [viewingProfile, setViewingProfile] = useState(null);
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [viewingStory, setViewingStory] = useState(null);
  const [storyClock, setStoryClock] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setStoryClock(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const storyItems = useMemo(
    () => {
      const ownStory = activeStoryFrom(state.stories, storyClock);
      const matchStories = state.matches
        .filter((match) => !match.deletedAt && !match.archivedAt)
        .map(profileForMatch)
        .filter(Boolean)
        .map((profile) => {
          const story = activeStoryFrom(profile.activeStory, storyClock);
          return {
            id: profile.id,
            name: profile.name,
            img: profile.image,
            profile: normalizeViewerProfile(profile),
            add: false,
            online: profile.online,
            story
          };
        })
        .filter((item) => item.story)
        .sort((a, b) => Number(b.story?.createdAt || 0) - Number(a.story?.createdAt || 0))
        .slice(0, 10);

      return [
        {
          id: "me",
          name: "You",
          img: state.user.image,
          profile: normalizeViewerProfile({ ...state.user, id: state.auth?.id }),
          add: true,
          online: false,
          story: ownStory
        },
        ...matchStories
      ];
    },
    [state.auth?.id, state.matches, state.profiles, state.stories, state.user, storyClock]
  );
  const storyProfileIds = useMemo(
    () => new Set(storyItems.filter((item) => !item.add && item.story?.id).map((item) => item.id)),
    [storyItems]
  );

  useEffect(() => {
    setViewingStory((current) => {
      if (!current?.story) return current;
      const story =
        current.id === "me"
          ? activeStoryFrom(state.stories, storyClock)
          : activeStoryFrom(profileForMatch(state.matches.find((match) => match.profileId === current.id))?.activeStory, storyClock);
      if (!story || story.id !== current.story.id || story === current.story) return current;
      return { ...current, story };
    });
  }, [state.matches, state.profiles, state.stories, storyClock]);

  const activeMatches = state.matches.filter((match) => !match.archivedAt && !match.deletedAt);
  const archivedMatches = state.matches.filter((match) => match.archivedAt && !match.deletedAt);
  const sourceMatches = showArchived ? archivedMatches : activeMatches;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sourceMatches
      .map((match) => {
        const profile = profileForMatch(match);
        return profile ? { match, profile, last: match.messages[match.messages.length - 1] } : null;
      })
      .filter(Boolean)
      .filter(({ profile, last }) => {
        if (!q) return true;
        return profile.name.toLowerCase().includes(q) || last?.text.toLowerCase().includes(q);
      });
  }, [query, sourceMatches]);

  const archiveConversation = async (profileId, archived) => {
    setOpenConversationMenu("");
    await onArchiveConversation?.(profileId, archived);
  };

  const deleteConversation = async (profileId, name) => {
    setOpenConversationMenu("");
    if (!window.confirm(`Delete conversation with ${name}?`)) return;
    await onDeleteConversation?.(profileId);
  };

  return (
    <section className="screen" aria-label="Messages">
      <header className="topbar">
        <h1 className="page-title">Messages</h1>
        <button
          className={`icon-btn round ${showSearch ? "active" : ""}`}
          aria-label="Search messages"
          onClick={() => {
            setShowSearch((value) => !value);
            if (showSearch) setQuery("");
          }}
        >
          <SearchIcon />
        </button>
      </header>

      <AnimatePresence>
        {showSearch && (
          <motion.div
            className="search-row"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or message" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="stories">
        {storyItems.map((story) => (
          <button
            key={story.id}
            className={`story ${story.story ? "has-story" : ""} ${story.online ? "is-online" : ""}`}
            type="button"
            onClick={() => {
              if (story.story) {
                primeStoryMusic(story.story);
                setViewingStory(story);
                if (!story.add) onViewStory?.(story.id, story.story.id);
                return;
              }
              if (story.add) setStoryComposerOpen(true);
              else onOpenChat?.(story.id);
            }}
            aria-label={
              story.story
                ? `View ${story.name}'s story`
                : story.add
                  ? "Add story"
                  : `Message ${story.name}`
            }
          >
            <div className={`ring ${story.add && !story.story ? "add" : ""} ${story.story ? "active" : ""}`}>
              {story.add && !story.story ? "+" : <img src={story.img} alt="" />}
            </div>
            {story.add && story.story && <i className="story-add-badge">+</i>}
            <span>{story.name}</span>
            {story.online && <i className="online" />}
          </button>
        ))}
      </div>

      <div className="section-label">
        <span>{showArchived ? "Archived" : "Your matches"}</span>
        <button type="button" className="text-toggle" onClick={() => setShowArchived((value) => !value)}>
          {showArchived ? `${activeMatches.length} active` : `${archivedMatches.length} archived`}
        </button>
      </div>

      {activeMatches.length === 0 && archivedMatches.length === 0 ? (
        <EmptyState title="No conversations yet" subtitle="Match with someone in Discover to start chatting." />
      ) : matches.length === 0 ? (
        <EmptyState
          title={query ? "No results" : showArchived ? "No archived conversations" : "No active conversations"}
          subtitle={query ? "Try a different name or message." : showArchived ? "Archived chats will show here." : "Open archived or start a new chat."}
        />
      ) : (
        <ul className="chat-list">
          {matches.map(({ match, profile, last }) => {
            const unread = match.messages.length === 0;
            const hasStory = storyProfileIds.has(profile.id);
            return (
              <li key={match.profileId} className="conversation-item">
                <button className="chat" onClick={() => onOpenChat(profile.id)} aria-label={`Open chat with ${profile.name}`}>
                  <span
                    className={`profile-avatar-frame ${hasStory ? "has-story" : ""} ${profile.online ? "online" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      setViewingProfile(normalizeViewerProfile(profile));
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      event.stopPropagation();
                      setViewingProfile(normalizeViewerProfile(profile));
                    }}
                  >
                    <img src={profile.image} alt="" loading="lazy" />
                    {profile.online && <i className="online-dot" aria-hidden="true" />}
                  </span>
                  <div>
                    <div className="r1">
                      <b>{profile.name}</b>
                      <span>{relativeTime(last?.ts ?? match.matchedAt)}</span>
                    </div>
                    <div className={`r2 ${last ? "" : "muted"}`}>
                      {last ? <span>{last.from === "me" ? "You: " : ""}{last.text}</span> : <em>Say hi</em>}
                      {unread && <span className="badge-pill">New</span>}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  className="conversation-menu-btn"
                  onClick={() => setOpenConversationMenu((current) => (current === match.profileId ? "" : match.profileId))}
                  aria-label={`Conversation options for ${profile.name}`}
                >
                  <MoreIcon />
                </button>
                {openConversationMenu === match.profileId && (
                  <div className="conversation-menu">
                    <button type="button" onClick={() => archiveConversation(profile.id, !match.archivedAt)}>
                      {match.archivedAt ? "Unarchive" : "Archive"}
                    </button>
                    <button type="button" onClick={() => deleteConversation(profile.id, profile.name)}>
                      Delete conversation
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <AnimatePresence>
        {storyComposerOpen && (
          <StoryComposer
            user={state.user}
            onClose={() => setStoryComposerOpen(false)}
            onSubmit={onCreateStory}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {viewingStory?.story && (
          <StoryViewer
            item={viewingStory}
            own={viewingStory.add}
            onClose={() => setViewingStory(null)}
          onCreateAnother={() => {
            setViewingStory(null);
            setStoryComposerOpen(true);
          }}
          onReact={(reaction) => onReactStory?.(viewingStory.id, viewingStory.story.id, reaction)}
          onReply={(text) => onReplyStory?.(viewingStory.id, viewingStory.story.id, text)}
          onDelete={async () => {
            const result = await onDeleteStory?.(viewingStory.story.id);
            if (result?.ok) setViewingStory(null);
              return result;
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {viewingProfile && (
          <ProfileViewer
            profile={viewingProfile}
            posts={state.feed}
            onClose={() => setViewingProfile(null)}
            onMessage={() => {
              const id = viewingProfile.id;
              setViewingProfile(null);
              if (id) window.setTimeout(() => onOpenChat(id), 80);
            }}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

function StoryComposer({ user, onClose, onSubmit }) {
  const [text, setText] = useState("");
  const [media, setMedia] = useState(null);
  const [music, setMusic] = useState(null);
  const [musicQuery, setMusicQuery] = useState("");
  const [musicOpen, setMusicOpen] = useState(false);
  const [youtubeResults, setYoutubeResults] = useState([]);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeError, setYoutubeError] = useState("");
  const [youtubeConfigured, setYoutubeConfigured] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const imageInput = useRef(null);
  const videoInput = useRef(null);
  const audioInput = useRef(null);
  const musicResults = useMemo(() => searchStoryMusic(musicQuery), [musicQuery]);
  const musicMaxStart = useMemo(() => {
    if (!music) return 0;
    if (music.source === "upload" && Number.isFinite(music.durationSeconds)) {
      return Math.max(0, Math.floor(music.durationSeconds - 60));
    }
    return 600;
  }, [music]);

  const updateMusicStart = (value) => {
    const startAt = Math.max(0, Math.min(musicMaxStart, Number(value) || 0));
    setMusic((current) => (current ? { ...current, startAt, duration: 60 } : current));
  };

  useEffect(() => {
    if (!musicOpen) return undefined;

    const query = musicQuery.trim();
    if (query.length < 2) {
      setYoutubeResults([]);
      setYoutubeError("");
      setYoutubeLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setYoutubeLoading(true);
      setYoutubeError("");

      try {
        const result = await api(`/music/search?q=${encodeURIComponent(query)}`);
        if (cancelled) return;
        setYoutubeConfigured(result.configured !== false);
        setYoutubeResults(Array.isArray(result.tracks) ? result.tracks : []);
        setYoutubeError(result.configured === false ? result.message || "Add YOUTUBE_API_KEY to enable YouTube search." : "");
      } catch {
        if (!cancelled) {
          setYoutubeResults([]);
          setYoutubeError("YouTube search is unavailable right now.");
        }
      } finally {
        if (!cancelled) setYoutubeLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [musicOpen, musicQuery]);

  const readMedia = (file, expectedType) => {
    if (!file) return;
    setError("");

    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    const type = isVideo ? "video" : isImage ? "image" : "";

    if (!type || type !== expectedType) {
      setError(`Choose a valid ${expectedType} file.`);
      return;
    }

    if (file.size > MAX_STORY_MEDIA_BYTES) {
      setError("Story media must be 10MB or smaller.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setMedia({
        type,
        src: reader.result,
        name: file.name,
        mime: file.type
      });
      if (imageInput.current) imageInput.current.value = "";
      if (videoInput.current) videoInput.current.value = "";
    };
    reader.onerror = () => setError("Could not read that file. Please try another one.");
    reader.readAsDataURL(file);
  };

  const readAudio = (file) => {
    if (!file) return;
    setError("");

    const name = file.name || "Uploaded audio";
    const isAudio = file.type.startsWith("audio/") || /\.(mp3|m4a|aac|wav|ogg|webm)$/i.test(name);
    if (!isAudio) {
      setError("Choose a valid MP3 or audio file.");
      return;
    }

    if (file.size > MAX_STORY_AUDIO_BYTES) {
      setError("Story music must be 8MB or smaller.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || "");
      const musicId = `upload-${Date.now()}`;
      setMusic({
        source: "upload",
        id: musicId,
        title: name.replace(/\.[^.]+$/, "") || "Uploaded audio",
        artist: "Uploaded audio",
        src,
        mime: file.type || "audio/mpeg",
        startAt: 0,
        duration: 60
      });
      const probe = new Audio();
      probe.preload = "metadata";
      probe.onloadedmetadata = () => {
        const durationSeconds = Number.isFinite(probe.duration) ? probe.duration : 0;
        setMusic((current) => (current?.id === musicId ? { ...current, durationSeconds } : current));
      };
      probe.src = src;
      setMusicOpen(false);
      if (audioInput.current) audioInput.current.value = "";
    };
    reader.onerror = () => setError("Could not read that audio file. Please try another one.");
    reader.readAsDataURL(file);
  };

  const submit = async (event) => {
    event.preventDefault();
    const body = text.trim();
    if (!body && !media && !music) return;

    setBusy(true);
    const result = await onSubmit?.({
      type: media?.type || "text",
      text: body,
      media: media?.src || "",
      name: media?.name || "",
      mime: media?.mime || "",
      music: music
        ? {
            source: music.source || "synth",
            id: music.id,
            title: music.title,
            artist: music.artist,
            src: music.src || "",
            mime: music.mime || "",
            youtubeId: music.youtubeId || "",
            thumbnail: music.thumbnail || "",
            startAt: Math.max(0, Number(music.startAt) || 0),
            duration: 60
          }
        : null
    });
    setBusy(false);

    if (result?.ok) onClose();
    else setError(result?.error || "Story failed.");
  };

  return (
    <motion.div
      className="story-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Create story"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.form
        className="story-editor"
        onSubmit={submit}
        initial={{ y: 42, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 28, opacity: 0 }}
        transition={{ type: "spring", damping: 24, stiffness: 240 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="story-editor-head">
          <div>
            <b>Create story</b>
            <span>{Math.round(STORY_TTL_MS / 3600000)}h</span>
          </div>
          <button type="button" className="pv-close" onClick={onClose} aria-label="Close story composer">
            x
          </button>
        </div>

        <div className={`story-draft ${media ? "has-media" : ""}`}>
          {media?.type === "image" && <img src={media.src} alt={media.name || "Story preview"} />}
          {media?.type === "video" && <video src={media.src} controls />}
          {!media && <img src={user.image} alt="" />}
          <textarea
            rows="4"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Say something..."
            maxLength={280}
            aria-label="Story text"
          />
          {media && (
            <button type="button" className="story-remove-media" onClick={() => setMedia(null)} aria-label="Remove story media">
              x
            </button>
          )}
          {music && (
            <div className="story-music-sticker">
              <MusicIcon />
              <span>{music.title} - {formatClipTime(music.startAt || 0)}</span>
            </div>
          )}
        </div>

        {error && <p className="composer-error" role="alert">{error}</p>}

        <div className="story-music-panel">
          <button
            type="button"
            className={`story-music-trigger ${music ? "active" : ""}`}
            onClick={() => setMusicOpen((value) => !value)}
            aria-expanded={musicOpen}
          >
            <MusicIcon />
            <span>{music ? `${music.title} - ${music.artist}` : "Add music"}</span>
          </button>
          {music && (
            <button type="button" className="story-music-clear" onClick={() => setMusic(null)} aria-label="Remove story music">
              x
            </button>
          )}
          {musicOpen && (
            <div className="story-music-search">
              <input
                value={musicQuery}
                onChange={(event) => setMusicQuery(event.target.value)}
                placeholder="Search music"
                aria-label="Search story music"
              />
              <button type="button" className="story-music-upload" onClick={() => audioInput.current?.click()}>
                <MusicIcon />
                <span>Upload MP3/audio</span>
              </button>
              <div className="story-music-results">
                <strong className="story-music-group-title">Flame Originals</strong>
                {musicResults.map((track) => (
                  <button
                    key={track.id}
                    type="button"
                    className={music?.id === track.id ? "active" : ""}
                    onClick={() => {
                      setMusic({ ...track, source: "synth", startAt: 0, duration: 60, durationSeconds: 600 });
                      setMusicOpen(false);
                    }}
                  >
                    <span>{track.title}</span>
                    <small>{track.artist} - {track.tags.slice(0, 2).join(", ")}</small>
                  </button>
                ))}
                <strong className="story-music-group-title">YouTube</strong>
                {musicQuery.trim().length < 2 ? (
                  <p className="story-music-note">Type at least 2 characters to search YouTube.</p>
                ) : youtubeLoading ? (
                  <p className="story-music-note">Searching YouTube...</p>
                ) : youtubeError ? (
                  <p className="story-music-note">{youtubeError}</p>
                ) : youtubeResults.length > 0 ? (
                  youtubeResults.map((track) => (
                    <button
                      key={track.id}
                      type="button"
                      className={`youtube-track ${music?.id === track.id ? "active" : ""}`}
                      onClick={() => {
                        setMusic({ ...track, startAt: 0, duration: 60, durationSeconds: 600 });
                        setMusicOpen(false);
                      }}
                    >
                      {track.thumbnail ? <img className="story-music-thumb" src={track.thumbnail} alt="" /> : <MusicIcon />}
                      <span>
                        <b>{track.title}</b>
                        <small>{track.artist || "YouTube"}</small>
                      </span>
                    </button>
                  ))
                ) : youtubeConfigured ? (
                  <p className="story-music-note">No YouTube results found.</p>
                ) : (
                  <p className="story-music-note">Add YOUTUBE_API_KEY to Backend/.env to enable YouTube search.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {music && (
          <div className="story-clip-picker">
            <div>
              <b>Music starts at</b>
              <span>{formatClipTime(music.startAt || 0)} - plays 1 minute</span>
            </div>
            <input
              type="range"
              min="0"
              max={musicMaxStart}
              step="1"
              value={Math.min(musicMaxStart, Number(music.startAt) || 0)}
              onChange={(event) => updateMusicStart(event.target.value)}
              disabled={musicMaxStart <= 0}
              aria-label="Choose where the story music starts"
            />
          </div>
        )}

        <div className="story-editor-actions">
          <button type="button" className="secondary-cta compact" onClick={() => imageInput.current?.click()}>
            <PaperclipIcon />
            <span>Image</span>
          </button>
          <button type="button" className="secondary-cta compact" onClick={() => videoInput.current?.click()}>
            <VideoIcon />
            <span>Video</span>
          </button>
          <button className="cta compact" type="submit" disabled={busy || (!text.trim() && !media && !music)}>
            Share
          </button>
        </div>

        <input ref={imageInput} type="file" accept="image/*" hidden onChange={(event) => readMedia(event.target.files?.[0], "image")} />
        <input ref={videoInput} type="file" accept="video/*" hidden onChange={(event) => readMedia(event.target.files?.[0], "video")} />
        <input ref={audioInput} type="file" accept="audio/mpeg,audio/mp3,audio/*" hidden onChange={(event) => readAudio(event.target.files?.[0])} />
      </motion.form>
    </motion.div>
  );
}

function StoryViewer({ item, own, onClose, onCreateAnother, onDelete, onReact, onReply }) {
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [reaction, setReaction] = useState(item.story.reaction || "");
  const [reactionCounts, setReactionCounts] = useState(item.story.reactionCounts || {});
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const story = item.story;
  const reactionOptions = useMemo(() => new Map(FEED_REACTIONS.map((option) => [option.id, option])), []);
  const totalReactions = reactionTotal(reactionCounts);
  const viewers = Array.isArray(story.viewers) ? story.viewers : [];
  const reactionUsers = Array.isArray(story.reactionUsers) ? story.reactionUsers : [];
  const replies = Array.isArray(story.replies) ? story.replies : [];
  const viewCount = Number(story.viewCount) || viewers.length;
  const replyCount = Number(story.replyCount) || replies.length;

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setReaction(story.reaction || "");
    setReactionCounts(story.reactionCounts || {});
  }, [story.id, story.reaction, story.reactionCounts]);

  const removeStory = async () => {
    if (!window.confirm("Remove your story?")) return;
    setBusy(true);
    await onDelete?.();
    setBusy(false);
  };

  const react = async (nextReaction) => {
    const previous = reaction;
    const outgoing = previous === nextReaction ? "" : nextReaction;
    setReaction(outgoing);
    setReactionCounts((counts) => nextReactionCounts(counts, previous, outgoing));
    const result = await onReact?.(outgoing);
    if (result && !result.ok) {
      setReaction(previous);
      setReactionCounts((counts) => nextReactionCounts(counts, outgoing, previous));
    }
  };

  const sendReply = async (event) => {
    event.preventDefault();
    const message = replyText.trim();
    if (!message) return;
    setReplyBusy(true);
    const result = await onReply?.(message);
    setReplyBusy(false);
    if (result?.ok) setReplyText("");
  };

  return (
    <motion.div
      className="story-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.name}'s story`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="story-viewer-card"
        initial={{ scale: 0.96, y: 24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.98, y: 18, opacity: 0 }}
        transition={{ type: "spring", damping: 24, stiffness: 230 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="story-viewer-progress" aria-hidden="true" />
        <div className="story-viewer-head">
          <div className="story-viewer-person">
            <img src={item.img} alt="" />
            <div>
              <b>{item.name}</b>
              <div className="story-head-meta">
                {story.music && <StoryMusicPlayer music={story.music} storyId={story.id} />}
                <span>{storyPostedAgo(story, now)}</span>
              </div>
            </div>
          </div>
          <button type="button" className="pv-close" onClick={onClose} aria-label="Close story">
            x
          </button>
        </div>

        <div className={`story-viewer-media ${story.type}`}>
          {story.type === "image" && <img src={story.media} alt={story.name || `${item.name}'s story`} />}
          {story.type === "video" && <video src={story.media} controls autoPlay />}
          {story.type === "text" && (story.text || story.music?.title) && <p>{story.text || story.music?.title}</p>}
          {story.type !== "text" && story.text && <p className="story-caption">{story.text}</p>}
        </div>

        {!own && (
          <div className="story-reactions" aria-label="React to story">
            {totalReactions > 0 && <span>{totalReactions} {totalReactions === 1 ? "reaction" : "reactions"}</span>}
            <div>
              {FEED_REACTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={reaction === option.id ? "active" : ""}
                  onClick={() => react(option.id)}
                  aria-label={`React ${option.label}`}
                  disabled={busy}
                >
                  <AnimatedEmoji reaction={option} className="tiny" />
                  {reactionCounts[option.id] > 0 && <small>{reactionCounts[option.id]}</small>}
                </button>
              ))}
            </div>
          </div>
        )}

        {!own && (
          <form className="story-reply-form" onSubmit={sendReply}>
            <input
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              placeholder={`Reply to ${item.name}'s story...`}
              maxLength={240}
              aria-label={`Reply to ${item.name}'s story`}
            />
            <button type="submit" disabled={replyBusy || !replyText.trim()}>
              Send
            </button>
          </form>
        )}

        {own && (
          <div className="story-viewers" aria-label="Story viewers">
            <div>
              <b>Viewed by</b>
              <span>{viewCount}</span>
            </div>
            {viewers.length > 0 ? (
              <ul>
                {viewers.slice(0, 12).map((viewer) => {
                  const viewerReaction = reactionOptions.get(viewer.reaction);
                  return (
                    <li key={viewer.id}>
                      <img src={viewer.image} alt="" />
                      <span>{viewer.name}</span>
                      <span className={`story-viewer-reaction ${viewerReaction ? "" : "empty"}`} title={viewerReaction?.label || "No reaction"}>
                        {viewerReaction && <AnimatedEmoji reaction={viewerReaction} className="micro" />}
                      </span>
                      <small>{storyPostedAgo({ createdAt: viewer.viewedAt }, now)}</small>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p>No views yet.</p>
            )}
          </div>
        )}

        {own && reactionUsers.length > 0 && (
          <div className="story-reaction-users" aria-label="Story reactions">
            <div>
              <b>Reactions</b>
              <span>{reactionUsers.length}</span>
            </div>
            <ul>
              {reactionUsers.slice(0, 12).map((entry) => {
                const entryReaction = reactionOptions.get(entry.reaction);
                return (
                  <li key={`${entry.user.id}-${entry.reaction}`}>
                    <img src={entry.user.image} alt="" />
                    <span>{entry.user.name}</span>
                    <strong>
                      {entryReaction && <AnimatedEmoji reaction={entryReaction} className="micro" />}
                      {entryReaction?.label || entry.reaction}
                    </strong>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {own && (
          <div className="story-replies" aria-label="Story replies">
            <div>
              <b>Replies</b>
              <span>{replyCount}</span>
            </div>
            {replies.length > 0 ? (
              <ul>
                {replies.slice(0, 12).map((reply) => (
                  <li key={reply.id}>
                    <img src={reply.user.image} alt="" />
                    <span>
                      <b>{reply.user.name}</b>
                      <em>{reply.text}</em>
                    </span>
                    <small>{storyPostedAgo({ createdAt: reply.createdAt }, now)}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No replies yet.</p>
            )}
          </div>
        )}

        {own && (
          <div className="story-owner-actions">
            <button type="button" className="secondary-cta compact" onClick={onCreateAnother}>
              New story
            </button>
            <button type="button" className="secondary-cta compact danger" onClick={removeStory} disabled={busy}>
              Remove
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function UploadedStoryMusicPlayer({ music, storyId }) {
  const audioRef = useRef(null);
  const [playback, setPlayback] = useState("loading");
  const startAt = Math.max(0, Number(music.startAt) || 0);
  const duration = Math.max(1, Math.min(60, Number(music.duration) || 60));

  const playAudio = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.muted = false;
      audio.volume = 1;
      audio.currentTime = Math.min(startAt, Number.isFinite(audio.duration) ? Math.max(0, audio.duration - 0.25) : startAt);
      await audio.play();
      setPlayback("playing");
    } catch {
      setPlayback("blocked");
    }
  }, [startAt]);

  useEffect(() => {
    const audio = takePrimedStoryAudio(storyId) || new Audio(music.src);
    audioRef.current = audio;
    audio.preload = "auto";
    audio.autoplay = true;
    audio.muted = false;
    audio.volume = 1;
    setPlayback(audio.paused ? "loading" : "playing");

    const stopAtClipEnd = () => {
      if (audio.currentTime >= startAt + duration) {
        audio.pause();
        audio.currentTime = startAt;
      }
    };
    const seekToStart = () => {
      try {
        audio.currentTime = Math.min(startAt, Number.isFinite(audio.duration) ? Math.max(0, audio.duration - 0.25) : startAt);
      } catch {
        // Some browsers only allow seeking after metadata is ready.
      }
    };
    const playFromClip = () => {
      seekToStart();
      audio.play()
        .then(() => setPlayback("playing"))
        .catch(() => setPlayback("blocked"));
    };
    const markPlaying = () => setPlayback("playing");
    const markPaused = () => setPlayback("blocked");

    audio.addEventListener("loadedmetadata", seekToStart);
    audio.addEventListener("timeupdate", stopAtClipEnd);
    audio.addEventListener("canplay", playFromClip, { once: true });
    audio.addEventListener("playing", markPlaying);
    audio.addEventListener("pause", markPaused);
    seekToStart();
    audio.play()
      .then(() => setPlayback("playing"))
      .catch(() => setPlayback("blocked"));
    return () => {
      audio.removeEventListener("loadedmetadata", seekToStart);
      audio.removeEventListener("timeupdate", stopAtClipEnd);
      audio.removeEventListener("canplay", playFromClip);
      audio.removeEventListener("playing", markPlaying);
      audio.removeEventListener("pause", markPaused);
      audio.pause();
      audioRef.current = null;
    };
  }, [storyId, music.src, startAt, duration]);

  return (
    <div className="story-music-now story-music-audio">
      <MusicIcon />
      <div>
        <b>{music.title}</b>
        <span>{formatClipTime(startAt)} - 1:00 clip</span>
      </div>
      <button type="button" onClick={playAudio} aria-label={playback === "playing" ? "Story audio playing" : "Play story audio"}>
        {playback === "playing" ? <VolumeIcon /> : <VolumeOffIcon />}
      </button>
    </div>
  );
}

function YouTubeStoryMusicPlayer({ music }) {
  const href = youtubeWatchUrl(music.youtubeId, music.startAt);
  const autoplaySrc = youtubeAutoplayUrl(music.youtubeId, music.startAt);
  if (!href) return null;

  return (
    <div className="story-music-now story-music-youtube">
      <MusicIcon />
      <div>
        <b>{music.title}</b>
        <span>{formatClipTime(music.startAt || 0)} - YouTube</span>
      </div>
      {autoplaySrc && (
        <span className="story-youtube-autoplay" aria-hidden="true">
          <iframe title={`${music.title} autoplay`} src={autoplaySrc} allow="autoplay; encrypted-media" />
        </span>
      )}
      <a href={href} target="_blank" rel="noreferrer" aria-label="Play story music on YouTube">
        <VolumeIcon />
      </a>
    </div>
  );
}

function StoryMusicPlayer({ music, storyId }) {
  if (music?.source === "upload" && music.src) return <UploadedStoryMusicPlayer music={music} storyId={storyId} />;
  if (music?.source === "youtube" && music.youtubeId) return <YouTubeStoryMusicPlayer music={music} />;

  return <SynthStoryMusicPlayer music={music} storyId={storyId} />;
}

function SynthStoryMusicPlayer({ music, storyId }) {
  const track = musicTrackFrom(music);
  const playerRef = useRef(null);

  const stopMusic = () => {
    const player = playerRef.current;
    if (!player) return;

    window.clearInterval(player.interval);
    window.clearTimeout(player.timeout);
    player.nodes.forEach((node) => {
      try {
        node.stop();
      } catch {
        // The note may already be finished.
      }
    });
    player.context.close().catch(() => {});
    playerRef.current = null;
  };

  const startMusic = async () => {
    if (!track) return;
    stopMusic();

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }

    const context = new AudioContextClass();
    const master = context.createGain();
    master.gain.value = 0.18;
    master.connect(context.destination);

    const beatMs = (60 / track.bpm) * 1000;
    const startAt = Math.max(0, Number(music.startAt) || 0);
    const duration = Math.max(1, Math.min(60, Number(music.duration) || 60));
    const player = {
      context,
      master,
      interval: null,
      timeout: null,
      nodes: [],
      step: Math.floor((startAt * 1000) / beatMs)
    };
    playerRef.current = player;

    const playTone = (note, start, duration, type, gain) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(noteFrequency(note), start);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(gain, start + 0.025);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(envelope);
      envelope.connect(master);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.04);
      player.nodes.push(oscillator);
      oscillator.onended = () => {
        player.nodes = player.nodes.filter((node) => node !== oscillator);
      };
    };

    const playStep = () => {
      const start = context.currentTime + 0.03;
      const chord = track.chords[player.step % track.chords.length];
      const bass = track.bass[player.step % track.bass.length];
      const melody = track.melody[player.step % track.melody.length];

      chord.forEach((note, index) => playTone(note, start + index * 0.018, 0.36, "sine", 0.035));
      playTone(bass, start, 0.55, "triangle", 0.075);
      playTone(melody, start + 0.2, 0.22, "square", 0.018);
      player.step += 1;
    };

    try {
      await context.resume();
      playStep();
      player.interval = window.setInterval(playStep, beatMs);
      player.timeout = window.setTimeout(stopMusic, duration * 1000);
    } catch {
      stopMusic();
    }
  };

  useEffect(() => {
    if (!track) return undefined;
    startMusic();
    return () => stopMusic();
  }, [storyId, track?.id, music.startAt]);

  if (!track) return null;

  return (
    <div className="story-music-now">
      <MusicIcon />
      <div>
        <b>{track.title}</b>
        <span>{track.artist}</span>
      </div>
    </div>
  );
}

function MatchHistory({ state, posts = [], onOpenChat }) {
  const [viewing, setViewing] = useState(null);
  const onlineMatches = useMemo(
    () => state.matches.filter((match) => profileForMatch(match)?.online),
    [state.matches]
  );
  const sortedMatches = useMemo(
    () => [...state.matches].sort((a, b) => b.matchedAt - a.matchedAt),
    [state.matches]
  );

  return (
    <section className="screen" aria-label="Match history">
      <header className="topbar">
        <h1 className="page-title">Matches</h1>
        <span className="badge-pill" aria-label={`${state.matches.length} matches`}>
          {state.matches.length}
        </span>
      </header>

      {state.matches.length === 0 ? (
        <EmptyState title="No matches yet" subtitle="Keep swiping. When someone likes you back, they will show up here." />
      ) : (
        <>
          {onlineMatches.length > 0 && (
            <div className="match-top-row">
              <div className="section-label">
                <span>New matches</span>
                <span className="accent">{onlineMatches.length} online</span>
              </div>
              <div className="match-new-row">
                {onlineMatches.map((match) => {
                  const profile = profileForMatch(match);
                  if (!profile) return null;
                  return (
                    <button
                      key={match.profileId}
                      className="new-match-card"
                      onClick={() => setViewing(profile)}
                      aria-label={`View ${profile.name}'s profile`}
                    >
                      <span className={`profile-avatar-frame ${activeStoryFrom(profile.activeStory) ? "has-story" : ""} ${profile.online ? "online" : ""}`}>
                        <img src={profile.image} alt={profile.name} loading="lazy" />
                        {profile.online && <i className="online-dot" aria-hidden="true" />}
                      </span>
                      <div className="new-match-info">
                        <div>
                          <b>{profile.name}</b>
                          <span>{profile.age}</span>
                        </div>
                        <span className="online-pill">Online</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="section-label">
            <span>People who liked you</span>
            <span className="accent">Tap to reply</span>
          </div>

          <ul className="liked-you-list">
            {sortedMatches.map((match) => {
              const profile = profileForMatch(match);
              const last = match.messages[match.messages.length - 1];
              if (!profile) return null;
              return (
                <li key={match.profileId}>
                  <button className="liked-you" onClick={() => onOpenChat(profile.id)} aria-label={`Message ${profile.name}`}>
                    <span
                      className={`profile-avatar-frame ${activeStoryFrom(profile.activeStory) ? "has-story" : ""} ${profile.online ? "online" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        setViewing(normalizeViewerProfile(profile));
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.stopPropagation();
                        setViewing(normalizeViewerProfile(profile));
                      }}
                    >
                      <img src={profile.image} alt={profile.name} loading="lazy" />
                      {profile.online && <i className="online-dot" aria-hidden="true" />}
                    </span>
                    <div className="liked-meta">
                      <div className="r1">
                        <b>{profile.name}</b>
                        <span>{relativeTime(last?.ts ?? match.matchedAt)}</span>
                      </div>
                      <div className="r2">
                        {last ? <span>{last.from === "me" ? "You: " : ""}{last.text}</span> : <em>Tap to reply</em>}
                      </div>
                    </div>
                    {match.messages.length === 0 && <span className="badge-pill">New</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <AnimatePresence>
        {viewing && (
          <ProfileViewer
            profile={viewing}
            posts={posts}
            onClose={() => setViewing(null)}
            onMessage={() => {
              const id = viewing.id;
              setViewing(null);
              window.setTimeout(() => onOpenChat(id), 80);
            }}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

function ProfileViewer({ profile, posts = [], onClose, onMessage }) {
  const viewer = normalizeViewerProfile(profile);
  const latestPosts = posts
    .filter((post) => post.author?.id && post.author.id === viewer.id)
    .slice(0, 3);
  return (
    <motion.div
      className="profile-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`${viewer.name}'s profile`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="profile-viewer-card"
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ type: "spring", damping: 24, stiffness: 240 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`pv-photo ${viewer.activeStory ? "has-story" : ""} ${viewer.online ? "online" : ""}`}>
          <img src={viewer.image} alt={viewer.name} />
          {viewer.online && <i className="online-dot" aria-hidden="true" />}
          <button className="pv-close" onClick={onClose} aria-label="Close profile">
            x
          </button>
          <div className="overlay">
            <div className="name-row">
              <h2>{viewer.name}</h2>
              <span className="age">{viewer.age}</span>
            </div>
            <p className="bio">{viewer.bio}</p>
          </div>
        </div>
        <div className="pv-body">
          <div className="profile-prompt">
            <span>Prompt</span>
            <p>{viewer.prompt}</p>
          </div>
          <div className="chips">
            {viewer.interests.map((interest) => (
              <span key={interest} className="chip">
                {interest}
              </span>
            ))}
          </div>
          <div className="prefs">
            {viewer.details.map((detail) => (
              <div key={detail.label}>
                <span>{detail.label}</span>
                <b>{detail.value}</b>
              </div>
            ))}
          </div>
          <div className="profile-feed-preview">
            <div className="profile-feed-head">
              <span>Latest posts</span>
              <b>{latestPosts.length}</b>
            </div>
            {latestPosts.length === 0 ? (
              <p className="profile-feed-empty">No public posts yet.</p>
            ) : (
              latestPosts.map((post) => (
                <article key={post.id} className="profile-feed-post">
                  {post.text && <p>{post.text}</p>}
                  {post.media?.type === "image" && <img src={post.media.src} alt={post.media.name || "Post media"} />}
                  {post.media?.type === "video" && <video src={post.media.src} controls />}
                  <span>{relativeTime(post.createdAt)}</span>
                </article>
              ))
            )}
          </div>
          {onMessage && (
            <button className="cta" onClick={onMessage}>
              Send a message
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function StoryReplyPreview({ story }) {
  if (!story) return null;
  const type = ["image", "video"].includes(story.type) ? story.type : "text";
  const hasMedia = type !== "text" && Boolean(story.media);

  return (
    <span className={`message-story-preview ${type}`}>
      <span className="message-story-frame">
        {type === "image" && story.media && <img src={story.media} alt={story.name || "Story preview"} />}
        {type === "video" && story.media && <video src={story.media} muted playsInline />}
        {(type === "text" || !hasMedia) && <span className="message-story-text">{story.text || "Story"}</span>}
      </span>
      {story.replyText && <span className="message-story-answer">{story.replyText}</span>}
    </span>
  );
}

function legacyStoryReplyForMessage(message, own, profile, userStories) {
  const match = /^Story reply:\s*(.+)$/i.exec(String(message.text || "").trim());
  if (!match) return null;

  const story = own
    ? activeStoryFrom(profile.activeStory, Date.now())
    : activeStoryFrom(userStories, Date.now());
  if (!story) return null;

  return {
    ...story,
    ownerId: own ? profile.id : "",
    ownerName: own ? profile.name : "your story",
    replyText: match[1]
  };
}

function storyReplyTitle(message, storyReply, own, profile) {
  if (!storyReply) return "";
  if (message.storyReply && message.text) return message.text;
  return own
    ? `You replied to ${storyReply.ownerName || profile.name}'s story`
    : `${profile.name} replied to your story`;
}

function formatCallDuration(startedAt, endedAt = Date.now()) {
  const totalSeconds = Math.max(0, Math.floor((endedAt - startedAt) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function CallPanel({
  call,
  profile,
  localVideoRef,
  remoteVideoRef,
  remoteAudioRef,
  onAccept,
  onDecline,
  onEnd,
  onMinimize,
  onToggleMic,
  onTurnOnCamera,
  onSpeaker,
  error
}) {
  const incoming = call.direction === "incoming" && call.status === "ringing";
  const connecting = ["ringing", "connecting"].includes(call.status);
  const videoMode = call.mode === "video";

  return (
    <motion.div
      className="call-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${videoMode ? "Video" : "Audio"} call with ${profile.name}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className={`call-card ${videoMode ? "video" : "audio"}`}
        initial={{ y: 32, scale: 0.96, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 20, scale: 0.98, opacity: 0 }}
      >
        <div className="call-topbar">
          <div>
            <b>{profile.name}</b>
            <span>
              {incoming
                ? `Incoming ${videoMode ? "video" : "audio"} call`
                : call.status === "active"
                  ? `${videoMode ? "Video" : "Audio"} call`
                  : "Connecting..."}
            </span>
          </div>
          <button type="button" onClick={onMinimize} aria-label="Minimize call">
            <MinimizeIcon />
          </button>
        </div>

        <div className="call-stage">
          {videoMode ? (
            <video ref={remoteVideoRef} autoPlay playsInline className="call-remote-video" />
          ) : (
            <div className="call-audio-avatar">
              <img src={profile.image} alt="" />
              <span>{connecting ? "Ringing..." : "Connected"}</span>
            </div>
          )}
          {!videoMode && <audio ref={remoteAudioRef} autoPlay />}
          {videoMode && (
            <div className="call-local-preview">
              <video ref={localVideoRef} autoPlay playsInline muted />
            </div>
          )}
        </div>

        {error && <p className="call-error">{error}</p>}

        {incoming ? (
          <div className="call-actions incoming">
            <button type="button" className="call-btn accept" onClick={onAccept}>
              <PhoneIcon />
              <span>Accept</span>
            </button>
            <button type="button" className="call-btn end" onClick={onDecline}>
              <XIcon />
              <span>Decline</span>
            </button>
          </div>
        ) : (
          <div className="call-controls">
            <button type="button" className={`call-btn ${call.micOn ? "" : "muted"}`} onClick={onToggleMic}>
              <MicIcon />
              <span>{call.micOn ? "Mic on" : "Mic off"}</span>
            </button>
            {!videoMode && (
              <button type="button" className="call-btn" onClick={onTurnOnCamera}>
                <VideoIcon />
                <span>Turn on cam</span>
              </button>
            )}
            <div className="speaker-controls" aria-label="Speaker volume">
              <button type="button" className={call.speaker === "high" ? "active" : ""} onClick={() => onSpeaker("high")}>
                <VolumeIcon />
                <span>High</span>
              </button>
              <button type="button" className={call.speaker === "low" ? "active" : ""} onClick={() => onSpeaker("low")}>
                <VolumeIcon />
                <span>Low</span>
              </button>
              <button type="button" className={call.speaker === "off" ? "active" : ""} onClick={() => onSpeaker("off")}>
                <VolumeOffIcon />
                <span>Off</span>
              </button>
            </div>
            <button type="button" className="call-btn end" onClick={onEnd}>
              <XIcon />
              <span>End call</span>
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function MinimizedCall({ call, profile, remoteAudioRef, onRestore, onEnd }) {
  return (
    <div className="call-minimized" role="status">
      <button type="button" onClick={onRestore} aria-label="Restore call">
        {call.mode === "video" ? <VideoIcon /> : <PhoneIcon />}
        <span>{profile.name}</span>
        <small>{call.status === "active" ? "Live" : "Calling"}</small>
      </button>
      <button type="button" className="end" onClick={onEnd} aria-label="End call">
        <XIcon />
      </button>
      <audio ref={remoteAudioRef} autoPlay />
    </div>
  );
}

function ChatScreen({
  profile,
  user,
  userStories = [],
  messages,
  pinnedMessageIds = [],
  posts = [],
  forwardTargets = [],
  isTyping,
  onSend,
  onForward,
  onReport,
  onReact,
  onUnsend,
  onRemove,
  onTogglePinned,
  onArchiveConversation,
  onDeleteConversation,
  onBlockConversation,
  onTyping,
  pendingCallSignal = null,
  onPendingCallHandled,
  onClose
}) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingError, setRecordingError] = useState("");
  const [activeAction, setActiveAction] = useState(null);
  const [messageNotice, setMessageNotice] = useState("");
  const [viewingProfile, setViewingProfile] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [conversationQuery, setConversationQuery] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const fileInput = useRef(null);
  const voiceInput = useRef(null);
  const typingTimer = useRef(null);
  const typingActive = useRef(false);
  const recorderRef = useRef(null);
  const voiceChunks = useRef([]);
  const voiceStream = useRef(null);
  const voiceCancelled = useRef(false);
  const [call, setCall] = useState(null);
  const [callError, setCallError] = useState("");
  const callRef = useRef(null);
  const liveKitRoomRef = useRef(null);
  const endingCallRef = useRef(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const callSummarySent = useRef(new Set());
  const showTyping = Boolean(isTyping);
  const seenMessageId = useMemo(
    () => [...messages].reverse().find((message) => message.from === "me" && message.seenAt && !message.unsent)?.id,
    [messages]
  );
  const mediaMessages = useMemo(
    () => messages.filter((message) => !message.unsent && ["image", "video"].includes(message.type) && message.media),
    [messages]
  );
  const linkItems = useMemo(
    () =>
      messages.flatMap((message) =>
        message.unsent
          ? []
          : linksFromText(message.text).map((url) => ({
              id: `${message.id}-${url}`,
              url,
              from: message.from,
              ts: message.ts
            }))
      ),
    [messages]
  );
  const searchedMessages = useMemo(() => {
    const q = conversationQuery.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((message) =>
      [message.text, message.name, message.type, message.storyReply?.replyText, message.storyReply?.ownerName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [conversationQuery, messages]);

  const isActionOpen = (messageId, type) => activeAction?.id === messageId && activeAction.type === type;

  const toggleAction = (messageId, type) => {
    setActiveAction((current) =>
      current?.id === messageId && current.type === type ? null : { id: messageId, type }
    );
  };

  const showMessageNotice = (notice) => {
    setMessageNotice(notice);
    window.setTimeout(() => setMessageNotice(""), 1500);
  };

  const togglePinnedMessage = (messageId) => {
    const pinned = pinnedMessageIds.includes(messageId);
    onTogglePinned?.(messageId, !pinned);
    showMessageNotice(pinned ? "Message unpinned" : "Message pinned");
    setActiveAction(null);
  };

  const reportMessage = async (message) => {
    const result = await onReport?.(message);
    showMessageNotice(result?.ok === false ? "Report failed" : "Report sent");
    setActiveAction(null);
  };

  const archiveCurrentConversation = async () => {
    setMenuOpen(false);
    await onArchiveConversation?.();
  };

  const deleteCurrentConversation = async () => {
    setMenuOpen(false);
    if (!window.confirm(`Delete conversation with ${profile.name}?`)) return;
    await onDeleteConversation?.();
  };

  const blockCurrentConversation = async () => {
    setMenuOpen(false);
    if (!window.confirm(`Block ${profile.name}? They will not be able to message you anymore.`)) return;
    await onBlockConversation?.();
  };

  const setTypingStatus = (typing) => {
    if (typingActive.current === typing) return;
    typingActive.current = typing;
    onTyping?.(typing);
  };

  const sendCall = (payload) =>
    sendCallSignal({ profileId: profile.id, ...payload }).catch(() => {
      setCallError("Call connection failed. Please try again.");
    });

  const markCallActive = (mode = "") => {
    setCall((current) =>
      current
        ? {
            ...current,
            status: "active",
            mode: mode || current.mode,
            startedAt: current.startedAt || Date.now()
          }
        : current
    );
  };

  const attachPublication = (publication, element) => {
    const track = publication?.track || publication?.audioTrack || publication?.videoTrack;
    if (!track || !element) return false;
    track.attach(element);
    element.play?.().catch(() => {});
    return true;
  };

  const clearMediaElement = (element) => {
    if (!element) return;
    element.pause?.();
    element.removeAttribute("src");
    element.srcObject = null;
    element.load?.();
  };

  const attachLiveKitTracks = () => {
    const room = liveKitRoomRef.current;
    if (!room) return;

    const localCamera = room.localParticipant.getTrackPublication(Track.Source.Camera);
    if (!attachPublication(localCamera, localVideoRef.current)) clearMediaElement(localVideoRef.current);

    const remotes = Array.from(room.remoteParticipants.values());
    const remoteCamera = remotes
      .map((participant) => participant.getTrackPublication(Track.Source.Camera))
      .find((publication) => publication?.track || publication?.videoTrack);
    const remoteMic = remotes
      .map((participant) => participant.getTrackPublication(Track.Source.Microphone))
      .find((publication) => publication?.track || publication?.audioTrack);

    if (!attachPublication(remoteCamera, remoteVideoRef.current)) clearMediaElement(remoteVideoRef.current);
    if (!attachPublication(remoteMic, remoteAudioRef.current)) clearMediaElement(remoteAudioRef.current);

    if (remoteCamera) {
      setCall((current) => current ? { ...current, mode: "video", remoteHasVideo: true } : current);
    }
  };

  const connectLiveKitRoom = async (current, statusAfterConnect = "connecting") => {
    if (!current) return null;
    if (!window.isSecureContext) {
      throw new Error("Calls need HTTPS or localhost. Open the deployed link before calling.");
    }
    if (liveKitRoomRef.current) return liveKitRoomRef.current;

    const result = await createLiveKitCallToken({
      profileId: profile.id,
      callId: current.id,
      mode: current.mode
    });
    const credentials = result.livekit;
    if (!credentials?.url || !credentials?.token) {
      throw new Error("LiveKit call token is unavailable.");
    }

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution
      }
    });
    liveKitRoomRef.current = room;

    room
      .on(RoomEvent.ParticipantConnected, () => {
        markCallActive();
        attachLiveKitTracks();
      })
      .on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Video) {
          setCall((item) => item ? { ...item, mode: "video", remoteHasVideo: true } : item);
        }
        markCallActive(track.kind === Track.Kind.Video ? "video" : "");
        attachLiveKitTracks();
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach();
        window.setTimeout(attachLiveKitTracks, 0);
      })
      .on(RoomEvent.LocalTrackPublished, attachLiveKitTracks)
      .on(RoomEvent.LocalTrackUnpublished, (publication) => {
        publication.track?.detach();
        attachLiveKitTracks();
      })
      .on(RoomEvent.Disconnected, () => {
        if (endingCallRef.current) return;
        setCallError("Call disconnected.");
        window.setTimeout(() => stopCall(false), 700);
      });

    await room.connect(credentials.url, credentials.token);
    await room.localParticipant.setMicrophoneEnabled(true);
    if (current.mode === "video") {
      await room.localParticipant.setCameraEnabled(true);
    }

    setCall((item) =>
      item && item.id === current.id
        ? {
            ...item,
            status: statusAfterConnect,
            micOn: true,
            cameraOn: current.mode === "video",
            roomName: credentials.roomName || item.roomName
          }
        : item
    );
    window.setTimeout(attachLiveKitTracks, 0);
    return room;
  };

  const sendCallEndedMessage = (current) => {
    if (!current?.id || !current.startedAt || callSummarySent.current.has(current.id)) return;
    callSummarySent.current.add(current.id);
    const type = current.mode === "video" ? "Video" : "Audio";
    onSend({
      type: "text",
      text: `${type} call ended • Duration ${formatCallDuration(current.startedAt)}`
    });
  };

  const stopCall = (notify = true) => {
    const current = callRef.current;
    if (notify && current?.id) {
      sendCall({ kind: "end", callId: current.id });
      sendCallEndedMessage(current);
    }
    endingCallRef.current = true;
    const room = liveKitRoomRef.current;
    liveKitRoomRef.current = null;
    if (room) {
      room.removeAllListeners?.();
      room.disconnect(true).catch(() => {});
    }
    clearMediaElement(localVideoRef.current);
    clearMediaElement(remoteVideoRef.current);
    clearMediaElement(remoteAudioRef.current);
    setCall(null);
    setCallError("");
    window.setTimeout(() => {
      endingCallRef.current = false;
    }, 0);
  };

  const startCall = async (mode) => {
    if (callRef.current) return;
    const callId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setCallError("");
    setCall({
      id: callId,
      direction: "outgoing",
      status: "ringing",
      mode,
      micOn: true,
      speaker: "high",
      minimized: false,
      remoteHasVideo: false,
      createdAt: Date.now(),
      startedAt: 0
    });

    try {
      await connectLiveKitRoom({ id: callId, mode }, "ringing");
      await sendCallSignal({ profileId: profile.id, kind: "invite", callId, mode });
    } catch (error) {
      stopCall(false);
      showMessageNotice(error.message || "Could not start the call.");
    }
  };

  const acceptCall = async () => {
    const current = callRef.current;
    if (!current) return;
    setCallError("");
    try {
      setCall((item) => item ? { ...item, status: "connecting", micOn: true } : item);
      await connectLiveKitRoom(current, "connecting");
      await sendCallSignal({ profileId: profile.id, kind: "accept", callId: current.id, mode: current.mode });
    } catch (error) {
      setCallError(error.message || "Could not answer the call.");
    }
  };

  const declineCall = () => {
    const current = callRef.current;
    if (current?.id) sendCall({ kind: "decline", callId: current.id });
    stopCall(false);
  };

  const turnOnCamera = async () => {
    const current = callRef.current;
    if (!current) return;
    setCallError("");
    try {
      const room = liveKitRoomRef.current || await connectLiveKitRoom({ ...current, mode: "video" }, "connecting");
      await room.localParticipant.setCameraEnabled(true);
      setCall((item) => item ? { ...item, mode: "video", cameraOn: true } : item);
      window.setTimeout(attachLiveKitTracks, 0);
      await sendCall({ kind: "media", callId: current.id, mode: "video", cameraOn: true });
    } catch {
      setCallError("Camera permission is needed to switch to video.");
    }
  };

  const toggleCallMic = async () => {
    const nextMicOn = !callRef.current?.micOn;
    try {
      await liveKitRoomRef.current?.localParticipant.setMicrophoneEnabled(nextMicOn);
    } catch {
      setCallError("Microphone permission is needed for calls.");
      return;
    }
    setCall((current) => {
      if (!current) return current;
      return { ...current, micOn: nextMicOn };
    });
  };

  const setSpeakerMode = (speaker) => {
    setCall((current) => current ? { ...current, speaker } : current);
  };

  const handleCallSignal = async (payload) => {
    if (!payload || payload.profileId !== profile.id) return;
    const kind = payload.kind;
    const callId = payload.callId;
    const current = callRef.current;

    if (kind === "invite") {
      if (current && current.id !== callId) {
        sendCallSignal({ profileId: profile.id, kind: "decline", callId, reason: "busy" }).catch(() => {});
        return;
      }
      setCallError("");
      setCall({
        id: callId,
        direction: "incoming",
        status: "ringing",
        mode: payload.mode === "video" ? "video" : "audio",
        micOn: true,
        speaker: "high",
        minimized: false,
        remoteHasVideo: payload.mode === "video",
        createdAt: Date.now(),
        startedAt: 0
      });
      return;
    }

    if (!current || current.id !== callId) return;

    if (kind === "accept") {
      setCall((item) => item ? { ...item, status: "connecting" } : item);
      attachLiveKitTracks();
      return;
    }

    if (kind === "media") {
      setCall((item) => item ? { ...item, mode: payload.mode || item.mode, remoteHasVideo: Boolean(payload.cameraOn) || item.remoteHasVideo } : item);
      window.setTimeout(attachLiveKitTracks, 0);
      return;
    }

    if (kind === "decline") {
      setCallError("Call declined.");
      window.setTimeout(() => stopCall(false), 900);
      return;
    }

    if (kind === "end") {
      stopCall(false);
    }
  };

  useEffect(() => {
    callRef.current = call;
    attachLiveKitTracks();
  }, [call]);

  useEffect(() => {
    const volume = call?.speaker === "off" ? 0 : call?.speaker === "low" ? 0.45 : 1;
    [remoteAudioRef.current, remoteVideoRef.current].forEach((element) => {
      if (!element) return;
      element.volume = volume;
      element.muted = call?.speaker === "off";
    });
  }, [call?.speaker, call?.mode, call?.minimized]);

  useEffect(() => {
    const socket = connectRealtime();
    socket.on("call:signal", handleCallSignal);
    return () => {
      socket.off("call:signal", handleCallSignal);
      stopCall(false);
    };
  }, [profile.id]);

  useEffect(() => {
    if (!pendingCallSignal || pendingCallSignal.profileId !== profile.id) return;
    handleCallSignal(pendingCallSignal);
    onPendingCallHandled?.(pendingCallSignal.callId);
  }, [pendingCallSignal?.callId, pendingCallSignal?.profileId, profile.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, showTyping]);

  useEffect(() => {
    setActiveAction(null);
  }, [profile.id]);

  useEffect(() => {
    return () => {
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      typingActive.current = false;
      onTyping?.(false);
      voiceCancelled.current = true;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      voiceStream.current?.getTracks().forEach((track) => track.stop());
    };
  }, [profile.id]);

  const submit = (event) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    setTypingStatus(false);
    onSend({ type: "text", text: value });
    setText("");
    setActiveAction(null);
  };

  const handleAttach = (file) => {
    if (!file) return;
    const type = file.type.startsWith("video/") ? "video" : "image";
    const reader = new FileReader();
    reader.onload = () => {
      onSend({
        type,
        media: reader.result,
        text: file.name,
        name: file.name,
        mime: file.type
      });
      if (fileInput.current) fileInput.current.value = "";
    };
    reader.readAsDataURL(file);
  };

  const sendVoiceBlob = (blob, fallbackMime = "") => {
    if (!blob || blob.size === 0) return;
    const mime = blob.type || fallbackMime || "audio/webm";
    const reader = new FileReader();
    reader.onload = () => {
      onSend({
        type: "audio",
        media: reader.result,
        text: "Voice message",
        name: `voice-${Date.now()}.${voiceFileExtension(mime)}`,
        mime
      });
    };
    reader.onerror = () => setRecordingError("Could not send that voice message.");
    reader.readAsDataURL(blob);
  };

  const handleVoiceFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setRecordingError("Choose a valid audio recording.");
      return;
    }
    sendVoiceBlob(file, file.type);
    if (voiceInput.current) voiceInput.current.value = "";
  };

  const startVoiceRecording = async () => {
    setRecordingError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      voiceInput.current?.click();
      return;
    }
    if (!window.isSecureContext) {
      voiceInput.current?.click();
      setRecordingError("Use HTTPS or the installed app to record directly.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStream.current = stream;
      voiceCancelled.current = false;
      voiceChunks.current = [];
      const mimeType = supportedVoiceMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) voiceChunks.current.push(event.data);
      };
      recorder.onstop = () => {
        const finalMime = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(voiceChunks.current, { type: finalMime });
        voiceChunks.current = [];
        voiceStream.current?.getTracks().forEach((track) => track.stop());
        voiceStream.current = null;
        recorderRef.current = null;
        setRecording(false);
        if (!voiceCancelled.current) sendVoiceBlob(blob, finalMime);
        voiceCancelled.current = false;
      };
      recorder.start(250);
      setRecording(true);
      setTypingStatus(false);
    } catch {
      setRecording(false);
      voiceInput.current?.click();
      setRecordingError("Microphone permission is needed to record directly.");
    }
  };

  const stopVoiceRecording = () => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      return;
    }
    setRecording(false);
  };

  const toggleVoiceRecording = () => {
    if (recording) stopVoiceRecording();
    else startVoiceRecording();
  };

  const updateText = (value) => {
    setText(value);
    if (typingTimer.current) window.clearTimeout(typingTimer.current);

    if (!value.trim()) {
      setTypingStatus(false);
      return;
    }

    setTypingStatus(true);
  };

  const useReply = (reply) => {
    updateText(reply);
    inputRef.current?.focus();
  };

  return (
    <section className="screen chat-screen" aria-label={`Chat with ${profile.name}`}>
      <header className="chat-header">
        <button className="icon-btn" onClick={onClose} aria-label="Back to messages">
          <BackIcon />
        </button>
        <button className="chat-profile-btn" type="button" onClick={() => setViewingProfile(normalizeViewerProfile(profile))} aria-label={`View ${profile.name}'s profile`}>
          <img src={profile.image} alt="" />
          <span className={`presence-dot ${profile.online ? "online" : ""}`} />
          <span className="chat-id">
            <b>{profile.name}</b>
            <small>{activityText(profile)}</small>
          </span>
        </button>
        <div className="chat-header-actions">
          <button className="icon-btn round" type="button" onClick={() => startCall("audio")} aria-label="Start audio call">
            <PhoneIcon />
          </button>
          <button className="icon-btn round" type="button" onClick={() => startCall("video")} aria-label="Start video call">
            <VideoIcon />
          </button>
          <button
            className={`icon-btn round ${menuOpen ? "active" : ""}`}
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label="Conversation menu"
          >
            <MoreIcon />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="chat-menu-panel"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <button type="button" onClick={() => { setSearchOpen((value) => !value); setMenuOpen(false); }}>
              <SearchIcon />
              <span>Search conversation</span>
            </button>
            <button type="button" onClick={() => { setLibraryOpen((value) => !value); setMenuOpen(false); }}>
              <PaperclipIcon />
              <span>Photos, videos, links</span>
            </button>
            <button type="button" onClick={archiveCurrentConversation}>
              <ArchiveIcon />
              <span>Archive conversation</span>
            </button>
            <button type="button" className="danger" onClick={blockCurrentConversation}>
              <BlockIcon />
              <span>Block {profile.name}</span>
            </button>
            <button type="button" className="danger" onClick={deleteCurrentConversation}>
              <TrashIcon />
              <span>Delete conversation</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {searchOpen && (
          <motion.div
            className="conversation-search"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <input
              value={conversationQuery}
              onChange={(event) => setConversationQuery(event.target.value)}
              placeholder={`Search ${profile.name}...`}
              aria-label="Search conversation"
            />
            <span>{conversationQuery.trim() ? `${searchedMessages.length} found` : "All messages"}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {libraryOpen && (
          <motion.div
            className="conversation-library"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <div className="library-section">
              <div className="library-title">
                <span>Photos and videos</span>
                <b>{mediaMessages.length}</b>
              </div>
              {mediaMessages.length === 0 ? (
                <p>No shared photos or videos yet.</p>
              ) : (
                <div className="library-media-grid">
                  {mediaMessages.slice(-12).map((message) =>
                    message.type === "image" ? (
                      <img key={message.id} src={message.media} alt={message.name || "Shared image"} />
                    ) : (
                      <video key={message.id} src={message.media} controls />
                    )
                  )}
                </div>
              )}
            </div>
            <div className="library-section">
              <div className="library-title">
                <span>Links</span>
                <b>{linkItems.length}</b>
              </div>
              {linkItems.length === 0 ? (
                <p>No links shared yet.</p>
              ) : (
                <div className="library-links">
                  {linkItems.slice(-10).map((item) => (
                    <a key={item.id} href={item.url} target="_blank" rel="noreferrer">
                      <span>{item.url}</span>
                      <small>{item.from === "me" ? "You" : profile.name} · {relativeTime(item.ts)}</small>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="chat-feed" ref={scrollRef}>
        <button className="chat-meta" type="button" onClick={() => setViewingProfile(normalizeViewerProfile(profile))}>
          <img src={profile.image} alt="" />
          <h3>You matched with {profile.name}</h3>
          <p>Start with something specific from their profile.</p>
        </button>
        {conversationQuery.trim() && searchedMessages.length === 0 && (
          <div className="conversation-no-results">No messages found.</div>
        )}
        {searchedMessages.map((message) => {
          const own = message.from === "me";
          const pinned = pinnedMessageIds.includes(message.id);
          const avatar = (own ? user?.image : profile.image) || LOGO_SRC;
          const avatarLabel = own ? "Your profile" : `${profile.name}'s profile`;
          const avatarProfile = own ? normalizeViewerProfile(user) : normalizeViewerProfile(profile);
          const storyReply = message.storyReply || legacyStoryReplyForMessage(message, own, profile, userStories);
          const storyTitle = storyReplyTitle(message, storyReply, own, profile);
          return (
            <motion.div
              key={message.id}
              className={`message-row ${own ? "me" : "them"} ${activeAction?.id === message.id ? "selected" : ""}`}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", damping: 22, stiffness: 280 }}
            >
              <button
                type="button"
                className="message-avatar-btn"
                onClick={() => setViewingProfile(avatarProfile)}
                aria-label={`View ${avatarLabel}`}
              >
                <img className="message-avatar" src={avatar} alt="" />
              </button>
              <button
                type="button"
                className={`bubble ${own ? "me" : "them"} ${message.unsent ? "unsent" : ""} ${pinned ? "pinned" : ""}`}
                onClick={() => {
                  if (message.unsent) {
                    setActiveAction(null);
                    return;
                  }
                  setActiveAction((current) =>
                    current?.id === message.id ? null : { id: message.id, type: "bar" }
                  );
                }}
              >
                {message.unsent ? (
                  <em>Message unsent</em>
                ) : (
                  <>
                    {message.type === "image" && message.media && <img className="message-media" src={message.media} alt={message.name || "Sent image"} />}
                    {message.type === "video" && message.media && <video className="message-media" src={message.media} controls />}
                    {message.type === "audio" && message.media && <audio className="message-audio" src={message.media} controls />}
                    {storyReply ? (
                      <>
                        {storyTitle && <span className="message-story-title">{storyTitle}</span>}
                        <StoryReplyPreview story={storyReply} />
                        {own && <small className="message-story-status">Sent</small>}
                      </>
                    ) : (
                      message.text && <span>{message.text}</span>
                    )}
                    {pinned && <small className="pinned-note">Pinned</small>}
                  </>
                )}
              </button>
              {!message.unsent && (
                <div className={`inline-message-actions ${own ? "me" : "them"}`}>
                  <button type="button" onClick={() => toggleAction(message.id, "react")} aria-label="React to message">
                    <SmileIcon />
                  </button>
                  <button type="button" onClick={() => toggleAction(message.id, "forward")} aria-label="Forward message">
                    <ForwardIcon />
                  </button>
                  <button type="button" onClick={() => toggleAction(message.id, "menu")} aria-label="More message options">
                    <MoreIcon />
                  </button>
                </div>
              )}
              {message.reactions && Object.keys(message.reactions).length > 0 && (
                <div className={`reaction-stack ${own ? "me" : "them"}`}>
                  {Object.entries(message.reactions).map(([key, value]) => (
                    <span key={key}>{value}</span>
                  ))}
                </div>
              )}
              {own && message.id === seenMessageId && (
                <div className="seen-indicator">
                  <button type="button" onClick={() => setViewingProfile(normalizeViewerProfile(profile))} aria-label={`View ${profile.name}'s profile`}>
                    <img src={profile.image} alt="" />
                  </button>
                  <span>{seenText(message.seenAt)}</span>
                </div>
              )}
              {isActionOpen(message.id, "react") && (
                <div className={`message-panel reaction-picker ${own ? "me" : "them"}`}>
                  {REACTION_OPTIONS.map((reaction) => (
                    <button
                      key={reaction}
                      type="button"
                      onClick={() => {
                        onReact(message.id, reaction);
                        setActiveAction(null);
                      }}
                    >
                      {reaction}
                    </button>
                  ))}
                </div>
              )}
              {isActionOpen(message.id, "forward") && (
                <div className={`message-panel forward-panel ${own ? "me" : "them"}`}>
                  {forwardTargets.length === 0 ? (
                    <span>No other matches</span>
                  ) : (
                    forwardTargets.map((target) => (
                      <button
                        key={target.id}
                        type="button"
                        onClick={() => {
                          onForward?.(message, target);
                          setActiveAction(null);
                        }}
                      >
                        <img src={target.image} alt="" />
                        <span>{target.name}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
              {isActionOpen(message.id, "menu") && (
                <div className={`message-panel message-menu ${own ? "me" : "them"}`}>
                  {own ? (
                    <button type="button" onClick={() => { onUnsend(message.id); setActiveAction(null); }}>
                      Unsend
                    </button>
                  ) : (
                    <button type="button" onClick={() => { onRemove(message.id); setActiveAction(null); }}>
                      Remove for you
                    </button>
                  )}
                  <button type="button" onClick={() => togglePinnedMessage(message.id)}>
                    {own ? (pinned ? "Unpin message" : "Pinned message") : pinned ? "Unpin" : "Pin"}
                  </button>
                  <button type="button" onClick={() => reportMessage(message)}>
                    Report
                  </button>
                </div>
              )}
            </motion.div>
          );
        })}
        {showTyping && (
          <motion.div className="typing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <span />
            <span />
            <span />
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {call && !call.minimized && (
          <CallPanel
            call={call}
            profile={profile}
            localVideoRef={localVideoRef}
            remoteVideoRef={remoteVideoRef}
            remoteAudioRef={remoteAudioRef}
            onAccept={acceptCall}
            onDecline={declineCall}
            onEnd={() => stopCall(true)}
            onMinimize={() => setCall((current) => current ? { ...current, minimized: true } : current)}
            onToggleMic={toggleCallMic}
            onTurnOnCamera={turnOnCamera}
            onSpeaker={setSpeakerMode}
            error={callError}
          />
        )}
      </AnimatePresence>

      {call?.minimized && (
        <MinimizedCall
          call={call}
          profile={profile}
          remoteAudioRef={remoteAudioRef}
          onRestore={() => setCall((current) => current ? { ...current, minimized: false } : current)}
          onEnd={() => stopCall(true)}
        />
      )}

      <div className="quick-replies" aria-label="Quick replies">
        {QUICK_REPLIES.map((reply) => (
          <button key={reply} type="button" onClick={() => useReply(reply)}>
            {reply}
          </button>
        ))}
      </div>

      <form className="chat-input" onSubmit={submit}>
        <button type="button" className="icon-btn round" onClick={() => fileInput.current?.click()} aria-label="Attach file">
          <PaperclipIcon />
        </button>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(event) => updateText(event.target.value)}
          placeholder={`Message ${profile.name}...`}
          aria-label={`Message ${profile.name}`}
        />
        <button
          type="button"
          className={`icon-btn round voice-record-btn ${recording ? "recording" : ""}`}
          onClick={toggleVoiceRecording}
          aria-label={recording ? "Stop and send voice message" : "Record voice message"}
          title={recording ? "Stop and send" : "Record voice"}
        >
          <MicIcon />
        </button>
        <button type="submit" className="send-btn" aria-label="Send message" disabled={!text.trim()}>
          <SendIcon />
        </button>
        <input ref={fileInput} type="file" accept="image/*,video/*" hidden onChange={(event) => handleAttach(event.target.files?.[0])} />
        <input ref={voiceInput} type="file" accept="audio/*" capture="microphone" hidden onChange={(event) => handleVoiceFile(event.target.files?.[0])} />
      </form>
      {recordingError && <div className="voice-error" role="alert">{recordingError}</div>}
      {messageNotice && <div className="chat-notice" role="status">{messageNotice}</div>}
      <AnimatePresence>
        {viewingProfile && (
          <ProfileViewer
            profile={viewingProfile}
            posts={posts}
            onClose={() => setViewingProfile(null)}
            onMessage={() => {
              setViewingProfile(null);
              inputRef.current?.focus();
            }}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

function ProfileScreen({ matchCount, likedCount, user, posts = [], onEditProfile, onUpdateProfile }) {
  const backgroundInput = useRef(null);
  const mediaInput = useRef(null);
  const media = user.media || [];
  const personalInterests = Array.isArray(user.interests) ? user.interests.filter(Boolean) : [];
  const userFirstName = (user.fullName || "Your").split(" ")[0];
  const profileScore = Math.min(
    100,
    20 +
      (user.fullName ? 10 : 0) +
      (user.image ? 10 : 0) +
      (user.location ? 8 : 0) +
      (user.bio ? 16 : 0) +
      (user.gender ? 8 : 0) +
      (user.interestedIn ? 8 : 0) +
      (personalInterests.length ? 8 : 0) +
      (user.zodiacSign ? 4 : 0) +
      (user.work || user.school ? 8 : 0) +
      Math.min(media.length, 4) * 5
  );
  const userPosts = posts.filter((post) => post.author?.name === userFirstName || post.author?.id === user.id).slice(0, 3);

  const readImage = (file, onReady) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onReady(reader.result);
    reader.readAsDataURL(file);
  };

  const addMedia = (file) => {
    readImage(file, (src) => {
      const nextMedia = Array.from(new Set([...media, src])).slice(0, 6);
      onUpdateProfile({ media: nextMedia, image: user.image || src });
    });
  };

  const setBackgroundImage = (file) => {
    if (!file) return;
    compressImageFile(file, { maxEdge: 1600, maxChars: 1_420_000 })
      .then((src) => {
        if (src) onUpdateProfile({ background: src });
        if (backgroundInput.current) backgroundInput.current.value = "";
      })
      .catch(() => {
        readImage(file, (src) => onUpdateProfile({ background: src }));
      });
  };

  const removeMedia = (index) => {
    const nextMedia = media.filter((_, itemIndex) => itemIndex !== index);
    const nextImage = media[index] === user.image ? nextMedia[0] || LOGO_SRC : user.image;
    onUpdateProfile({ media: nextMedia, image: nextImage });
  };

  const makeProfilePhoto = (src) => {
    onUpdateProfile({ image: src, media: Array.from(new Set([src, ...media])).slice(0, 6) });
  };

  return (
    <section className="screen profile-screen" aria-label="Profile">
      <div className="profile-page-shell">
        <section className="profile-hero-panel" style={profileBackgroundStyle(user.background)}>
          <div className="profile-hero-overlay">
            <div className="profile-hero-main">
              <img src={user.image || LOGO_SRC} alt="Profile" />
              <div>
                <span className="profile-kicker">Public profile</span>
                <h1>
                  {user.fullName || "Flame user"} <span>, {user.age || 18}</span>
                </h1>
                <p>{user.bio || "Add a short bio so people know what makes you worth a hello."}</p>
                <div className="profile-hero-chips">
                  {[user.location, user.zodiacSign, user.work, ...personalInterests].filter(Boolean).slice(0, 6).map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="profile-hero-actions">
              <button type="button" onClick={onEditProfile}>
                <UserIcon />
                <span>Edit details</span>
              </button>
              <button type="button" onClick={() => backgroundInput.current?.click()}>
                <ImageIcon />
                <span>Set background</span>
              </button>
              {user.background && (
                <button type="button" onClick={() => onUpdateProfile({ background: "" })}>
                  <XIcon />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>
          <input ref={backgroundInput} type="file" accept="image/*" hidden onChange={(event) => setBackgroundImage(event.target.files?.[0])} />
        </section>

        <div className="profile-content-grid">
          <section className="profile-panel profile-overview-panel">
            <div className="profile-panel-head">
              <span>Overview</span>
              <b>{profileScore}% complete</b>
            </div>
            <div className="profile-stat-grid">
              <span>
                <b>{likedCount}</b>
                <small>Likes sent</small>
              </span>
              <span>
                <b>{matchCount}</b>
                <small>Matches</small>
              </span>
              <span>
                <b>{media.length}</b>
                <small>Photos</small>
              </span>
            </div>
            <div className="profile-progress">
              <span style={{ width: `${profileScore}%` }} />
            </div>
          </section>

          <section className="profile-panel profile-background-panel">
            <div className="profile-panel-head">
              <span>Background</span>
              <b>Personalize</b>
            </div>
            <div className="background-preset-grid">
              {PROFILE_BACKGROUND_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={user.background === preset.value ? "active" : ""}
                  onClick={() => onUpdateProfile({ background: preset.value })}
                >
                  <i style={{ backgroundImage: preset.value }} />
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="profile-panel profile-details-panel">
            <div className="profile-panel-head">
              <span>Details</span>
              <b>{user.location || "Nearby"}</b>
            </div>
            <div className="profile-detail-list">
              <span><b>Looking for</b><small>{user.interestedIn || "Not shared"}</small></span>
              <span><b>Work</b><small>{user.work || "Not shared"}</small></span>
              <span><b>School</b><small>{user.school || "Not shared"}</small></span>
              <span><b>Gender</b><small>{user.gender || "Not shared"}</small></span>
            </div>
          </section>

          <section className="profile-panel profile-photos-panel">
            <div className="profile-panel-head">
              <span>Photos</span>
              <button type="button" onClick={() => mediaInput.current?.click()} disabled={media.length >= 6}>Add photo</button>
            </div>
            <div className="profile-photo-grid">
              {media.map((src, index) => (
                <div key={`${src}-${index}`} className="profile-photo-tile">
                  <img src={src} alt={`Profile media ${index + 1}`} />
                  <div>
                    <button type="button" onClick={() => makeProfilePhoto(src)}>{src === user.image ? "Main" : "Use"}</button>
                    <button type="button" onClick={() => removeMedia(index)}>Remove</button>
                  </div>
                </div>
              ))}
              <button type="button" className="profile-photo-add" onClick={() => mediaInput.current?.click()} disabled={media.length >= 6}>
                <PlusIcon />
                <span>{media.length >= 6 ? "Full" : "Add photo"}</span>
              </button>
            </div>
            <input ref={mediaInput} type="file" accept="image/*" hidden onChange={(event) => addMedia(event.target.files?.[0])} />
          </section>

          <section className="profile-panel profile-posts-panel">
            <div className="profile-panel-head">
              <span>Recent posts</span>
              <b>{userPosts.length}</b>
            </div>
            {userPosts.length > 0 ? (
              <div className="profile-post-list">
                {userPosts.map((post) => (
                  <article key={post.id}>
                    <b>{post.text || "Shared a post"}</b>
                    <small>{relativeTime(post.createdAt)} · {post.commentCount || 0} comments</small>
                  </article>
                ))}
              </div>
            ) : (
              <p className="profile-empty-note">Your latest posts will show here.</p>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}

function SettingsScreen({
  light,
  setLight,
  user,
  privacy,
  onEditProfile,
  onPrivacy,
  onAbout,
  onHelp,
  onLogout
}) {
  const [notif, setNotif] = useState(true);

  return (
    <section className="screen settings-screen" aria-label="Settings">
      <div className="settings-page-shell">
        <header className="settings-dashboard-head">
          <div>
            <span>Settings</span>
            <h1>Account controls</h1>
            <p>Keep profile editing, privacy, app preferences, and support separate from your public profile.</p>
          </div>
        </header>

        <div className="settings-dashboard-grid">
          <section className="settings-panel settings-user-panel">
            <img src={user.image || LOGO_SRC} alt="" />
            <span>
              <b>{user.fullName || "Flame user"}</b>
              <small>{user.location || "Nearby"}</small>
            </span>
            <button type="button" onClick={onEditProfile}>Edit profile</button>
          </section>

          <section className="settings-panel">
            <div className="settings-panel-title">
              <span>Account</span>
            </div>
            <button className="settings-row" type="button" onClick={onEditProfile}>
              <span>Edit profile details</span>
              <b>Open</b>
            </button>
            <button className="settings-row" type="button" onClick={onPrivacy}>
              <span>Privacy settings</span>
              <b>{privacy.incognito ? "Incognito" : "Review"}</b>
            </button>
          </section>

          <section className="settings-panel">
            <div className="settings-panel-title">
              <span>Preferences</span>
            </div>
            <button className="settings-row" type="button" onClick={() => setNotif(!notif)} aria-pressed={notif}>
              <span>Notifications</span>
              <span className={`toggle ${notif ? "on" : ""}`} />
            </button>
            <button className="settings-row" type="button" onClick={() => setLight(!light)} aria-pressed={light}>
              <span>{light ? "Light mode" : "Dark mode"}</span>
              <span className={`toggle ${light ? "on" : ""}`} />
            </button>
            <button className="settings-row" type="button" onClick={onPrivacy} aria-pressed={privacy.incognito}>
              <span>Incognito</span>
              <span className={`toggle ${privacy.incognito ? "on" : ""}`} />
            </button>
          </section>

          <section className="settings-panel">
            <div className="settings-panel-title">
              <span>Support</span>
            </div>
            <button className="settings-row" type="button" onClick={onAbout}>
              <span>About app</span>
              <b>v 2.5.0</b>
            </button>
            <button className="settings-row" type="button" onClick={onHelp}>
              <span>Help center</span>
              <b>Open</b>
            </button>
            <button className="settings-row danger" type="button" onClick={onLogout}>
              <span>Log out</span>
              <b>Exit</b>
            </button>
          </section>
        </div>
      </div>
    </section>
  );
}

function Settings({
  light,
  setLight,
  matchCount,
  likedCount,
  user,
  privacy,
  onEditProfile,
  onPrivacy,
  onAbout,
  onHelp,
  onLogout,
  onUpdateProfile
}) {
  const [notif, setNotif] = useState(true);
  const fileInput = useRef(null);
  const media = user.media || [];
  const personalInterests = Array.isArray(user.interests) ? user.interests.filter(Boolean) : [];
  const profileScore = Math.min(
    100,
    20 +
      (user.fullName ? 10 : 0) +
      (user.image ? 10 : 0) +
      (user.location ? 8 : 0) +
      (user.bio ? 16 : 0) +
      (user.gender ? 8 : 0) +
      (user.interestedIn ? 8 : 0) +
      (personalInterests.length ? 8 : 0) +
      (user.zodiacSign ? 4 : 0) +
      (user.work || user.school ? 8 : 0) +
      Math.min(media.length, 4) * 5
  );

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result;
      const nextMedia = [...media, src].slice(0, 6);
      onUpdateProfile({ media: nextMedia, image: user.image || src });
    };
    reader.readAsDataURL(file);
  };

  const removeMedia = (index) => {
    const nextMedia = media.filter((_, itemIndex) => itemIndex !== index);
    const nextImage = media[index] === user.image ? nextMedia[0] || user.image : user.image;
    onUpdateProfile({ media: nextMedia, image: nextImage });
  };

  const makeProfilePhoto = (src) => {
    onUpdateProfile({ image: src, media: Array.from(new Set([src, ...media])).slice(0, 6) });
  };

  return (
    <section className="screen" aria-label="Profile and settings">
      <div className="profile-dashboard-shell">
        <header className="profile-dashboard-head">
          <div>
            <span>Account center</span>
            <h1>Profile and settings</h1>
            <p>Manage your photos, privacy, preferences, and account details in one place.</p>
          </div>
          <button type="button" className="profile-head-action" onClick={onEditProfile}>
            <UserIcon />
            <span>Edit profile</span>
          </button>
        </header>

      <div className="profile-layout">
        <aside className="profile-summary-card" aria-label="Profile summary">
          <div className="avatar-wrap">
            <img src={user.image} alt="Profile" />
          </div>
          <div className="profile-head">
            <h2>
              {user.fullName} <span>, {user.age}</span>
            </h2>
            <p>{user.location}</p>
            <p className="profile-bio">{user.bio}</p>
            {(user.zodiacSign || personalInterests.length > 0) && (
              <div className="profile-info-chips">
                {user.zodiacSign && <span>{user.zodiacSign}</span>}
                {personalInterests.slice(0, 5).map((interest) => (
                  <span key={interest}>{interest}</span>
                ))}
              </div>
            )}
            <div className="stats">
              <div>
                <b>{likedCount}</b>
                <span>Likes sent</span>
              </div>
              <div>
                <b>{matchCount}</b>
                <span>Matches</span>
              </div>
              <div>
                <b>{profileScore}%</b>
                <span>Profile</span>
              </div>
            </div>
          </div>

          <div className="profile-strength">
            <div>
              <span>Profile strength</span>
              <b>{profileScore}%</b>
            </div>
            <i style={{ width: `${profileScore}%` }} />
          </div>
        </aside>

        <div className="profile-main-card">

      <h4 className="grp">Account</h4>
      <ul className="settings">
        <li>
          <button className="settings-row" type="button" onClick={onEditProfile}>
            <span>Edit Profile</span>
            <b>Open</b>
          </button>
        </li>
        <li>
          <button className="settings-row" type="button" onClick={onPrivacy}>
            <span>Privacy Settings</span>
            <b>{privacy.incognito ? "Incognito" : "Review"}</b>
          </button>
        </li>
      </ul>

      <h4 className="grp">Media</h4>
      <div className="profile-media">
        {media.map((src, index) => (
          <div key={`${src}-${index}`} className="media-thumb">
            <img src={src} alt={`Uploaded media ${index + 1}`} />
            <div className="media-actions">
              <button type="button" onClick={() => makeProfilePhoto(src)}>
                {src === user.image ? "Main" : "Use"}
              </button>
              <button type="button" onClick={() => removeMedia(index)} aria-label={`Remove media ${index + 1}`}>
                Remove
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="media-add-thumb"
          onClick={() => fileInput.current?.click()}
          disabled={media.length >= 6}
          aria-label="Add media"
        >
          <span>+</span>
          <p>{media.length >= 6 ? "Full" : "Add media"}</p>
        </button>
      </div>
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(event) => handleFile(event.target.files?.[0])} />

      <h4 className="grp">Preferences</h4>
      <ul className="settings">
        <li>
          <button className="settings-row" type="button" onClick={() => setNotif(!notif)} aria-pressed={notif}>
            <span>Notifications</span>
            <span className={`toggle ${notif ? "on" : ""}`} />
          </button>
        </li>
        <li>
          <button className="settings-row" type="button" onClick={() => setLight(!light)} aria-pressed={light}>
            <span>{light ? "Light Mode" : "Dark Mode"}</span>
            <span className={`toggle ${light ? "on" : ""}`} />
          </button>
        </li>
        <li>
          <button className="settings-row" type="button" onClick={onPrivacy} aria-pressed={privacy.incognito}>
            <span>Incognito</span>
            <span className={`toggle ${privacy.incognito ? "on" : ""}`} />
          </button>
        </li>
        <li>
          <button className="settings-row" type="button" onClick={onHelp}>
            <span>Language</span>
            <b>English</b>
          </button>
        </li>
      </ul>

      <h4 className="grp">Support</h4>
      <ul className="settings">
        <li>
          <button className="settings-row" type="button" onClick={onAbout}>
            <span>About App</span>
            <b>v 2.5.0</b>
          </button>
        </li>
        <li>
          <button className="settings-row" type="button" onClick={onHelp}>
            <span>Help Center</span>
            <b>Open</b>
          </button>
        </li>
      </ul>

      <button className="logout" onClick={onLogout}>Logout</button>
      <p className="footer-mini">Flame Dating - Made with care</p>
        </div>
      </div>
      </div>
    </section>
  );
}

function PrivacySettings({ privacy, onSave, onCancel }) {
  const [form, setForm] = useState(privacy);

  useEffect(() => {
    setForm(privacy);
  }, [privacy]);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <section className="screen sub-screen" aria-label="Privacy settings">
      <header className="topbar">
        <button className="icon-btn" onClick={onCancel} aria-label="Back to profile">
          <BackIcon />
        </button>
        <h1 className="page-title">Privacy</h1>
        <span className="topbar-spacer" />
      </header>

      <div className="settings-page">
        <div className="info-panel">
          <h2>Control who sees you</h2>
          <p>Your choices apply across Discover, Matches, and chat presence.</p>
        </div>

        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(form);
          }}
        >
          <label className="switch-row">
            <span>
              <b>Show me in Discover</b>
              <small>People nearby can find your profile.</small>
            </span>
            <input
              type="checkbox"
              checked={form.discoverable}
              onChange={(event) => update("discoverable", event.target.checked)}
            />
          </label>
          <label className="switch-row">
            <span>
              <b>Incognito mode</b>
              <small>Only people you like first can see you.</small>
            </span>
            <input
              type="checkbox"
              checked={form.incognito}
              onChange={(event) => update("incognito", event.target.checked)}
            />
          </label>
          <label className="switch-row">
            <span>
              <b>Show distance</b>
              <small>Display your approximate distance on profile cards.</small>
            </span>
            <input
              type="checkbox"
              checked={form.showDistance}
              onChange={(event) => update("showDistance", event.target.checked)}
            />
          </label>
          <label className="switch-row">
            <span>
              <b>Show online status</b>
              <small>Let matches know when you are active.</small>
            </span>
            <input
              type="checkbox"
              checked={form.showOnline}
              onChange={(event) => update("showOnline", event.target.checked)}
            />
          </label>
          <label className="switch-row">
            <span>
              <b>Read receipts</b>
              <small>Show when messages have been seen.</small>
            </span>
            <input
              type="checkbox"
              checked={form.readReceipts}
              onChange={(event) => update("readReceipts", event.target.checked)}
            />
          </label>
          <label className="field-card">
            Location visibility
            <select value={form.locationScope} onChange={(event) => update("locationScope", event.target.value)}>
              <option>Nearby</option>
              <option>City only</option>
              <option>Hidden</option>
            </select>
          </label>

          <button className="cta" type="submit">Save Privacy</button>
        </form>
      </div>
    </section>
  );
}

function AboutApp({ onBack }) {
  const [open, setOpen] = useState("mission");
  const panels = {
    mission:
      "Flame is a dating experience focused on fast discovery, real conversations, and profile controls that make matching feel intentional.",
    safety:
      "The app includes privacy controls, local account sessions, and clear reporting routes through Help Center.",
    version:
      "Version 2.5.0 includes match effects, boost mode, message search, quick replies, profile editing, and account authentication."
  };

  return (
    <section className="screen sub-screen" aria-label="About Flame">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="Back to profile">
          <BackIcon />
        </button>
        <h1 className="page-title">About App</h1>
        <span className="topbar-spacer" />
      </header>

      <div className="about-hero">
        <img src={LOGO_SRC} alt="" />
        <h2>Flame Dating</h2>
        <p>Designed for swipe discovery, confident matching, and clean chat flows.</p>
      </div>

      <div className="about-stats">
        <div><b>2.5.0</b><span>Version</span></div>
        <div><b>Live</b><span>Profiles</span></div>
        <div><b>MongoDB</b><span>Storage</span></div>
      </div>

      <div className="about-tabs">
        {Object.keys(panels).map((key) => (
          <button key={key} className={open === key ? "active" : ""} onClick={() => setOpen(key)}>
            {key.charAt(0).toUpperCase() + key.slice(1)}
          </button>
        ))}
      </div>
      <div className="info-panel">
        <p>{panels[open]}</p>
      </div>
    </section>
  );
}

function HelpCenter({ onBack, onTicket }) {
  const faqs = [
    { category: "Account", q: "How do I edit my profile?", a: "Open Profile, choose Edit Profile, update your details, and save." },
    { category: "Privacy", q: "Can I hide my profile?", a: "Yes. Open Privacy Settings and turn off Discover or enable Incognito." },
    { category: "Messages", q: "Why do quick replies appear?", a: "They help start conversations faster and can be edited before sending." }
  ];
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [ticket, setTicket] = useState({ subject: "", message: "" });
  const [created, setCreated] = useState("");
  const categories = ["All", ...Array.from(new Set(faqs.map((item) => item.category)))];
  const filtered = faqs.filter((item) => {
    const matchesCategory = category === "All" || item.category === category;
    const q = query.trim().toLowerCase();
    const matchesQuery = !q || item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q);
    return matchesCategory && matchesQuery;
  });

  const submit = async (event) => {
    event.preventDefault();
    if (!ticket.subject.trim() || !ticket.message.trim()) return;
    const result = await onTicket(ticket);
    if (!result.ok) return;
    setCreated(result.ticket.id);
    setTicket({ subject: "", message: "" });
  };

  return (
    <section className="screen sub-screen" aria-label="Help Center">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="Back to profile">
          <BackIcon />
        </button>
        <h1 className="page-title">Help Center</h1>
        <span className="topbar-spacer" />
      </header>

      <div className="settings-page">
        <div className="search-row help-search">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search help topics" />
        </div>

        <div className="help-cats">
          {categories.map((item) => (
            <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>
              {item}
            </button>
          ))}
        </div>

        <div className="faq-list">
          {filtered.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>

        <form className="settings-form" onSubmit={submit}>
          <h2>Contact Support</h2>
          {created && <div className="success-note">Ticket {created} is ready for review.</div>}
          <label className="field-card">
            Subject
            <input value={ticket.subject} onChange={(event) => setTicket((prev) => ({ ...prev, subject: event.target.value }))} />
          </label>
          <label className="field-card">
            Message
            <textarea rows="4" value={ticket.message} onChange={(event) => setTicket((prev) => ({ ...prev, message: event.target.value }))} />
          </label>
          <button className="cta" type="submit" disabled={!ticket.subject.trim() || !ticket.message.trim()}>
            Send Ticket
          </button>
        </form>
      </div>
    </section>
  );
}

function EditProfile({ user, profiles = [], onSave, onCancel }) {
  const [form, setForm] = useState({
    fullName: user.fullName || "",
    age: user.age || 18,
    location: user.location || "",
    work: user.work || "",
    school: user.school || "",
    gender: user.gender || "",
    interestedIn: user.interestedIn || "",
    interests: Array.isArray(user.interests) ? user.interests : [],
    zodiacSign: user.zodiacSign || "",
    bio: user.bio || "",
    image: user.image,
    media: user.media || []
  });
  const [preview, setPreview] = useState(user.image);
  const [interestText, setInterestText] = useState("");
  const [locationFocused, setLocationFocused] = useState(false);
  const [remoteLocations, setRemoteLocations] = useState([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const fileInput = useRef(null);
  const mediaInput = useRef(null);
  const locationBlurTimer = useRef(null);
  const locationSearchRef = useRef(0);

  useEffect(() => {
    setForm({
      fullName: user.fullName || "",
      age: user.age || 18,
      location: user.location || "",
      work: user.work || "",
      school: user.school || "",
      gender: user.gender || "",
      interestedIn: user.interestedIn || "",
      interests: Array.isArray(user.interests) ? user.interests : [],
      zodiacSign: user.zodiacSign || "",
      bio: user.bio || "",
      image: user.image,
      media: user.media || []
    });
    setPreview(user.image);
    setInterestText("");
  }, [user]);

  useEffect(
    () => () => {
      if (locationBlurTimer.current) window.clearTimeout(locationBlurTimer.current);
    },
    []
  );

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const toggleFormInterest = (interest) => {
    setForm((prev) => {
      const current = Array.isArray(prev.interests) ? prev.interests : [];
      return {
        ...prev,
        interests: current.includes(interest)
          ? current.filter((item) => item !== interest)
          : [...current, interest].slice(0, 12)
      };
    });
  };
  const addFormInterest = (value = interestText) => {
    const text = String(value || "").trim();
    if (!text) return;
    const canonical = ONBOARDING_INTERESTS.find((item) => item.toLowerCase() === text.toLowerCase()) || text;
    setForm((prev) => {
      const current = Array.isArray(prev.interests) ? prev.interests : [];
      if (current.some((item) => item.toLowerCase() === canonical.toLowerCase()) || current.length >= 12) {
        return prev;
      }
      return { ...prev, interests: [...current, canonical].slice(0, 12) };
    });
    setInterestText("");
  };

  useEffect(() => {
    const query = form.location.trim();
    if (!locationFocused || query.length < 2) {
      setRemoteLocations([]);
      setLocationLoading(false);
      return undefined;
    }

    const requestId = locationSearchRef.current + 1;
    locationSearchRef.current = requestId;
    setLocationLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        const result = await api(`/locations?q=${encodeURIComponent(query)}`, { method: "GET" });
        if (locationSearchRef.current !== requestId) return;
        setRemoteLocations(
          Array.isArray(result.locations)
            ? result.locations.map(cleanLocationSuggestion).filter(Boolean)
            : []
        );
      } catch {
        if (locationSearchRef.current === requestId) setRemoteLocations([]);
      } finally {
        if (locationSearchRef.current === requestId) setLocationLoading(false);
      }
    }, 280);

    return () => window.clearTimeout(timer);
  }, [form.location, locationFocused]);

  const locationOptions = useMemo(() => {
    const values = [
      user.location,
      ...remoteLocations,
      ...profiles.flatMap((profile) => [
        profile.distance,
        ...(profile.details || [])
          .filter((detail) => detail.label === "Location")
          .map((detail) => detail.value)
      ]),
      ...COMMON_LOCATIONS
    ]
      .map(cleanLocationSuggestion)
      .filter(Boolean);

    return Array.from(new Map(values.map((location) => [location.toLowerCase(), location])).values());
  }, [profiles, remoteLocations, user.location]);

  const locationSuggestions = useMemo(() => {
    const query = form.location.trim().toLowerCase();
    const suggestions = query
      ? locationOptions.filter((location) => location.toLowerCase().includes(query))
      : locationOptions;

    return suggestions
      .sort((a, b) => {
        if (!query) return a.localeCompare(b);
        const aStarts = a.toLowerCase().startsWith(query);
        const bStarts = b.toLowerCase().startsWith(query);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
        return a.localeCompare(b);
      })
      .slice(0, 8);
  }, [form.location, locationOptions]);

  const chooseLocation = (location) => {
    if (locationBlurTimer.current) window.clearTimeout(locationBlurTimer.current);
    locationSearchRef.current += 1;
    update("location", location);
    setLocationFocused(false);
  };

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(reader.result);
      setForm((prev) => ({
        ...prev,
        image: reader.result,
        media: Array.from(new Set([reader.result, ...(prev.media || [])])).slice(0, 6)
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleMediaFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({
        ...prev,
        media: [...(prev.media || []), reader.result].slice(0, 6),
        image: prev.image || reader.result
      }));
      if (mediaInput.current) mediaInput.current.value = "";
    };
    reader.readAsDataURL(file);
  };

  const removeMedia = (index) => {
    const media = (form.media || []).filter((_, itemIndex) => itemIndex !== index);
    const image = form.media?.[index] === form.image ? media[0] || form.image : form.image;
    setPreview(image);
    setForm((prev) => ({ ...prev, media, image }));
  };

  const setMainPhoto = (src) => {
    setPreview(src);
    setForm((prev) => ({
      ...prev,
      image: src,
      media: Array.from(new Set([src, ...(prev.media || [])])).slice(0, 6)
    }));
  };

  const submit = (event) => {
    event.preventDefault();
    onSave({
      ...form,
      fullName: form.fullName.trim(),
      location: form.location.trim(),
      work: form.work.trim(),
      school: form.school.trim(),
      bio: form.bio.trim(),
      gender: form.gender,
      interestedIn: form.interestedIn,
      interests: Array.from(new Set((form.interests || []).filter(Boolean))).slice(0, 12),
      zodiacSign: form.zodiacSign,
      age: Math.max(18, Math.min(99, Number(form.age) || 18)),
      media: Array.from(new Set(form.media || [])).slice(0, 6)
    });
  };

  return (
    <section className="screen" aria-label="Edit profile">
      <header className="topbar">
        <button className="icon-btn" onClick={onCancel} aria-label="Back to settings">
          <BackIcon />
        </button>
        <h1 className="page-title">Edit Profile</h1>
        <span className="topbar-spacer" />
      </header>

      <div className="edit-profile-wrap">
        <div className="profile-photo-edit">
          <img src={preview} alt="Profile preview" />
          <button type="button" className="upload-btn" onClick={() => fileInput.current?.click()}>
            Change photo
          </button>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={(event) => handleFile(event.target.files?.[0])} />
        </div>

        <form className="edit-profile-form" onSubmit={submit}>
          <div className="form-grid">
            <label>
              Full Name
              <input type="text" value={form.fullName} onChange={(event) => update("fullName", event.target.value)} required />
            </label>
            <label>
              Age
              <input type="number" min="18" max="99" value={form.age} onChange={(event) => update("age", event.target.value)} required />
            </label>
          </div>
          <label className="location-field">
            Location
            <input
              type="text"
              value={form.location}
              onChange={(event) => {
                update("location", event.target.value);
                setLocationFocused(true);
              }}
              onFocus={() => setLocationFocused(true)}
              onBlur={() => {
                locationBlurTimer.current = window.setTimeout(() => setLocationFocused(false), 120);
              }}
              autoComplete="off"
              required
            />
            {locationFocused && (locationSuggestions.length > 0 || locationLoading) && (
              <div className="location-suggestions" role="listbox" aria-label="Location suggestions">
                {locationLoading && <div className="location-suggestion-note">Searching locations...</div>}
                {locationSuggestions.map((location) => (
                  <button
                    key={location}
                    type="button"
                    role="option"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      chooseLocation(location);
                    }}
                  >
                    {location}
                  </button>
                ))}
              </div>
            )}
          </label>
          <div className="form-grid">
            <label>
              Gender
              <select value={form.gender} onChange={(event) => update("gender", event.target.value)}>
                <option value="">Select</option>
                <option>Woman</option>
                <option>Man</option>
                <option>Non-binary</option>
                <option>Prefer not to say</option>
              </select>
            </label>
            <label>
              Interested in
              <select value={form.interestedIn} onChange={(event) => update("interestedIn", event.target.value)}>
                <option value="">Select</option>
                <option>Women</option>
                <option>Men</option>
                <option>Everyone</option>
              </select>
            </label>
          </div>
          <label>
            Zodiac sign
            <select value={form.zodiacSign} onChange={(event) => update("zodiacSign", event.target.value)}>
              <option value="">Select</option>
              {ZODIAC_SIGNS.map((sign) => (
                <option key={sign} value={sign}>
                  {sign}
                </option>
              ))}
            </select>
          </label>
          <div className="edit-interest-field">
            <span>Interests</span>
            <div className="interest-grid compact">
              {ONBOARDING_INTERESTS.map((interest) => (
                <button
                  key={interest}
                  type="button"
                  className={`interest-chip ${form.interests?.includes(interest) ? "active" : ""}`}
                  onClick={() => toggleFormInterest(interest)}
                >
                  {interest}
                </button>
              ))}
            </div>
            <label className="onboarding-typebox edit-interest-add">
              Add interest
              <input
                value={interestText}
                onChange={(event) => setInterestText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addFormInterest();
                  }
                }}
                list="flame-edit-interest-options"
                placeholder="Type an interest and press Enter"
              />
              <datalist id="flame-edit-interest-options">
                {ONBOARDING_INTERESTS.map((interest) => (
                  <option key={interest} value={interest} />
                ))}
              </datalist>
            </label>
            {form.interests?.length > 0 && (
              <div className="selected-interest-row">
                {form.interests.map((interest) => (
                  <button key={interest} type="button" onClick={() => toggleFormInterest(interest)}>
                    {interest} x
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="form-grid">
            <label>
              Work
              <input type="text" value={form.work} onChange={(event) => update("work", event.target.value)} />
            </label>
            <label>
              School
              <input type="text" value={form.school} onChange={(event) => update("school", event.target.value)} />
            </label>
          </div>
          <label>
            About me
            <textarea
              rows="4"
              value={form.bio}
              onChange={(event) => update("bio", event.target.value)}
            />
          </label>
          <div className="edit-media-panel">
            <div className="section-label">
              <span>Profile media</span>
              <span className="accent">{(form.media || []).length}/6</span>
            </div>
            <div className="profile-media edit-media-grid">
              {(form.media || []).map((src, index) => (
                <div key={`${src}-${index}`} className="media-thumb">
                  <img src={src} alt={`Profile media ${index + 1}`} />
                  <div className="media-actions">
                    <button type="button" onClick={() => setMainPhoto(src)}>
                      {src === form.image ? "Main" : "Use"}
                    </button>
                    <button type="button" onClick={() => removeMedia(index)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="media-add-thumb"
                onClick={() => mediaInput.current?.click()}
                disabled={(form.media || []).length >= 6}
              >
                <span>+</span>
                <p>{(form.media || []).length >= 6 ? "Full" : "Add media"}</p>
              </button>
            </div>
            <input ref={mediaInput} type="file" accept="image/*" hidden onChange={(event) => handleMediaFile(event.target.files?.[0])} />
          </div>
          <button type="submit" className="cta" disabled={!form.fullName.trim() || !form.location.trim()}>
            Save changes
          </button>
        </form>
      </div>
    </section>
  );
}

function BottomNav({ tab, setTab, unread, onHomeRefresh, onNotifications, onLogout }) {
  const lastHomeTap = useRef(0);
  const items = [
    { id: "home", label: "Home", icon: <HomeIcon /> },
    { id: "discover", label: "Discover", desktopLabel: "Explore", icon: <HeartIcon /> },
    { id: "matches", label: "Matches", icon: <FlameIcon />, mobileOnly: true },
    { id: "messages", label: "Messages", badge: unread, icon: <MessageIcon /> },
    { id: "profile", label: "Profile", icon: <UserIcon /> },
    { id: "settings", label: "Settings", icon: <SettingsIcon />, desktopOnly: true },
    { id: "logout", label: "Log out", icon: <LogoutIcon />, desktopOnly: true, action: onLogout, separated: true }
  ];

  return (
    <nav className="bottom-nav" aria-label="Primary">
      <div className="nav-rail-brand" aria-hidden="true">
        <img src={LOGO_SRC} alt="" />
      </div>
      {items.map((item) => {
        const targetTab = item.target || item.id;
        const isActive = item.action || item.neverActive ? false : tab === targetTab;
        return (
        <button
          key={item.id}
          type="button"
          className={`${isActive ? "active" : ""} ${item.desktopOnly ? "desktop-only" : ""} ${item.mobileOnly ? "mobile-only" : ""} ${item.separated ? "rail-separated" : ""}`}
          onClick={() => {
            if (item.action) {
              item.action();
              return;
            }
            if (item.id === "home") {
              lastHomeTap.current = 0;
              if (tab !== "home") setTab("home");
              window.setTimeout(() => onHomeRefresh?.(), 0);
              return;
            }
            lastHomeTap.current = 0;
            setTab(targetTab);
          }}
          aria-current={isActive ? "page" : undefined}
          aria-label={item.label}
        >
          <span className="nav-icon-wrap">
            {item.icon}
            {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
          </span>
          <span className="nav-label">
            <span className="mobile-label">{item.label}</span>
            <span className="desktop-label">{item.desktopLabel || item.label}</span>
          </span>
        </button>
        );
      })}
    </nav>
  );
}

function MatchModal({ profile, user, onClose, onMessage }) {
  return (
    <motion.div
      className="match-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Matched with ${profile.name}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="match-card"
        initial={{ scale: 0.74, y: 34, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", damping: 17, stiffness: 220 }}
        onClick={(event) => event.stopPropagation()}
      >
        <motion.img
          className="match-main-logo"
          src={LOGO_SRC}
          alt=""
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.08, type: "spring", damping: 14, stiffness: 180 }}
        />
        <div className="match-title">It's a Match!</div>
        <div className="match-sub">You and {profile.name} liked each other</div>
        <div className="match-avs">
          <motion.img src={user.image} alt="" initial={{ x: -44, rotate: -10 }} animate={{ x: 0, rotate: -6 }} transition={{ delay: 0.12 }} />
          <motion.img src={profile.image} alt="" initial={{ x: 44, rotate: 10 }} animate={{ x: 0, rotate: 6 }} transition={{ delay: 0.2 }} />
        </div>
        <div className="match-actions">
          <button className="match-btn primary" onClick={onMessage}>
            Send a Message
          </button>
          <button className="match-btn ghost" onClick={onClose}>
            Keep Swiping
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function MatchBurst() {
  const burst = [
    { x: -170, y: -120, size: 42, rotate: -22, delay: 0 },
    { x: -122, y: -72, size: 34, rotate: 20, delay: 0.05 },
    { x: -86, y: -170, size: 38, rotate: -12, delay: 0.08 },
    { x: 0, y: -190, size: 54, rotate: 8, delay: 0.1 },
    { x: 82, y: -144, size: 36, rotate: 26, delay: 0.12 },
    { x: 148, y: -96, size: 44, rotate: -18, delay: 0.14 },
    { x: 172, y: 0, size: 30, rotate: 14, delay: 0.16 },
    { x: 132, y: 104, size: 40, rotate: -28, delay: 0.18 },
    { x: 66, y: 160, size: 46, rotate: 32, delay: 0.2 },
    { x: 0, y: 186, size: 34, rotate: -16, delay: 0.22 },
    { x: -78, y: 164, size: 48, rotate: 20, delay: 0.24 },
    { x: -146, y: 96, size: 30, rotate: -34, delay: 0.26 },
    { x: -184, y: 12, size: 32, rotate: 18, delay: 0.28 },
    { x: 42, y: 52, size: 24, rotate: -12, delay: 0.32 }
  ];

  return (
    <motion.div className="match-burst-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        className="burst-ring"
        initial={{ opacity: 0, scale: 0.24 }}
        animate={{ opacity: [0, 1, 0], scale: [0.24, 1.3, 2.1] }}
        transition={{ duration: 2.6, ease: "easeOut" }}
      />
      <motion.img
        className="match-burst-center"
        src={LOGO_SRC}
        alt=""
        initial={{ opacity: 0, scale: 0.35, rotate: -14 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.35, 1.18, 1.08, 0.72], rotate: [-14, 0, 10, 0] }}
        transition={{ duration: 2.7, times: [0, 0.14, 0.78, 1], ease: "easeOut" }}
      />
      {burst.map((item, index) => (
        <motion.img
          key={`burst-${index}`}
          className="match-burst-logo"
          src={LOGO_SRC}
          alt=""
          initial={{ opacity: 0, scale: 0.36, x: 0, y: 0, rotate: 0 }}
          animate={{
            opacity: [0, 1, 1, 0],
            scale: [0.36, 1.22, 1, 0.58],
            x: [0, item.x * 0.78, item.x],
            y: [0, item.y * 0.78, item.y],
            rotate: [0, item.rotate, item.rotate * 1.2]
          }}
          transition={{ duration: 2.55, delay: item.delay, times: [0, 0.16, 0.72, 1], ease: "easeOut" }}
          style={{ width: `${item.size}px`, height: `${item.size}px` }}
        />
      ))}
    </motion.div>
  );
}

function EmptyState({ title, subtitle }) {
  return (
    <div className="empty-state">
      <img src={LOGO_SRC} alt="" />
      <h3>{title}</h3>
      <p>{subtitle}</p>
    </div>
  );
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

function loadImageSource(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image."));
    image.src = src;
  });
}

async function compressImageFile(file, { maxEdge = 1600, maxChars = 1_420_000, quality = 0.84 } = {}) {
  if (!file || !String(file.type || "").startsWith("image/")) return "";
  const original = await readImageFile(file);
  if (original.length <= maxChars) return original;

  const image = await loadImageSource(original);
  let edge = maxEdge;
  let currentQuality = quality;
  let output = original;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const scale = Math.min(1, edge / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, width, height);
    output = canvas.toDataURL("image/jpeg", currentQuality);
    if (output.length <= maxChars) return output;
    edge = Math.max(720, Math.round(edge * 0.82));
    currentQuality = Math.max(0.58, currentQuality - 0.08);
  }

  return output;
}

function relativeTime(ts) {
  if (!ts) return "now";
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString();
}

function profileBackgroundStyle(background = "") {
  const value = String(background || "").trim();
  if (!value) return {};
  if (value.startsWith("data:image") || value.startsWith("http") || value.startsWith("/")) {
    return { "--profile-hero-background": `url("${value}")` };
  }
  if (value.includes("gradient(")) return { "--profile-hero-background": value };
  return { "--profile-hero-background": value };
}

function relativeTimeLong(ts) {
  if (!ts) return "";
  const diff = Math.max(0, Date.now() - ts);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"}`;
  return new Date(ts).toLocaleDateString();
}

function reactionName(reaction) {
  return FEED_REACTIONS.find((item) => item.id === reaction)?.label || reaction || "reaction";
}

function shortActivityText(text) {
  const clean = String(text || "").trim();
  if (!clean) return "";
  return clean.length > 72 ? `${clean.slice(0, 69)}...` : clean;
}

function activityEventTitle(event) {
  const actor = event?.actor?.name || "Someone";
  switch (event?.type) {
    case "post_reaction":
      return `${actor} reacted ${reactionName(event.reaction)} to your post`;
    case "post_comment":
      return `${actor} commented on your post`;
    case "comment_reply":
      return `${actor} replied to a comment`;
    case "comment_reaction":
      return `${actor} reacted ${reactionName(event.reaction)} to your comment`;
    case "post_share":
      return `${actor} shared your post`;
    case "match_post":
      return `${actor} posted a new update`;
    default:
      return `${actor} has new activity`;
  }
}

function activityEventPreview(event) {
  const text = shortActivityText(event?.text);
  if (text) return text;
  if (event?.type === "match_post") return "A matched user posted on Flame.";
  if (event?.type === "post_reaction" || event?.type === "comment_reaction") {
    return `${reactionName(event.reaction)} reaction`;
  }
  return "Tap to view the home feed.";
}

function activityText(profile) {
  if (profile?.online) return "Online now";
  const lastActive = relativeTimeLong(profile?.lastActiveAt);
  if (!lastActive) return "Offline";
  return lastActive === "just now" ? "Offline just now" : `Offline ${lastActive} ago`;
}

function activityPillText(profile) {
  if (!profile?.lastActiveAt) return "Offline";
  const lastActive = relativeTime(profile.lastActiveAt);
  return lastActive === "just now" ? "Offline now" : `Offline ${lastActive}`;
}

function seenText(ts) {
  const seenAt = relativeTime(ts);
  return seenAt === "just now" ? "Seen just now" : `Seen ${seenAt} ago`;
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function RewindIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

function HeartIcon({ fill = false }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth={fill ? "0" : "2"} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      <polygon points="12,2 15.1,8.6 22,9.5 17,14.4 18.2,21.5 12,18.1 5.8,21.5 7,14.4 2,9.5 8.9,8.6" />
    </svg>
  );
}

function LightningIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l3-7 4 14 3-7h4" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14a8 8 0 1 0 16 0C20 9.79 17.99 6.04 13.5.67z" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4h12v17l-6-3.4L6 21V4Z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3.5" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 0 1-4 0v-.08a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 0 1 0-4h.08A1.7 1.7 0 0 0 4.6 8.96a1.7 1.7 0 0 0-.34-1.87l-.05-.05a2 2 0 1 1 2.83-2.83l.05.05a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 0 1 4 0v.08a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05a1.7 1.7 0 0 0-.34 1.87v.04a1.7 1.7 0 0 0 1.56 1H21a2 2 0 0 1 0 4h-.08A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-3" />
      <path d="M9 12h12m-4-4 4 4-4 4" />
    </svg>
  );
}

function DetailIcon({ type }) {
  if (type === "work") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M3 13h18" />
      </svg>
    );
  }

  if (type === "school") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 10 12 5 2 10l10 5 10-5Z" />
        <path d="M6 12v5c3 2 9 2 12 0v-5" />
      </svg>
    );
  }

  if (type === "heart") {
    return <HeartIcon />;
  }

  if (type === "star") {
    return <StarIcon />;
  }

  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s7-4.35 7-11a7 7 0 0 0-14 0c0 6.65 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.78 19.78 0 0 1 3 6.18 2 2 0 0 1 5 4h3a2 2 0 0 1 2 1.72 12.18 12.18 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L9.91 11.09a16 16 0 0 0 6 6l1.45-1.45a2 2 0 0 1 2.11-.45 12.18 12.18 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="M21 15l-5-5L5 20" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H3v6h3l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

function VolumeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H3v6h3l5 4V5z" />
      <path d="M16 9l5 5" />
      <path d="M21 9l-5 5" />
    </svg>
  );
}

function MusicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05 12.35 20.14a4.25 4.25 0 0 1-6-6l9.09-9.09a3.25 3.25 0 0 1 4.6 4.6L11 17.66a1.75 1.75 0 0 1-2.48-2.48l8.18-8.18" />
    </svg>
  );
}

function SmileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <path d="M9 9h.01" />
      <path d="M15 9h.01" />
    </svg>
  );
}

function ForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 9V5l7 7-7 7v-4H9a6 6 0 0 0-6 6v-1a10 10 0 0 1 10-10h1z" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

function BlockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6 18.4 18.4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 1 3 3v10a3 3 0 0 1-6 0V4a3 3 0 0 1 3-3z" />
      <path d="M19 10a7 7 0 0 1-14 0" />
      <path d="M15 21H9" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
    </svg>
  );
}
