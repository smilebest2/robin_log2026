import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  applyEnvAliases,
  hasOAuth1Credentials,
  hasOAuth2Credentials,
  loadLocalEnv,
  missingEnv,
  OPTIONAL_ENV,
  REQUIRED_OPENAI_ENV,
  REQUIRED_X_ENV,
  REQUIRED_X_OAUTH2_ENV
} from "./lib/env.js";

const root = process.cwd();
const envLoaded = loadLocalEnv();
applyEnvAliases();
const workflowPath = path.join(root, ".github", "workflows", "post.yml");
const logPath = path.join(root, "logs", "posts.jsonl");

function mark(ok) {
  return ok ? "OK" : "NG";
}

function printCheck(label, ok, detail = "") {
  console.log(`${mark(ok)} ${label}${detail ? ` - ${detail}` : ""}`);
}

const missingOpenAI = missingEnv(REQUIRED_OPENAI_ENV);
const missingX = missingEnv(REQUIRED_X_ENV);
const missingXOAuth2 = missingEnv(REQUIRED_X_OAUTH2_ENV);
const optionalSet = OPTIONAL_ENV.filter((key) => process.env[key]);

console.log("robin_log2026 setup check");
console.log("");
printCheck(".env loaded", envLoaded, envLoaded ? ".env found" : "local .env not found; GitHub Secrets can still be used");
printCheck("OpenAI env", missingOpenAI.length === 0, missingOpenAI.length ? `missing: ${missingOpenAI.join(", ")}` : "ready");
printCheck("X OAuth1 env", hasOAuth1Credentials(), missingX.length ? `missing: ${missingX.join(", ")}` : "ready");
printCheck("X OAuth2 env", hasOAuth2Credentials(), missingXOAuth2.length ? `missing: ${missingXOAuth2.join(", ")}` : "ready");
printCheck("GitHub Actions workflow", fs.existsSync(workflowPath), workflowPath);
printCheck("Log file", fs.existsSync(logPath), logPath);
printCheck("Optional env", true, optionalSet.length ? `set: ${optionalSet.join(", ")}` : "none set");

console.log("");
if (missingOpenAI.length === 0 && (hasOAuth1Credentials() || hasOAuth2Credentials())) {
  console.log("Ready for preview and live posting.");
} else if (missingOpenAI.length === 0) {
  console.log("Ready for preview. Add either OAuth1 or OAuth2 user credentials before live posting.");
} else {
  console.log("Add OPENAI_API_KEY before previewing generated posts.");
}
