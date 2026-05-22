import { randomUUID, scryptSync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = resolve(SCRIPT_DIR, "..");
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

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? "" : process.argv[index + 1] || "";
}

function passwordHash(password, salt = randomUUID()) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

loadEnvFile();

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("Usage: npm run reset-password -- --email user@example.com --password NewPassword123");
  process.exit(0);
}

const email = argValue("--email").trim().toLowerCase();
const password = argValue("--password");

if (!email || !password) {
  console.error("Usage: npm run reset-password -- --email user@example.com --password NewPassword123");
  process.exit(1);
}

if (!email.includes("@")) {
  console.error("Use a valid email address.");
  process.exit(1);
}

if (password.length < 6) {
  console.error("Password must be at least 6 characters.");
  process.exit(1);
}

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const dbName = process.env.MONGODB_DB || "flame";
const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);
  const result = await db.collection("users").updateOne(
    { email },
    {
      $set: {
        passwordHash: passwordHash(password),
        lastActiveAt: Date.now()
      }
    }
  );

  if (result.matchedCount === 0) {
    console.error(`No account found for ${email}.`);
    process.exitCode = 1;
  } else {
    console.log(`Password reset complete for ${email}.`);
  }
} finally {
  await client.close();
}
