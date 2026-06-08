import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export const REQUIRED_OPENAI_ENV = ["OPENAI_API_KEY"];
export const REQUIRED_X_ENV = ["X_APP_KEY", "X_APP_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET"];
export const REQUIRED_X_OAUTH2_ENV = ["X_OAUTH2_ACCESS_TOKEN"];
export const OPTIONAL_ENV = ["OPENAI_MODEL", "POST_TIME", "DRY_RUN", "PREVIEW_COUNT"];

const ENV_ALIASES = {
  X_APP_KEY: ["X_CONSUMER_KEY", "CONSUMER_KEY"],
  X_APP_SECRET: ["X_CONSUMER_SECRET", "CONSUMER_SECRET"],
  X_ACCESS_TOKEN: ["ACCESS_TOKEN"],
  X_ACCESS_SECRET: ["X_ACCESS_TOKEN_SECRET", "ACCESS_TOKEN_SECRET"],
  X_OAUTH2_ACCESS_TOKEN: ["X_USER_ACCESS_TOKEN", "USER_ACCESS_TOKEN"]
};

export function loadLocalEnv(filePath = path.join(process.cwd(), ".env")) {
  if (!fs.existsSync(filePath)) return false;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return true;
}

export function applyEnvAliases() {
  for (const [canonicalKey, aliases] of Object.entries(ENV_ALIASES)) {
    if (process.env[canonicalKey]) continue;

    const alias = aliases.find((key) => process.env[key]);
    if (alias) {
      process.env[canonicalKey] = process.env[alias];
    }
  }
}

export function missingEnv(keys) {
  return keys.filter((key) => !process.env[key]);
}

export function hasOAuth1Credentials() {
  return missingEnv(REQUIRED_X_ENV).length === 0;
}

export function hasOAuth2Credentials() {
  return Boolean(process.env.X_OAUTH2_ACCESS_TOKEN);
}
