import process from "node:process";
import { generatePost, POST_SLOTS, readLogs, recentPosts } from "./lib/posting.js";

function getCountPerSlot() {
  const countArg = process.argv.find((arg) => arg.startsWith("--count="));
  const rawCount = countArg ? countArg.slice("--count=".length) : process.env.PREVIEW_COUNT ?? "3";
  const count = Number.parseInt(rawCount, 10);
  return Number.isFinite(count) && count > 0 ? count : 3;
}

async function main() {
  const countPerSlot = getCountPerSlot();
  const logs = readLogs();
  const previousPosts = recentPosts(logs);
  const generated = [];

  for (const slot of POST_SLOTS) {
    console.log(`\n## ${slot}`);

    for (let index = 0; index < countPerSlot; index += 1) {
      const post = await generatePost({
        slot,
        previousPosts,
        extraAvoidPosts: generated
      });

      generated.push({
        date: "preview",
        time: slot,
        post,
        createdAt: new Date().toISOString()
      });

      console.log(`${index + 1}. ${post}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
