import { readPrewrittenPosts } from "./lib/prewritten.js";

const posts = readPrewrittenPosts();

for (const entry of posts) {
  console.log(`${entry.date} ${entry.time} ${entry.post}`);
}

console.log(`\nTotal: ${posts.length} posts`);
