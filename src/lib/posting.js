import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import OpenAI from "openai";
import { TwitterApi } from "twitter-api-v2";
import { applyEnvAliases, hasOAuth1Credentials, hasOAuth2Credentials, loadLocalEnv, missingEnv, REQUIRED_X_ENV } from "./env.js";

loadLocalEnv();
applyEnvAliases();

export const LOG_PATH = path.join(process.cwd(), "logs", "posts.jsonl");
export const POST_SLOTS = ["08:00", "12:00", "20:00"];

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MIN_LENGTH = 50;
const MAX_LENGTH = 120;
const MAX_ATTEMPTS = 8;
const SIMILARITY_THRESHOLD = 0.42;
const THEMES = ["心理", "行動", "習慣", "思考", "人間観察"];
const SLOT_HINTS = {
  "08:00": "朝に読みたくなる、静かに背中を押す観察",
  "12:00": "昼の切り替えに効く、行動や習慣の観察",
  "20:00": "夜に振り返りたくなる、思考や人間観察"
};

export function getJstNow() {
  const now = new Date();
  return new Date(now.getTime() + JST_OFFSET_MS);
}

export function formatJstDate(date) {
  return date.toISOString().slice(0, 10);
}

export function currentSlot(date) {
  const hour = date.getUTCHours();
  if (hour < 10) return "08:00";
  if (hour < 16) return "12:00";
  return "20:00";
}

export function ensureLogFile() {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  if (!fs.existsSync(LOG_PATH)) {
    fs.writeFileSync(LOG_PATH, "", "utf8");
  }
}

