import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { validatePost } from "./posting.js";

export const PREWRITTEN_POSTS_PATH = path.join(process.cwd(), "data", "prewritten-posts.jsonl");

export function readPrewrittenPosts(filePath = PREWRITTEN_POSTS_PATH) {
  if (!fs.existsSync(filePath)) return [];

  return fs
    .readFileSync(filePath, "utf8")
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

export function findPrewrittenPost({ date, slot, previousPosts }) {
  const post = readPrewrittenPosts().find((entry) => entry.date === date && entry.time === slot);
  if (!post) {
    throw new Error(`No prewritten post found for ${date} ${slot}.`);
  }

  const error = validatePost(post.post, previousPosts);
  if (error) {
    throw new Error(`Prewritten post failed validation for ${date} ${slot}: ${error}`);
  }

  return post.post;
}
