import process from "node:process";
import { findPrewrittenPost } from "./lib/prewritten.js";
import {
  alreadyReplied,
  appendReplyLog,
  INBOUND_REPLY_TEXT,
  randomDelayMs,
  readInboundState,
  readReplyLogs,
  SELF_REPLY_TEXT,
  sleep,
  writeInboundState
} from "./lib/replying.js";
import {
  appendLog,
  createXOAuth1Client,
  currentSlot,
  formatJstDate,
  generatePost,
  getJstNow,
  publishToX,
  replyToX,
  readLogs,
  recentPosts
} from "./lib/posting.js";

function inboundRepliesForDate(logs, date) {
  return logs.filter((entry) => entry.type === "inbound-reply" && entry.date === date).length;
}

async function replyToInboundMentionsBeforePost({ date, slot, dryRun }) {
  const enabled = process.env.INBOUND_REPLY_ENABLED !== "0" && process.env.INBOUND_REPLY_ENABLED !== "false";
  if (!enabled) return;
  const allowedSlot = process.env.INBOUND_REPLY_SLOT || "20:00";
  if (slot !== allowedSlot) {
    console.log(`[inbound-reply] skipped for ${slot}; enabled only at ${allowedSlot}`);
    return;
  }

  const client = createXOAuth1Client();
  const me = await client.v2.me();
  const myUserId = me.data.id;
  const state = readInboundState();
  const replyLogs = readReplyLogs();
  const maxReplies = Number.parseInt(process.env.INBOUND_REPLY_LIMIT ?? "1", 10);
  const safeLimit = Number.isFinite(maxReplies) && maxReplies > 0 ? maxReplies : 1;
  const remainingReplies = Math.max(0, safeLimit - inboundRepliesForDate(replyLogs, date));
  if (remainingReplies === 0) {
    console.log(`[inbound-reply] daily limit reached for ${date}`);
    return;
  }

  const timeline = await client.v2.userMentionTimeline(myUserId, {
    max_results: 10,
    since_id: state.lastMentionId,
    "tweet.fields": ["author_id", "created_at"]
  });

  const mentions = timeline.tweets ?? [];
  if (mentions.length === 0) {
    console.log("[inbound-reply] no new mentions");
    return;
  }

  let newestMentionId = state.lastMentionId;
  let replied = 0;

  for (const mention of mentions.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))) {
    newestMentionId = !newestMentionId || BigInt(mention.id) > BigInt(newestMentionId) ? mention.id : newestMentionId;

    if (mention.author_id === myUserId) continue;
    if (alreadyReplied(replyLogs, mention.id)) continue;
    if (replied >= remainingReplies) continue;

    if (dryRun) {
      console.log(`[dry-run inbound-reply] to ${mention.id}: ${INBOUND_REPLY_TEXT}`);
    } else {
      const replyTweetId = await replyToX({ text: INBOUND_REPLY_TEXT, inReplyToTweetId: mention.id });
      appendReplyLog({
        date,
        time: slot,
        type: "inbound-reply",
        sourceTweetId: mention.id,
        sourceAuthorId: mention.author_id,
        replyTweetId,
        reply: INBOUND_REPLY_TEXT,
        createdAt: new Date().toISOString()
      });
      console.log(`[inbound-reply] ${replyTweetId} -> ${mention.id}: ${INBOUND_REPLY_TEXT}`);
    }

    replied += 1;
  }

  if (!dryRun && newestMentionId) {
    writeInboundState({
      ...state,
      lastMentionId: newestMentionId,
      updatedAt: new Date().toISOString()
    });
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run") || process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
  const jstNow = getJstNow();
  const date = process.env.POST_DATE || formatJstDate(jstNow);
  const slot = process.env.POST_TIME || currentSlot(jstNow);
  const logs = readLogs();
  const previousPosts = recentPosts(logs);
  const source = process.env.POST_SOURCE || "prewritten";
  const post =
    source === "ai" ? await generatePost({ slot, previousPosts }) : findPrewrittenPost({ date, slot, previousPosts });

  if (!dryRun) {
    await replyToInboundMentionsBeforePost({ date, slot, dryRun });
  }

  let tweetId = null;
  if (dryRun) {
    console.log(`[dry-run] ${date} ${slot}: ${post}`);
  } else {
    tweetId = await publishToX(post);
    console.log(`[posted] ${date} ${slot}: ${post}`);
  }

  if (!dryRun) {
    appendLog({
      date,
      time: slot,
      post,
      tweetId,
      createdAt: new Date().toISOString(),
      mode: "live",
      source
    });

    const selfReplyEnabled = process.env.SELF_REPLY_ENABLED !== "0" && process.env.SELF_REPLY_ENABLED !== "false";
    if (selfReplyEnabled) {
      const delayMs = randomDelayMs();
      console.log(`[self-reply] waiting ${delayMs}ms`);
      await sleep(delayMs);

      const replyTweetId = await replyToX({ text: SELF_REPLY_TEXT, inReplyToTweetId: tweetId });
      appendReplyLog({
        date,
        time: slot,
        type: "self-reply",
        postTweetId: tweetId,
        replyTweetId,
        reply: SELF_REPLY_TEXT,
        createdAt: new Date().toISOString()
      });
      console.log(`[self-reply] ${replyTweetId}: ${SELF_REPLY_TEXT}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
