/**
 * API Key Management Utility
 * 
 * Retrieves API keys from user settings (database) first,
 * falls back to environment variables if not set.
 */

import { storage } from "./storage";
import crypto from "crypto";

// Encryption key for API keys (should be in .env in production)
const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_SECRET || "vps-agent-api-key-encryption-32ch";
const IV_LENGTH = 16;

export function encryptApiKey(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)),
    iv
  );
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decryptApiKey(text: string): string {
  try {
    const [ivHex, encryptedHex] = text.split(":");
    if (!ivHex || !encryptedHex) return "";
    
    const iv = Buffer.from(ivHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)),
      iv
    );
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch {
    return "";
  }
}

export function maskApiKey(key: string): string {
  if (!key || key.length < 8) return "••••••••";
  return key.slice(0, 7) + "••••" + key.slice(-4);
}

interface ApiKeys {
  anthropicApiKey: string;
  perplexityApiKey: string;
}

/**
 * Get API keys for a user
 * Priority: Database (user-specific) > Environment variables
 */
export async function getApiKeys(userId: string): Promise<ApiKeys> {
  const settings = await storage.getUserSettings(userId);
  
  let anthropicApiKey = process.env.ANTHROPIC_API_KEY || "";
  let perplexityApiKey = process.env.PERPLEXITY_API_KEY || "";
  
  // Override with user's keys if they exist
  if (settings?.anthropicApiKey) {
    const decrypted = decryptApiKey(settings.anthropicApiKey);
    if (decrypted) anthropicApiKey = decrypted;
  }
  
  if (settings?.perplexityApiKey) {
    const decrypted = decryptApiKey(settings.perplexityApiKey);
    if (decrypted) perplexityApiKey = decrypted;
  }
  
  return { anthropicApiKey, perplexityApiKey };
}

/**
 * Get masked API key status for a user (for display in UI)
 */
export async function getApiKeyStatus(userId: string): Promise<{
  anthropic: { configured: boolean; source: "user" | "env" | "none"; masked: string };
  perplexity: { configured: boolean; source: "user" | "env" | "none"; masked: string };
}> {
  const settings = await storage.getUserSettings(userId);
  
  const anthropicUserKey = settings?.anthropicApiKey ? decryptApiKey(settings.anthropicApiKey) : "";
  const anthropicEnvKey = process.env.ANTHROPIC_API_KEY || "";
  
  const perplexityUserKey = settings?.perplexityApiKey ? decryptApiKey(settings.perplexityApiKey) : "";
  const perplexityEnvKey = process.env.PERPLEXITY_API_KEY || "";
  
  return {
    anthropic: {
      configured: !!(anthropicUserKey || anthropicEnvKey),
      source: anthropicUserKey ? "user" : (anthropicEnvKey ? "env" : "none"),
      masked: maskApiKey(anthropicUserKey || anthropicEnvKey),
    },
    perplexity: {
      configured: !!(perplexityUserKey || perplexityEnvKey),
      source: perplexityUserKey ? "user" : (perplexityEnvKey ? "env" : "none"),
      masked: maskApiKey(perplexityUserKey || perplexityEnvKey),
    },
  };
}
