import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export const REPLY_LOG_PATH = path.join(process.cwd(), "logs", "replies.jsonl");
export const INBOUND_STATE_PATH = path.join(process.cwd(), "logs", "inbound-state.json");

export const SELF_REPLY_TEXT = "世界が平和でありますように";
export const INBOUND_REPLY_TEXT = "ありがとうございます！";

export function ensureReplyLogFile() {
  fs.mkdirSync(path.dirname(REPLY_LOG_PATH), { recursive: true });
  if (!fs.existsSync(REPLY_LOG_PATH)) {
    fs.writeFileSync(REPLY_LOG_PATH, "", "utf8");
  }
}

export function appendReplyLog(entry) {
  ensureReplyLogFile();
  fs.appendFileSync(REPLY_LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

export function readReplyLogs() {
  ensureReplyLogFile();
  return fs
    .readFileSync(REPLY_LOG_PATH, "utf8")
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

export function readInboundState() {
  if (!fs.existsSync(INBOUND_STATE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(INBOUND_STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

export function writeInboundState(state) {
  fs.mkdirSync(path.dirname(INBOUND_STATE_PATH), { recursive: true });
  fs.writeFileSync(INBOUND_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function alreadyReplied(logs, sourceTweetId) {
  return logs.some((entry) => entry.type === "inbound-reply" && entry.sourceTweetId === sourceTweetId);
}

export function randomDelayMs(minMs = 60000, maxMs = 120000) {
  const min = Number.parseInt(process.env.SELF_REPLY_DELAY_MIN_MS ?? String(minMs), 10);
  const max = Number.parseInt(process.env.SELF_REPLY_DELAY_MAX_MS ?? String(maxMs), 10);
  const safeMin = Number.isFinite(min) && min >= 0 ? min : minMs;
  const safeMax = Number.isFinite(max) && max >= safeMin ? max : maxMs;
  return safeMin + Math.floor(Math.random() * (safeMax - safeMin + 1));
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