export function readLogs() {
  ensureLogFile();
  return fs
    .readFileSync(LOG_PATH, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function recentPosts(logs, days = 30) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return logs.filter((entry) => {
    const createdAt = Date.parse(entry.createdAt ?? `${entry.date}T00:00:00+09:00`);
    return Number.isFinite(createdAt) && createdAt >= cutoff;
  });
}

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[「」『』"'“”‘’、。,.!?！？\s#＃]/g, "")
    .trim();
}

function bigrams(text) {
  const normalized = normalize(text);
  const grams = new Set();
  for (let i = 0; i < normalized.length - 1; i += 1) {
    grams.add(normalized.slice(i, i + 2));
  }
  return grams;
}

function jaccard(a, b) {
  const left = bigrams(a);
  const right = bigrams(b);
  if (left.size === 0 || right.size === 0) return 0;

  let intersection = 0;
  for (const gram of left) {
    if (right.has(gram)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

function similarityReason(candidate, previousPost) {
  const left = normalize(candidate);
  const right = normalize(previousPost);
  if (left.includes(right) || right.includes(left)) return "contains";

  const score = jaccard(candidate, previousPost);
  if (score >= SIMILARITY_THRESHOLD) return `jaccard:${score.toFixed(2)}`;
  return null;
}

export function validatePost(post, previousEntries) {
  const text = post.trim();
  if (text.length < MIN_LENGTH || text.length > MAX_LENGTH) {
    return `length:${text.length}`;
  }
  if (/[#＃@＠]/.test(text)) {
    return "contains hashtag or mention";
  }
  if (/[\r\n]/.test(text)) {
    return "contains newline";
  }

  for (const entry of previousEntries) {
    const reason = similarityReason(text, entry.post ?? "");
    if (reason) return `similar to ${entry.date} ${entry.time}: ${reason}`;
  }

  return null;
}

function buildPrompt({ slot, previousPosts, attempt, extraAvoidPosts = [] }) {
  const theme = THEMES[(new Date().getUTCDate() + attempt) % THEMES.length];
  const recentExamples = [...previousPosts, ...extraAvoidPosts]
    .slice(-12)
    .map((entry) => `- ${entry.post}`)
    .join("\n");

  return [
    "Xに投稿する日本語の短文を1つだけ作成してください。",
    `テーマ: ${theme}`,
    `時間帯: ${slot} (${SLOT_HINTS[slot]})`,
    "条件:",
    "- 50〜120文字",
    "- 心理、行動、習慣、思考、人間観察のどれかに自然につながる",
    "- 断定しすぎず、観察として読める",
    "- 1文または2文",
    "- 絵文字を自然に1個だけ入れる。文脈に合う控えめなものを選ぶ",
    "- ハッシュタグ、URL、メンション、引用符、箇条書きは禁止",
    "- 過去投稿と似た言い回しを避ける",
    "",
    "直近投稿例:",
    recentExamples || "- なし"
  ].join("\n");
}

export async function generatePost({ slot, previousPosts, extraAvoidPosts = [] }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required.");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      input: buildPrompt({ slot, previousPosts, attempt, extraAvoidPosts }),
      max_output_tokens: 180
    });

    const candidate = response.output_text.replace(/^["「]|["」]$/g, "").trim();
    const error = validatePost(candidate, [...previousPosts, ...extraAvoidPosts]);
    if (!error) return candidate;

    console.log(`Rejected candidate (${error}): ${candidate}`);
  }

  throw new Error("Could not generate a valid non-duplicate post.");
}

export async function publishToX(post) {
  const authMode = process.env.X_AUTH_MODE?.toLowerCase();

  if (authMode === "oauth2" || (!authMode && hasOAuth2Credentials() && !hasOAuth1Credentials())) {
    return publishToXWithOAuth2(post);
  }

  const missing = missingEnv(REQUIRED_X_ENV);
  if (missing.length > 0) {
    throw new Error(
      `Missing X OAuth1 credentials: ${missing.join(", ")}. For OAuth2, set X_AUTH_MODE=oauth2 and X_OAUTH2_ACCESS_TOKEN.`
    );
  }

  const client = new TwitterApi({
    appKey: process.env.X_APP_KEY,
    appSecret: process.env.X_APP_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_SECRET
  });

  const result = await client.v2.tweet(post);
  return result.data.id;
}

export function createXOAuth1Client() {
  const missing = missingEnv(REQUIRED_X_ENV);
  if (missing.length > 0) {
    throw new Error(
      `Missing X OAuth1 credentials: ${missing.join(", ")}. For OAuth2, set X_AUTH_MODE=oauth2 and X_OAUTH2_ACCESS_TOKEN.`
    );
  }

  return new TwitterApi({
    appKey: process.env.X_APP_KEY,
    appSecret: process.env.X_APP_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_SECRET
  });
}

export async function replyToX({ text, inReplyToTweetId }) {
  const authMode = process.env.X_AUTH_MODE?.toLowerCase();

  if (authMode === "oauth2" || (!authMode && hasOAuth2Credentials() && !hasOAuth1Credentials())) {
    return replyToXWithOAuth2({ text, inReplyToTweetId });
  }

  const client = createXOAuth1Client();

  const result = await client.v2.tweet(text, {
    reply: {
      in_reply_to_tweet_id: inReplyToTweetId
    }
  });
  return result.data.id;
}

async function publishToXWithOAuth2(post) {
  if (!process.env.X_OAUTH2_ACCESS_TOKEN) {
    throw new Error("Missing X OAuth2 credential: X_OAUTH2_ACCESS_TOKEN");
  }

  const response = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.X_OAUTH2_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text: post })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`X OAuth2 post failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload.data?.id ?? null;
}

async function replyToXWithOAuth2({ text, inReplyToTweetId }) {
  if (!process.env.X_OAUTH2_ACCESS_TOKEN) {
    throw new Error("Missing X OAuth2 credential: X_OAUTH2_ACCESS_TOKEN");
  }

  const response = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.X_OAUTH2_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      reply: {
        in_reply_to_tweet_id: inReplyToTweetId
      }
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`X OAuth2 reply failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload.data?.id ?? null;
}

export function appendLog(entry) {
  ensureLogFile();
  fs.appendFileSync(LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}
