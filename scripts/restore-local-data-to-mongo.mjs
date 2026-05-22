import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { BSON, MongoClient } from "mongodb";

const DEFAULT_SOURCE = ".flame-data/disabled-local-stores-20260522-214245/flame-local.json";
const COLLECTIONS = ["users", "sessions", "posts", "supportTickets"];
const MONGO_DOCUMENT_LIMIT_BYTES = 15 * 1024 * 1024;
const RESTORE_TARGET_DOCUMENT_BYTES = Math.max(1, Number(process.env.FLAME_RESTORE_TARGET_MB) || 8) * 1024 * 1024;
const DEFAULT_PROFILE_IMAGE = "/flame-logo.gif";
const STORY_TTL_MS = 24 * 60 * 60 * 1000;

function parseArgs(argv) {
  const args = {
    apply: false,
    skipBackup: false,
    skipIndexes: false,
    source: DEFAULT_SOURCE
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--skip-backup") {
      args.skipBackup = true;
    } else if (arg === "--skip-indexes") {
      args.skipIndexes = true;
    } else if (arg === "--source") {
      args.source = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--source=")) {
      args.source = arg.slice("--source=".length);
    }
  }

  return args;
}

function loadEnvFile(file) {
  const path = resolve(file);
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function countLocalData(data) {
  const users = Array.isArray(data.users) ? data.users : [];
  return {
    users: users.length,
    posts: Array.isArray(data.posts) ? data.posts.length : 0,
    sessions: Array.isArray(data.sessions) ? data.sessions.length : 0,
    supportTickets: Array.isArray(data.supportTickets) ? data.supportTickets.length : 0,
    matches: users.reduce((sum, user) => sum + (Array.isArray(user?.state?.matches) ? user.state.matches.length : 0), 0),
    messages: users.reduce(
      (sum, user) =>
        sum +
        (Array.isArray(user?.state?.matches)
          ? user.state.matches.reduce((matchSum, match) => matchSum + (Array.isArray(match.messages) ? match.messages.length : 0), 0)
          : 0),
      0
    ),
    stories: users.reduce((sum, user) => sum + (Array.isArray(user?.state?.stories) ? user.state.stories.length : 0), 0)
  };
}

async function countMongoData(db) {
  const [users, posts, sessions, supportTickets] = await Promise.all([
    db.collection("users").countDocuments(),
    db.collection("posts").countDocuments(),
    db.collection("sessions").countDocuments(),
    db.collection("supportTickets").countDocuments()
  ]);

  const [stateCounts] = await db
    .collection("users")
    .aggregate([
      {
        $project: {
          matches: { $size: { $ifNull: ["$state.matches", []] } },
          messages: {
            $sum: {
              $map: {
                input: { $ifNull: ["$state.matches", []] },
                as: "match",
                in: { $size: { $ifNull: ["$$match.messages", []] } }
              }
            }
          },
          stories: { $size: { $ifNull: ["$state.stories", []] } }
        }
      },
      { $group: { _id: null, matches: { $sum: "$matches" }, messages: { $sum: "$messages" }, stories: { $sum: "$stories" } } }
    ])
    .toArray();

  return {
    users,
    posts,
    sessions,
    supportTickets,
    matches: stateCounts?.matches || 0,
    messages: stateCounts?.messages || 0,
    stories: stateCounts?.stories || 0
  };
}

function withoutMongoId(document) {
  if (!document || typeof document !== "object") return document;
  const { _id, ...rest } = document;
  return rest;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function bsonSize(document) {
  return BSON.calculateObjectSize(document);
}

function isExpiredStory(story, now = Date.now()) {
  const createdAt = Number(story?.createdAt) || now;
  const expiresAt = Number(story?.expiresAt) || createdAt + STORY_TTL_MS;
  return expiresAt <= now;
}

function mediaSize(value) {
  return typeof value === "string" ? Buffer.byteLength(value) : 0;
}

function compactUserForMongo(localUser) {
  const user = clone(withoutMongoId(localUser));
  const compacted = {
    removedEvents: 0,
    removedExpiredStories: 0,
    removedStories: 0,
    removedMatchProfiles: 0,
    compactedProfileMedia: false,
    strippedMessageMedia: 0,
    strippedStoryReplyMedia: 0,
    replacedProfileImage: false
  };

  user.email = String(user.email || "").trim().toLowerCase();
  user.state = user.state && typeof user.state === "object" ? user.state : {};
  user.state.user = user.state.user && typeof user.state.user === "object" ? user.state.user : {};

  if (Array.isArray(user.state.events)) {
    compacted.removedEvents = user.state.events.length;
    user.state.events = [];
  }

  if (Array.isArray(user.state.stories)) {
    const before = user.state.stories.length;
    user.state.stories = user.state.stories.filter((story) => !isExpiredStory(story));
    compacted.removedExpiredStories = before - user.state.stories.length;
  }

  if (Array.isArray(user.state.matches)) {
    for (const match of user.state.matches) {
      if (match?.profile) {
        delete match.profile;
        compacted.removedMatchProfiles += 1;
      }
    }
  }

  const profile = user.state.user;
  const image = typeof profile.image === "string" && profile.image ? profile.image : DEFAULT_PROFILE_IMAGE;
  if (Array.isArray(profile.media)) {
    const media = [];
    for (const item of [image, ...profile.media]) {
      if (typeof item !== "string" || !item) continue;
      if (media.includes(item)) continue;
      if (mediaSize(item) > 2 * 1024 * 1024) continue;
      media.push(item);
      if (media.length >= 4) break;
    }
    profile.media = media.length ? media : [image];
    compacted.compactedProfileMedia = true;
  }

  if (bsonSize(user) > RESTORE_TARGET_DOCUMENT_BYTES && Array.isArray(user.state.stories)) {
    compacted.removedStories += user.state.stories.length;
    user.state.stories = [];
  }

  if (bsonSize(user) > RESTORE_TARGET_DOCUMENT_BYTES && Array.isArray(user.state.matches)) {
    const mediaRefs = [];
    for (const match of user.state.matches) {
      for (const message of Array.isArray(match.messages) ? match.messages : []) {
        if (message?.media) mediaRefs.push({ type: "media", message, bytes: mediaSize(message.media) });
        if (message?.storyReply?.media) mediaRefs.push({ type: "storyReply", message, bytes: mediaSize(message.storyReply.media) });
      }
    }

    mediaRefs.sort((left, right) => right.bytes - left.bytes);
    for (const ref of mediaRefs) {
      if (bsonSize(user) <= RESTORE_TARGET_DOCUMENT_BYTES) break;
      if (ref.type === "media") {
        ref.message.media = "";
        compacted.strippedMessageMedia += 1;
      } else if (ref.message.storyReply) {
        ref.message.storyReply.media = "";
        compacted.strippedStoryReplyMedia += 1;
      }
    }
  }

  if (bsonSize(user) > RESTORE_TARGET_DOCUMENT_BYTES) {
    profile.image = DEFAULT_PROFILE_IMAGE;
    profile.background = "";
    profile.media = [DEFAULT_PROFILE_IMAGE];
    compacted.replacedProfileImage = true;
  }

  if (bsonSize(user) > MONGO_DOCUMENT_LIMIT_BYTES) {
    throw new Error(`User ${user.id} is still larger than MongoDB's document limit after compaction.`);
  }

  return {
    user,
    compacted,
    bytes: bsonSize(user)
  };
}

function backupPath() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("");
  return `.flame-data/backups/mongo-before-restore-${stamp}.json`;
}

async function backupMongo(db, dbName) {
  const path = backupPath();
  mkdirSync(dirname(path), { recursive: true });
  const stream = createWriteStream(path, { encoding: "utf8" });
  stream.write(`{"exportedAt":${JSON.stringify(new Date().toISOString())},"database":${JSON.stringify(dbName)}`);

  for (const collectionName of COLLECTIONS) {
    stream.write(`,"${collectionName}":[`);
    let first = true;
    const cursor = db.collection(collectionName).find({});
    for await (const document of cursor) {
      if (!first) stream.write(",");
      first = false;
      stream.write(JSON.stringify(document));
    }
    stream.write("]");
  }

  stream.write("}\n");
  await new Promise((resolveStream, rejectStream) => {
    stream.end(resolveStream);
    stream.on("error", rejectStream);
  });
  return path;
}

async function ensureIndexes(db) {
  const specs = [
    ["users", { email: 1 }, { unique: true }],
    ["users", { id: 1 }, { unique: true }],
    ["sessions", { token: 1 }, { unique: true }],
    ["sessions", { userId: 1 }],
    ["sessions", { lastSeenAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }],
    ["posts", { id: 1 }, { unique: true }],
    ["posts", { authorId: 1 }],
    ["posts", { tags: 1 }],
    ["posts", { createdAt: -1 }],
    ["supportTickets", { userId: 1 }],
    ["supportTickets", { createdAt: -1 }]
  ];

  for (const [collectionName, keys, options = {}] of specs) {
    await db.collection(collectionName).createIndex(keys, options);
  }
}

async function restoreUsers(db, localUsers, apply) {
  const users = db.collection("users");
  const sessions = db.collection("sessions");
  const posts = db.collection("posts");
  const summary = {
    inserted: 0,
    replacedByEmail: 0,
    replacedById: 0,
    deletedStaleSessions: 0,
    remappedExistingPosts: 0,
    compacted: 0
  };

  for (const localUser of localUsers) {
    if (!localUser?.id || !localUser?.email) continue;

    const compactedUser = compactUserForMongo(localUser);
    if (JSON.stringify(compactedUser.compacted) !== JSON.stringify({
      removedEvents: 0,
      removedExpiredStories: 0,
      removedStories: 0,
      removedMatchProfiles: 0,
      compactedProfileMedia: false,
      strippedMessageMedia: 0,
      strippedStoryReplyMedia: 0,
      replacedProfileImage: false
    })) {
      summary.compacted += 1;
    }

    const email = compactedUser.user.email;
    const existingByEmail = await users.findOne({ email }, { projection: { _id: 1, id: 1, email: 1 } });
    const existingById = existingByEmail ? null : await users.findOne({ id: compactedUser.user.id }, { projection: { _id: 1, id: 1, email: 1 } });
    const existing = existingByEmail || existingById;

    if (!existing) {
      summary.inserted += 1;
      if (apply) await users.insertOne(compactedUser.user);
      continue;
    }

    if (existingByEmail) summary.replacedByEmail += 1;
    else summary.replacedById += 1;

    if (apply) {
      const replacement = {
        ...compactedUser.user,
        _id: existing._id,
        email
      };
      await users.replaceOne({ _id: existing._id }, replacement);

      if (existing.id && existing.id !== compactedUser.user.id) {
        const deleted = await sessions.deleteMany({ userId: existing.id });
        summary.deletedStaleSessions += deleted.deletedCount || 0;
        const remappedPosts = await posts.updateMany({ authorId: existing.id }, { $set: { authorId: compactedUser.user.id } });
        summary.remappedExistingPosts += remappedPosts.modifiedCount || 0;
      }
    }
  }

  return summary;
}

async function restoreById(collection, documents, apply) {
  const summary = {
    inserted: 0,
    replaced: 0,
    skipped: 0
  };

  for (const document of documents) {
    if (!document?.id) {
      summary.skipped += 1;
      continue;
    }

    const existing = await collection.findOne({ id: document.id }, { projection: { _id: 1, id: 1 } });
    if (existing) summary.replaced += 1;
    else summary.inserted += 1;

    if (apply) {
      const replacement = existing ? { ...withoutMongoId(document), _id: existing._id } : withoutMongoId(document);
      await collection.replaceOne({ id: document.id }, replacement, { upsert: true });
    }
  }

  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile("Backend/.env");
  loadEnvFile(".env");

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing.");
  }

  const sourcePath = resolve(args.source);
  const localData = JSON.parse(readFileSync(sourcePath, "utf8"));
  const dbName = process.env.MONGODB_DB || "flame";
  const client = new MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: Math.max(10000, Number(process.env.MONGODB_TIMEOUT_MS) || 10000),
    connectTimeoutMS: Math.max(10000, Number(process.env.MONGODB_TIMEOUT_MS) || 10000),
    socketTimeoutMS: Math.max(0, Number(process.env.MONGODB_SOCKET_TIMEOUT_MS) || 0)
  });

  await client.connect();
  const db = client.db(dbName);

  const before = await countMongoData(db);
  const local = countLocalData(localData);
  const plan = {
    mode: args.apply ? "apply" : "dry-run",
    source: sourcePath,
    database: dbName,
    local,
    before
  };

  console.log(JSON.stringify(plan, null, 2));

  let backup = "";
  if (args.apply) {
    if (args.skipBackup) {
      console.log("Skipping Mongo backup because --skip-backup was passed.");
    } else {
      backup = await backupMongo(db, dbName);
      console.log(`Created Mongo backup: ${backup}`);
    }
  } else {
    console.log("Dry run only. Re-run with --apply to write changes.");
  }

  const userSummary = await restoreUsers(db, Array.isArray(localData.users) ? localData.users : [], args.apply);
  const postSummary = await restoreById(db.collection("posts"), Array.isArray(localData.posts) ? localData.posts : [], args.apply);
  const ticketSummary = await restoreById(
    db.collection("supportTickets"),
    Array.isArray(localData.supportTickets) ? localData.supportTickets : [],
    args.apply
  );

  if (args.apply && !args.skipIndexes) await ensureIndexes(db);

  const after = await countMongoData(db);
  console.log(
    JSON.stringify(
      {
        backup,
        users: userSummary,
        posts: postSummary,
        supportTickets: ticketSummary,
        after
      },
      null,
      2
    )
  );

  await client.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
