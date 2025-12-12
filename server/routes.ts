import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { Client as SSHClient } from "ssh2";
import multer from "multer";
import * as fs from "fs";
import * as path from "path";

// Dynamic import for pdf-parse (CommonJS module)
async function parsePdf(buffer: Buffer): Promise<string> {
  const mod = await import("pdf-parse");
  const pdfParse = (mod as any).default || mod;
  const data = await pdfParse(buffer);
  return data.text;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'text/plain', 'text/markdown', 'text/csv',
      'application/json'
    ];
    if (allowedTypes.includes(file.mimetype) || file.mimetype.startsWith('text/')) {
      cb(null, true);
    } else {
      cb(new Error('File type not supported. Allowed: images, PDF, text files'));
    }
  }
});

// Session storage (in production, use Redis or database sessions)
const sessions = new Map<string, { email: string; userId: string; expiresAt: Date }>();

// Middleware to check authentication
function requireAuth(req: Request, res: Response, next: () => void) {
  const sessionId = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.sessionId;
  const session = sessions.get(sessionId);
  
  if (!session || session.expiresAt < new Date()) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  (req as any).userId = session.userId;
  (req as any).email = session.email;
  next();
}

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Token estimation (rough approximation: ~4 chars per token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Maximum tokens for context (leaving room for response)
const MAX_CONTEXT_TOKENS = 100000;
const SUMMARY_THRESHOLD = 50; // Number of messages before summarizing

// Summarize older messages to compress context
async function summarizeMessages(messages: { role: string; content: string }[]): Promise<string> {
  const messagesToSummarize = messages.slice(0, -10); // Keep last 10 messages in full
  if (messagesToSummarize.length < 10) return "";
  
  const conversationText = messagesToSummarize
    .map(m => `${m.role}: ${m.content}`)
    .join("\n\n");
  
  try {
    const summary = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `Summarize this conversation history concisely, preserving key information, decisions made, commands executed, and important context:\n\n${conversationText}`
      }]
    });
    
    const textContent = summary.content.find(c => c.type === "text");
    return textContent?.text || "";
  } catch {
    return "";
  }
}

// Build extended context from conversation history and summaries
async function buildExtendedContext(
  conversationId: string,
  recentMessages: { role: string; content: string }[]
): Promise<{ messages: { role: string; content: string }[]; contextInfo: string }> {
  // Get any existing summaries
  const summaries = await storage.getConversationSummaries(conversationId);
  const messageCount = await storage.getMessageCount(conversationId);
  
  let contextMessages: { role: string; content: string }[] = [];
  let contextInfo = "";
  
  // If we have summaries, include them as context
  if (summaries.length > 0) {
    const summaryContext = summaries.map(s => s.summary).join("\n\n---\n\n");
    contextMessages.push({
      role: "user",
      content: `[Previous conversation summary - ${messageCount} total messages]:\n${summaryContext}`
    });
    contextMessages.push({
      role: "assistant",
      content: "I understand the previous conversation context. I'll continue helping you with your VPS management tasks."
    });
    contextInfo = `Extended memory active: ${messageCount} messages tracked`;
  }
  
  // Check if we need to create a new summary
  const recentCount = recentMessages.length;
  if (recentCount > SUMMARY_THRESHOLD) {
    // Summarize older messages
    const summary = await summarizeMessages(recentMessages);
    if (summary) {
      await storage.createConversationSummary({
        conversationId,
        summary,
        messageRange: `1-${recentCount - 10}`,
        tokenCount: estimateTokens(summary),
      });
      
      // Return only recent messages with summary context
      contextMessages.push({
        role: "user",
        content: `[Recent conversation summary]:\n${summary}`
      });
      contextMessages.push({
        role: "assistant",
        content: "Got it, I have the context from our recent discussion."
      });
      
      // Only include last 10 messages in full
      contextMessages = [...contextMessages, ...recentMessages.slice(-10)];
      contextInfo = `Memory compressed: ${recentCount} messages summarized`;
    }
  } else {
    // Include all recent messages
    contextMessages = [...contextMessages, ...recentMessages];
  }
  
  // Ensure we don't exceed token limit
  let totalTokens = contextMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  while (totalTokens > MAX_CONTEXT_TOKENS && contextMessages.length > 2) {
    contextMessages.shift();
    totalTokens = contextMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  }
  
  return { messages: contextMessages, contextInfo };
}

// Perplexity API for research mode
async function performWebResearch(query: string): Promise<{ answer: string; citations: string[] }> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return { answer: "", citations: [] };
  }
  
  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-sonar-small-128k-online",
        messages: [
          { role: "system", content: "Provide concise, technical answers focused on server administration, DevOps, and VPS management." },
          { role: "user", content: query }
        ],
        max_tokens: 1500,
        temperature: 0.2,
      }),
    });
    
    if (!response.ok) {
      return { answer: "", citations: [] };
    }
    
    const data = await response.json();
    return {
      answer: data.choices?.[0]?.message?.content || "",
      citations: data.citations || [],
    };
  } catch {
    return { answer: "", citations: [] };
  }
}

// Encryption for credentials using AES-256-GCM
const ENCRYPTION_KEY = process.env.SESSION_SECRET;
if (!ENCRYPTION_KEY) {
  console.error("WARNING: SESSION_SECRET environment variable is not set. Using insecure default for development only.");
}
const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const key = ENCRYPTION_KEY || "insecure-dev-key-do-not-use-in-production";
  return scryptSync(key, "vps-agent-salt", 32);
}

function encryptCredential(credential: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(credential, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag();
  
  // Store IV + authTag + encrypted data
  return iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted;
}

function decryptCredential(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(":");
  
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted credential format");
  }
  
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encryptedData = parts[2];
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // WebSocket server for real-time communication
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  
  wss.on("connection", (ws: WebSocket) => {
    console.log("WebSocket client connected");
    
    ws.on("message", (message: string) => {
      try {
        const data = JSON.parse(message.toString());
        console.log("WebSocket message:", data);
      } catch (e) {
        console.error("Invalid WebSocket message");
      }
    });
    
    ws.on("close", () => {
      console.log("WebSocket client disconnected");
    });
  });

  // Auth routes
  app.get("/api/auth/status", (req, res) => {
    const sessionId = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.sessionId;
    const session = sessions.get(sessionId);
    
    if (session && session.expiresAt > new Date()) {
      return res.json({ authenticated: true, email: session.email });
    }
    return res.json({ authenticated: false });
  });

  app.post("/api/auth/send-otp", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email is required" });
      }

      // Generate 6-digit OTP
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Create or get user
      let user = await storage.getUserByEmail(email);
      if (!user) {
        user = await storage.createUser({ email });
      }

      // Store OTP
      await storage.createOtpCode({
        email,
        code,
        expiresAt,
      });

      // In production, send via n8n webhook
      // For now, log the code (you can see it in server logs for testing)
      console.log(`OTP for ${email}: ${code}`);

      // If N8N_WEBHOOK_URL is set, send the OTP via webhook
      if (process.env.N8N_WEBHOOK_URL) {
        try {
          const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #fafafa; padding: 40px; }
    .container { max-width: 480px; margin: 0 auto; background: #171717; border-radius: 8px; padding: 32px; }
    .logo { font-size: 24px; font-weight: 600; margin-bottom: 24px; color: #fafafa; }
    .code { font-size: 32px; font-weight: 700; letter-spacing: 8px; background: #262626; padding: 16px 24px; border-radius: 6px; text-align: center; margin: 24px 0; color: #fafafa; }
    .text { color: #a1a1aa; line-height: 1.6; }
    .footer { margin-top: 32px; font-size: 12px; color: #71717a; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">VPS Agent</div>
    <p class="text">Your verification code is:</p>
    <div class="code">${code}</div>
    <p class="text">This code expires in 10 minutes. If you didn't request this code, you can safely ignore this email.</p>
    <div class="footer">VPS Agent - AI-Powered Server Management</div>
  </div>
</body>
</html>`;
          await fetch(process.env.N8N_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              email, 
              code, 
              type: "otp", 
              subject: "Your VPS Agent Verification Code",
              email_html: emailHtml 
            }),
          });
        } catch (webhookError) {
          console.error("Failed to send OTP via webhook:", webhookError);
        }
      }

      res.json({ success: true, message: "OTP sent" });
    } catch (error) {
      console.error("Error sending OTP:", error);
      res.status(500).json({ error: "Failed to send OTP" });
    }
  });

  app.post("/api/auth/verify-otp", async (req, res) => {
    try {
      const { email, code } = req.body;
      
      if (!email || !code) {
        return res.status(400).json({ error: "Email and code are required" });
      }

      const otpCode = await storage.getValidOtpCode(email, code);
      
      if (!otpCode) {
        return res.status(400).json({ error: "Invalid or expired code" });
      }

      // Mark OTP as used
      await storage.markOtpCodeUsed(otpCode.id);

      // Get or create user
      let user = await storage.getUserByEmail(email);
      if (!user) {
        user = await storage.createUser({ email });
      }

      // Update user as verified
      await storage.updateUser(user.id, { isVerified: true });

      // Create session
      const sessionId = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      
      sessions.set(sessionId, {
        email,
        userId: user.id,
        expiresAt,
      });

      res.cookie("sessionId", sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        expires: expiresAt,
      });

      res.json({ success: true, sessionId });
    } catch (error) {
      console.error("Error verifying OTP:", error);
      res.status(500).json({ error: "Failed to verify OTP" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    const sessionId = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.sessionId;
    if (sessionId) {
      sessions.delete(sessionId);
    }
    res.clearCookie("sessionId");
    res.json({ success: true });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  // VPS Servers routes
  app.get("/api/vps-servers", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const servers = await storage.getVpsServers(userId);
      res.json(servers);
    } catch (error) {
      res.status(500).json({ error: "Failed to get servers" });
    }
  });

  app.post("/api/vps-servers", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { name, host, port, username, authMethod, credential } = req.body;

      if (!name || !host || !username || !authMethod || !credential) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const server = await storage.createVpsServer({
        userId,
        name,
        host,
        port: port || 22,
        username,
        authMethod,
        encryptedCredential: encryptCredential(credential),
      });

      res.json(server);
    } catch (error) {
      console.error("Error creating server:", error);
      res.status(500).json({ error: "Failed to create server" });
    }
  });

  app.patch("/api/vps-servers/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = { ...req.body };
      
      if (updates.credential) {
        updates.encryptedCredential = encryptCredential(updates.credential);
        delete updates.credential;
      }

      const server = await storage.updateVpsServer(id, updates);
      res.json(server);
    } catch (error) {
      res.status(500).json({ error: "Failed to update server" });
    }
  });

  app.delete("/api/vps-servers/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteVpsServer(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete server" });
    }
  });

  app.post("/api/vps-servers/:id/test", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const server = await storage.getVpsServer(id);
      
      if (!server) {
        return res.status(404).json({ error: "Server not found" });
      }

      // Test SSH connection
      const conn = new SSHClient();
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          conn.end();
          reject(new Error("Connection timeout"));
        }, 10000);

        conn.on("ready", async () => {
          clearTimeout(timeout);
          await storage.updateVpsServer(id, { lastConnected: new Date() });
          conn.end();
          resolve();
        });

        conn.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });

        const decryptedCredential = decryptCredential(server.encryptedCredential);
        
        conn.connect({
          host: server.host,
          port: server.port ?? 22,
          username: server.username,
          password: server.authMethod === "password" ? decryptedCredential : undefined,
          privateKey: server.authMethod === "key" ? decryptedCredential : undefined,
        });
      });
      
      res.json({ success: true, message: "Connection successful" });
    } catch (error: any) {
      console.error("Connection test failed:", error);
      res.status(500).json({ error: error.message || "Connection test failed" });
    }
  });

  // Execute SSH command with streaming
  app.post("/api/vps-servers/:id/execute", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { command } = req.body;
      const userId = (req as any).userId;

      if (!command) {
        return res.status(400).json({ error: "Command is required" });
      }

      const server = await storage.getVpsServer(id);
      if (!server) {
        return res.status(404).json({ error: "Server not found" });
      }

      // Set up SSE for streaming output
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const conn = new SSHClient();
      
      conn.on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
            res.end();
            conn.end();
            return;
          }

          let accumulatedOutput = "";

          stream.on("close", async (code: number) => {
            // Save command execution record with accumulated output
            await storage.createCommandHistory({
              userId,
              vpsServerId: id,
              command,
              output: accumulatedOutput,
              exitCode: code,
            });
            
            res.write(`data: ${JSON.stringify({ done: true, exitCode: code })}\n\n`);
            res.end();
            conn.end();
          });

          stream.on("data", (data: Buffer) => {
            const text = data.toString();
            accumulatedOutput += text;
            res.write(`data: ${JSON.stringify({ stdout: text })}\n\n`);
          });

          stream.stderr.on("data", (data: Buffer) => {
            const text = data.toString();
            accumulatedOutput += `\n[STDERR]\n${text}`;
            res.write(`data: ${JSON.stringify({ stderr: text })}\n\n`);
          });
        });
      });

      conn.on("error", (err) => {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      });

      const decryptedCredential = decryptCredential(server.encryptedCredential);
      
      conn.connect({
        host: server.host,
        port: server.port ?? 22,
        username: server.username,
        password: server.authMethod === "password" ? decryptedCredential : undefined,
        privateKey: server.authMethod === "key" ? decryptedCredential : undefined,
      });
    } catch (error: any) {
      console.error("Command execution failed:", error);
      res.status(500).json({ error: error.message || "Command execution failed" });
    }
  });

  // File upload endpoint for chat attachments
  app.post("/api/upload", requireAuth, upload.array("files", 5), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const processedFiles: Array<{
        name: string;
        type: string;
        size: number;
        content?: string;
        base64?: string;
        mediaType?: string;
      }> = [];

      for (const file of files) {
        const fileInfo: any = {
          name: file.originalname,
          type: file.mimetype,
          size: file.size,
        };

        // Process based on file type
        if (file.mimetype.startsWith("image/")) {
          // Images: convert to base64 for Claude vision
          fileInfo.base64 = file.buffer.toString("base64");
          fileInfo.mediaType = file.mimetype;
        } else if (file.mimetype === "application/pdf") {
          // PDF: extract text
          try {
            const text = await parsePdf(file.buffer);
            fileInfo.content = text.slice(0, 50000); // Limit to ~50k chars
          } catch (e) {
            fileInfo.content = "[PDF parsing failed - file may be scanned/image-based]";
          }
        } else if (file.mimetype.startsWith("text/") || file.mimetype === "application/json") {
          // Text files: read as string
          fileInfo.content = file.buffer.toString("utf-8").slice(0, 100000);
        }

        processedFiles.push(fileInfo);
      }

      res.json({ files: processedFiles });
    } catch (error: any) {
      console.error("File upload error:", error);
      res.status(500).json({ error: error.message || "Failed to process files" });
    }
  });

  // Conversations routes
  app.get("/api/conversations", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const convos = await storage.getConversations(userId);
      res.json(convos);
    } catch (error) {
      res.status(500).json({ error: "Failed to get conversations" });
    }
  });

  app.get("/api/conversations/active", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      let conversation = await storage.getActiveConversation(userId);
      
      if (!conversation) {
        // Create a new active conversation
        conversation = await storage.createConversation({
          userId,
          title: "New Conversation",
          mode: "chat",
        });
      }
      
      res.json(conversation);
    } catch (error) {
      res.status(500).json({ error: "Failed to get active conversation" });
    }
  });

  app.get("/api/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const msgs = await storage.getMessages(id);
      res.json(msgs);
    } catch (error) {
      res.status(500).json({ error: "Failed to get messages" });
    }
  });

  // Intent detection for unified agent routing
  async function detectIntent(content: string): Promise<{
    mode: "chat" | "debug" | "architect" | "plan" | "test" | "support";
    confidence: number;
  }> {
    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 100,
        system: `You are an intent classifier. Analyze the user message and respond with ONLY a JSON object (no markdown, no explanation):
{"mode": "<mode>", "confidence": <0.0-1.0>}

Modes:
- "debug": User is troubleshooting an error, issue, or problem (e.g., "502 error", "service not starting", "can't connect")
- "architect": User wants infrastructure analysis, optimization, or design recommendations (e.g., "review my setup", "how should I structure", "best practices")
- "plan": User wants to implement something new and needs a step-by-step plan (e.g., "set up Docker", "deploy application", "configure nginx")
- "test": User wants to run tests or verify something works (e.g., "test my API", "verify deployment", "run checks")
- "support": User needs general help, has questions about the platform, or is confused (e.g., "how does this work", "help me understand")
- "chat": General server commands, quick tasks, or direct instructions (e.g., "show disk usage", "restart nginx", "install package")

Be decisive. Choose the most specific applicable mode.`,
        messages: [{ role: "user", content }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const parsed = JSON.parse(text);
      return {
        mode: parsed.mode || "chat",
        confidence: parsed.confidence || 0.5,
      };
    } catch {
      return { mode: "chat", confidence: 0.5 };
    }
  }

  // Build specialist system prompt based on detected mode
  function buildSystemPrompt(
    mode: string,
    serverContext: string,
    commandContext: string
  ): string {
    const baseContext = `${serverContext}\n\n${commandContext}`;

    switch (mode) {
      case "debug":
        return `You are an expert DevOps Debugging Agent. A specialist has been activated to help diagnose this issue.

${baseContext}

**DEBUGGING METHODOLOGY:**
1. Gather Information - Ask clarifying questions if needed
2. Form Hypotheses - Identify likely root causes based on symptoms
3. Systematic Investigation - Provide diagnostic commands in order of likelihood
4. Root Cause Analysis - Explain what's happening and why
5. Solution - Provide clear, step-by-step fix with verification

**DIAGNOSTIC AREAS:**
- Service status and logs (systemctl, journalctl)
- Resource usage (top, htop, df, free, iotop)
- Network issues (netstat, ss, ping, curl, dig)
- Permission problems (ls -la, chmod, chown)
- Configuration errors (nginx, apache, docker configs)
- Database connections and queries
- SSL/TLS certificate issues
- Docker container health

**FORMAT:** Use clear sections, provide exact commands to run, explain what each reveals.
Start with: "🔍 **Debug Mode Activated**" then dive into diagnosis.`;

      case "architect":
        return `You are an expert Server Architecture Agent. A specialist has been activated to analyze infrastructure.

${baseContext}

**ARCHITECTURE ANALYSIS CAPABILITIES:**
1. Infrastructure Analysis - Evaluate current setup, identify improvements
2. Scalability Planning - Design for growth and high availability
3. Security Audit - Identify vulnerabilities and hardening opportunities
4. Performance Optimization - Find bottlenecks and optimization opportunities
5. Best Practices - Recommend industry-standard configurations

**ANALYSIS STRUCTURE:**
## Current State Assessment
## Strengths
## Areas for Improvement (prioritized by impact)
## Recommendations (specific, actionable with commands)
## Architecture Diagram (text-based if helpful)

Start with: "🏗️ **Architecture Mode Activated**" then provide strategic analysis.`;

      case "plan":
        return `You are an expert DevOps Planning Agent. A specialist has been activated to create an implementation plan.

${baseContext}

**PLANNING METHODOLOGY:**
1. Understand Requirements - Clarify what needs to be achieved
2. Assess Current State - What's already in place
3. Identify Dependencies - What needs to be installed/configured first
4. Create Phased Plan - Break down into sequential steps
5. Risk Assessment - What could go wrong and how to mitigate

**PLAN STRUCTURE:**
## Overview
Brief description of what we're implementing

## Prerequisites
What needs to be in place before starting

## Implementation Steps
Numbered steps with exact commands, explanations, and verification

## Verification
How to confirm everything is working

## Rollback Plan
How to undo changes if needed

Start with: "📋 **Planning Mode Activated**" then create the detailed plan.`;

      case "test":
        return `You are an expert Testing Agent. A specialist has been activated to help with testing and verification.

${baseContext}

**TESTING CAPABILITIES:**
1. Generate test commands for APIs, services, and deployments
2. Create verification scripts
3. Design test scenarios
4. Analyze test results
5. Suggest automated testing approaches

**TESTING AREAS:**
- API endpoint testing (curl, wget, httpie)
- Service health checks
- Load testing approaches
- Security scanning
- Configuration validation
- Integration testing

Start with: "🧪 **Testing Mode Activated**" then help with testing.`;

      case "support":
        return `You are a helpful Support Agent for the VPS Agent platform.

${baseContext}

**SUPPORT CAPABILITIES:**
1. Explain how features work
2. Guide through common workflows
3. Troubleshoot platform issues
4. Provide best practice guidance
5. Help with getting started

Be patient, clear, and helpful. Use simple language. Guide the user step by step.

Start with: "💬 **Support Mode Activated**" then provide helpful guidance.`;

      default: // chat mode
        return `You are VPS Agent, an AI assistant that helps users manage their VPS servers through natural language commands.

${baseContext}

**CAPABILITIES:**
1. Generate SSH commands to execute on the user's VPS
2. Explain what commands will do before executing them
3. Provide troubleshooting help for server issues
4. Help install and configure software (Docker, databases, web servers, etc.)
5. Monitor and analyze server resources

**GUIDELINES:**
- Explain what you're going to do
- Show the command(s) you would execute
- Ask for confirmation if the command is destructive
- Be helpful, clear, and safety-conscious

Format responses with markdown. For quick commands, be concise.`;
    }
  }

  // Chat endpoint with streaming, unified agent routing, extended context, thinking mode, and file attachments
  app.post("/api/chat", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { content, conversationId, forceMode, enableResearch, enableThinking, customAgentId, model, attachments } = req.body;
      
      // Validate model selection (default to Sonnet)
      const validModels = ["claude-sonnet-4-20250514", "claude-opus-4-20250514"];
      const selectedModel = validModels.includes(model) ? model : "claude-sonnet-4-20250514";

      if (!content) {
        return res.status(400).json({ error: "Content is required" });
      }

      // Get or create conversation
      let conversation;
      if (conversationId) {
        conversation = await storage.getConversation(conversationId);
      }
      if (!conversation) {
        conversation = await storage.createConversation({
          userId,
          title: content.slice(0, 50),
          mode: "chat",
        });
      }

      // Save user message
      await storage.createMessage({
        conversationId: conversation.id,
        role: "user",
        content,
      });

      // Get conversation history for context
      const history = await storage.getMessages(conversation.id);
      
      // Get user's VPS servers for context
      const servers = await storage.getVpsServers(userId);
      const serverContext = servers.length > 0 
        ? `Connected VPS servers:\n${servers.map(s => `- ${s.name}: ${s.host}:${s.port ?? 22} (${s.username})`).join("\n")}`
        : "No VPS servers connected yet.";

      // Get recent command history
      const cmdHistory = await storage.getCommandHistory(userId);
      const recentCommands = cmdHistory.slice(0, 10);
      const commandContext = recentCommands.length > 0
        ? `Recent commands:\n${recentCommands.map(c => `- ${c.command} (exit: ${c.exitCode})`).join("\n")}`
        : "";

      // Validate and detect intent or use forced mode
      const validModes = ["chat", "debug", "architect", "plan", "test", "support"];
      let detectedMode: string;
      let confidence: number;
      
      if (forceMode && validModes.includes(forceMode)) {
        detectedMode = forceMode;
        confidence = 1.0;
      } else {
        try {
          const intent = await detectIntent(content);
          detectedMode = validModes.includes(intent.mode) ? intent.mode : "chat";
          confidence = intent.confidence;
        } catch {
          detectedMode = "chat";
          confidence = 0.5;
        }
      }

      // Check for custom agent prompt
      let systemPrompt: string;
      if (customAgentId) {
        const customAgent = await storage.getCustomAgent(customAgentId);
        if (customAgent && customAgent.userId === userId) {
          systemPrompt = customAgent.systemPrompt + `\n\n${serverContext}\n${commandContext}`;
        } else {
          systemPrompt = buildSystemPrompt(detectedMode, serverContext, commandContext);
        }
      } else {
        systemPrompt = buildSystemPrompt(detectedMode, serverContext, commandContext);
      }

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Send the detected mode and features to frontend immediately
      res.write(`data: ${JSON.stringify({ 
        mode: detectedMode, 
        confidence,
        features: { research: !!enableResearch, thinking: !!enableThinking }
      })}\n\n`);

      // Build extended context with memory management
      const rawMessages = history.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      
      const { messages: extendedMessages, contextInfo } = await buildExtendedContext(
        conversation.id,
        rawMessages
      );

      // Send context info if available
      if (contextInfo) {
        res.write(`data: ${JSON.stringify({ contextInfo })}\n\n`);
      }

      // Perform web research if enabled
      let researchContext = "";
      if (enableResearch) {
        res.write(`data: ${JSON.stringify({ status: "researching" })}\n\n`);
        const research = await performWebResearch(content);
        if (research.answer) {
          researchContext = `\n\n**Research Results:**\n${research.answer}`;
          if (research.citations.length > 0) {
            researchContext += `\n\nSources:\n${research.citations.map((c, i) => `${i + 1}. ${c}`).join("\n")}`;
          }
          res.write(`data: ${JSON.stringify({ research: { found: true, citations: research.citations.length } })}\n\n`);
        }
      }

      // Build messages for Claude with extended context
      const claudeMessages: any[] = extendedMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      // If there are attachments, modify the last user message to include them
      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        const lastUserMessageIndex = claudeMessages.length - 1;
        if (lastUserMessageIndex >= 0 && claudeMessages[lastUserMessageIndex].role === "user") {
          const messageContent: Array<{ type: string; text?: string; source?: any }> = [];
          
          // Add text content first
          const textContent = claudeMessages[lastUserMessageIndex].content;
          if (typeof textContent === "string" && textContent.trim()) {
            messageContent.push({ type: "text", text: textContent });
          }
          
          // Add file attachments
          for (const attachment of attachments) {
            if (attachment.base64 && attachment.mediaType) {
              // Image attachment - use Claude vision
              messageContent.push({
                type: "image",
                source: {
                  type: "base64",
                  media_type: attachment.mediaType,
                  data: attachment.base64,
                }
              });
            } else if (attachment.content) {
              // Text/PDF content - add as text
              messageContent.push({
                type: "text",
                text: `\n\n--- Attached File: ${attachment.name} ---\n${attachment.content}\n--- End of ${attachment.name} ---`
              });
            }
          }
          
          claudeMessages[lastUserMessageIndex].content = messageContent;
        }
      }

      // Add research context to system prompt if available
      const finalSystemPrompt = researchContext 
        ? systemPrompt + researchContext
        : systemPrompt;

      try {
        // Enable extended thinking for complex modes
        const useThinking = enableThinking || ["architect", "debug", "plan"].includes(detectedMode);
        
        let fullContent = "";
        let thinkingContent = "";

        if (useThinking) {
          res.write(`data: ${JSON.stringify({ status: "thinking" })}\n\n`);
          
          // Use extended thinking with streaming
          const stream = await anthropic.messages.stream({
            model: selectedModel,
            max_tokens: 16000,
            thinking: {
              type: "enabled",
              budget_tokens: 5000,
            },
            system: finalSystemPrompt,
            messages: claudeMessages,
          });

          for await (const event of stream) {
            if (event.type === "content_block_delta") {
              if (event.delta.type === "thinking_delta") {
                thinkingContent += event.delta.thinking;
                res.write(`data: ${JSON.stringify({ thinking: event.delta.thinking })}\n\n`);
              } else if (event.delta.type === "text_delta") {
                fullContent += event.delta.text;
                res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
              }
            }
          }
        } else {
          // Standard streaming without thinking
          const stream = await anthropic.messages.stream({
            model: selectedModel,
            max_tokens: 8192,
            system: finalSystemPrompt,
            messages: claudeMessages,
          });

          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              const text = event.delta.text;
              fullContent += text;
              res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
            }
          }
        }

        // Save assistant message with detected mode and thinking
        await storage.createMessage({
          conversationId: conversation.id,
          role: "assistant",
          content: fullContent,
          metadata: JSON.stringify({ 
            mode: detectedMode, 
            confidence,
            thinking: thinkingContent ? true : false,
            research: !!enableResearch,
          }),
        });

        // Track API usage (estimate tokens)
        const getMessageText = (content: any): string => {
          if (typeof content === 'string') return content;
          if (Array.isArray(content)) {
            return content.map(c => {
              if (typeof c === 'string') return c;
              if (c.type === 'text') return c.text || '';
              if (c.type === 'tool_use') return JSON.stringify(c.input || {});
              if (c.type === 'tool_result') return typeof c.content === 'string' ? c.content : JSON.stringify(c.content || '');
              return JSON.stringify(c);
            }).join(' ');
          }
          return JSON.stringify(content);
        };
        const inputTokens = claudeMessages.reduce((sum, m) => sum + estimateTokens(getMessageText(m.content)), 0) + estimateTokens(finalSystemPrompt);
        const outputTokens = estimateTokens(fullContent);
        const totalTokens = inputTokens + outputTokens;
        // Pricing: Sonnet $3/1M input, $15/1M output; Opus $15/1M input, $75/1M output
        const isOpus = selectedModel.includes("opus");
        const inputRate = isOpus ? 0.000015 : 0.000003;
        const outputRate = isOpus ? 0.000075 : 0.000015;
        const estimatedCost = (inputTokens * inputRate) + (outputTokens * outputRate);
        
        try {
          await storage.createApiUsage({
            userId,
            conversationId: conversation.id,
            model: selectedModel,
            inputTokens,
            outputTokens,
            totalTokens,
            estimatedCost: estimatedCost.toFixed(6),
          });
        } catch (usageError) {
          console.error("Failed to track usage:", usageError);
        }

        res.write(`data: ${JSON.stringify({ done: true, mode: detectedMode })}\n\n`);
        res.end();
      } catch (aiError) {
        console.error("AI error:", aiError);
        res.write(`data: ${JSON.stringify({ error: "AI processing failed" })}\n\n`);
        res.end();
      }
    } catch (error) {
      console.error("Chat error:", error);
      res.status(500).json({ error: "Failed to process message" });
    }
  });

  // Custom Agents CRUD endpoints
  app.get("/api/custom-agents", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const agents = await storage.getCustomAgents(userId);
      res.json(agents);
    } catch (error) {
      console.error("Error fetching custom agents:", error);
      res.status(500).json({ error: "Failed to fetch custom agents" });
    }
  });

  app.post("/api/custom-agents", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { name, description, systemPrompt, isDefault } = req.body;

      if (!name || !systemPrompt) {
        return res.status(400).json({ error: "Name and system prompt are required" });
      }

      // If setting as default, clear other defaults
      if (isDefault) {
        const existingAgents = await storage.getCustomAgents(userId);
        for (const agent of existingAgents) {
          if (agent.isDefault) {
            await storage.updateCustomAgent(agent.id, { isDefault: false });
          }
        }
      }

      const agent = await storage.createCustomAgent({
        userId,
        name,
        description,
        systemPrompt,
        isDefault: isDefault || false,
      });

      res.json(agent);
    } catch (error) {
      console.error("Error creating custom agent:", error);
      res.status(500).json({ error: "Failed to create custom agent" });
    }
  });

  app.put("/api/custom-agents/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { id } = req.params;
      const { name, description, systemPrompt, isDefault } = req.body;

      const existing = await storage.getCustomAgent(id);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ error: "Custom agent not found" });
      }

      // If setting as default, clear other defaults
      if (isDefault && !existing.isDefault) {
        const existingAgents = await storage.getCustomAgents(userId);
        for (const agent of existingAgents) {
          if (agent.isDefault && agent.id !== id) {
            await storage.updateCustomAgent(agent.id, { isDefault: false });
          }
        }
      }

      const agent = await storage.updateCustomAgent(id, {
        name,
        description,
        systemPrompt,
        isDefault,
      });

      res.json(agent);
    } catch (error) {
      console.error("Error updating custom agent:", error);
      res.status(500).json({ error: "Failed to update custom agent" });
    }
  });

  app.delete("/api/custom-agents/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { id } = req.params;

      const existing = await storage.getCustomAgent(id);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ error: "Custom agent not found" });
      }

      await storage.deleteCustomAgent(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting custom agent:", error);
      res.status(500).json({ error: "Failed to delete custom agent" });
    }
  });

  // Conversation memory info endpoint
  app.get("/api/conversations/:id/memory", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const conversation = await storage.getConversation(id);
      
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const messageCount = await storage.getMessageCount(id);
      const summaries = await storage.getConversationSummaries(id);
      const totalTokens = summaries.reduce((sum, s) => sum + (s.tokenCount || 0), 0);

      res.json({
        messageCount,
        summaryCount: summaries.length,
        estimatedTokens: totalTokens,
        memoryStatus: messageCount > SUMMARY_THRESHOLD ? "compressed" : "full",
      });
    } catch (error) {
      console.error("Error fetching memory info:", error);
      res.status(500).json({ error: "Failed to fetch memory info" });
    }
  });

  // Support endpoint with streaming
  app.post("/api/support", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { content } = req.body;

      if (!content) {
        return res.status(400).json({ error: "Content is required" });
      }

      // Get user's VPS servers for context
      const servers = await storage.getVpsServers(userId);
      const serverContext = servers.length > 0 
        ? `User's VPS servers: ${servers.map(s => `${s.name} (${s.host})`).join(", ")}`
        : "No VPS servers connected.";

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const systemPrompt = `You are a VPS Support Agent specializing in troubleshooting server issues.

${serverContext}

Your role:
1. Diagnose server problems based on user descriptions
2. Provide step-by-step troubleshooting guides
3. Suggest commands to run for diagnosis
4. Explain solutions in clear, non-technical terms when possible

When responding:
1. First acknowledge the issue
2. Provide a structured troubleshooting plan with numbered steps
3. For each step, include the command to run if applicable
4. Explain what each command does

Format your response with clear headings and steps. Be thorough but concise.`;

      try {
        const stream = await anthropic.messages.stream({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: "user", content }],
        });

        let fullContent = "";

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const text = event.delta.text;
            fullContent += text;
            res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
          }
        }

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } catch (aiError) {
        console.error("AI error:", aiError);
        res.write(`data: ${JSON.stringify({ error: "AI processing failed" })}\n\n`);
        res.end();
      }
    } catch (error) {
      console.error("Support error:", error);
      res.status(500).json({ error: "Failed to process support request" });
    }
  });

  // Architect & Debug endpoint with streaming
  app.post("/api/architect", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { content, mode } = req.body; // mode: 'architect' | 'debug' | 'plan'

      if (!content) {
        return res.status(400).json({ error: "Content is required" });
      }

      // Get user's VPS servers for context
      const servers = await storage.getVpsServers(userId);
      const serverContext = servers.length > 0 
        ? `User's VPS servers:\n${servers.map(s => `- ${s.name}: ${s.host}:${s.port ?? 22} (${s.username})`).join("\n")}`
        : "No VPS servers connected yet.";

      // Get recent command history for context
      const commandHistory = await storage.getCommandHistory(userId);
      const recentCommands = commandHistory.slice(0, 10);
      const commandContext = recentCommands.length > 0
        ? `Recent commands executed:\n${recentCommands.map(c => `- ${c.command} (exit: ${c.exitCode})`).join("\n")}`
        : "No recent command history.";

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let systemPrompt = "";

      if (mode === "debug") {
        systemPrompt = `You are an expert DevOps Debugging Agent specializing in diagnosing and resolving server issues.

${serverContext}

${commandContext}

Your debugging methodology:
1. **Gather Information**: Ask clarifying questions to understand the issue
2. **Form Hypotheses**: Based on symptoms, identify likely root causes
3. **Systematic Investigation**: Provide diagnostic commands in order of likelihood
4. **Root Cause Analysis**: Explain what's happening and why
5. **Solution**: Provide clear, step-by-step fix with verification

When debugging:
- Start with the most likely causes first
- Provide commands to gather diagnostic information
- Explain what each command reveals
- Consider resource constraints (CPU, memory, disk, network)
- Check logs, processes, connections, and configurations
- Always verify the fix worked

Common areas to investigate:
- Service status and logs (systemctl, journalctl)
- Resource usage (top, htop, df, free)
- Network issues (netstat, ss, ping, curl)
- Permission problems (ls -la, chmod, chown)
- Configuration errors (nginx, apache, docker)
- Database connections and queries
- SSL/TLS certificate issues

Format your response with clear sections and actionable commands.`;
      } else if (mode === "plan") {
        systemPrompt = `You are an expert DevOps Planning Agent that creates detailed implementation plans.

${serverContext}

Your planning methodology:
1. **Understand Requirements**: Clarify what needs to be achieved
2. **Assess Current State**: What's already in place
3. **Identify Dependencies**: What needs to be installed/configured first
4. **Create Phased Plan**: Break down into sequential steps
5. **Risk Assessment**: What could go wrong and how to mitigate

When creating plans:
- Number each step clearly
- Include the exact commands to run
- Explain what each step accomplishes
- Note any prerequisites or dependencies
- Include verification steps after each major action
- Consider rollback procedures for critical changes

Plan structure:
## Overview
Brief description of what we're implementing

## Prerequisites
What needs to be in place before starting

## Implementation Steps
Numbered, detailed steps with commands

## Verification
How to confirm everything is working

## Rollback Plan
How to undo changes if needed

Be thorough, precise, and safety-conscious.`;
      } else {
        // Default: architect mode
        systemPrompt = `You are an expert Server Architecture Agent that analyzes infrastructure and provides strategic recommendations.

${serverContext}

${commandContext}

Your architecture capabilities:
1. **Infrastructure Analysis**: Evaluate current server setup and identify improvements
2. **Scalability Planning**: Design for growth and high availability
3. **Security Audit**: Identify vulnerabilities and hardening opportunities
4. **Performance Optimization**: Find bottlenecks and optimization opportunities
5. **Best Practices**: Recommend industry-standard configurations

When analyzing architecture:
- Consider the current workload and future growth
- Evaluate security posture (firewall, SSH, updates, backups)
- Assess monitoring and logging setup
- Review backup and disaster recovery plans
- Identify single points of failure
- Suggest containerization opportunities (Docker, Kubernetes)
- Recommend automation (CI/CD, infrastructure as code)

Analysis structure:
## Current State Assessment
What you observe about the current setup

## Strengths
What's working well

## Areas for Improvement
What could be better, prioritized by impact

## Recommendations
Specific, actionable improvements with commands/configurations

## Architecture Diagram (text-based)
Visual representation of proposed architecture

Be strategic, thorough, and provide actionable insights.`;
      }

      try {
        const stream = await anthropic.messages.stream({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{ role: "user", content }],
        });

        let fullContent = "";

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const text = event.delta.text;
            fullContent += text;
            res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
          }
        }

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } catch (aiError) {
        console.error("AI error:", aiError);
        res.write(`data: ${JSON.stringify({ error: "AI processing failed" })}\n\n`);
        res.end();
      }
    } catch (error) {
      console.error("Architect error:", error);
      res.status(500).json({ error: "Failed to process architect request" });
    }
  });

  // Test runs routes
  app.get("/api/test-runs", requireAuth, async (req, res) => {
    try {
      const runs = await storage.getTestRuns();
      
      // Get steps for each run
      const runsWithSteps = await Promise.all(
        runs.map(async (run) => {
          const steps = await storage.getTestSteps(run.id);
          return { ...run, testSteps: steps };
        })
      );
      
      res.json(runsWithSteps);
    } catch (error) {
      res.status(500).json({ error: "Failed to get test runs" });
    }
  });

  app.post("/api/test-runs", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { description } = req.body;

      if (!description) {
        return res.status(400).json({ error: "Description is required" });
      }

      // Get user's active server
      const servers = await storage.getVpsServers(userId);
      if (servers.length === 0) {
        return res.status(400).json({ error: "No VPS server connected" });
      }

      // Get or create conversation
      let conversation = await storage.getActiveConversation(userId);
      if (!conversation) {
        conversation = await storage.createConversation({
          userId,
          title: "Test Run",
          mode: "testing",
        });
      }

      // Create test run
      const testRun = await storage.createTestRun({
        conversationId: conversation.id,
        vpsServerId: servers[0].id,
        name: description.slice(0, 100),
        totalSteps: 3,
      });

      // Generate test steps using AI
      const testSteps = [
        { name: "Check server connectivity", description: "Verify SSH connection" },
        { name: "Validate configuration", description: "Check system requirements" },
        { name: "Run health checks", description: "Verify services are running" },
      ];

      for (let i = 0; i < testSteps.length; i++) {
        await storage.createTestStep({
          testRunId: testRun.id,
          stepNumber: i + 1,
          name: testSteps[i].name,
          description: testSteps[i].description,
        });
      }

      // Update test run status
      await storage.updateTestRun(testRun.id, {
        status: "running",
        startedAt: new Date(),
      });

      res.json(testRun);
    } catch (error) {
      console.error("Error creating test run:", error);
      res.status(500).json({ error: "Failed to create test run" });
    }
  });

  // GitHub integration routes
  app.get("/api/github/integration", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const integration = await storage.getGithubIntegration(userId);
      res.json(integration || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to get GitHub integration" });
    }
  });

  app.post("/api/github/connect", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { accessToken, repositoryUrl, branch } = req.body;

      if (!accessToken || !repositoryUrl) {
        return res.status(400).json({ error: "Access token and repository URL are required" });
      }

      // Check if already connected
      const existing = await storage.getGithubIntegration(userId);
      if (existing) {
        await storage.updateGithubIntegration(existing.id, {
          accessToken,
          repositoryUrl,
          branch: branch || "main",
        });
        return res.json(existing);
      }

      const integration = await storage.createGithubIntegration({
        userId,
        accessToken,
        repositoryUrl,
        branch: branch || "main",
      });

      res.json(integration);
    } catch (error) {
      res.status(500).json({ error: "Failed to connect GitHub" });
    }
  });

  app.delete("/api/github/disconnect", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      await storage.deleteGithubIntegration(userId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to disconnect GitHub" });
    }
  });

  app.post("/api/github/sync", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const integration = await storage.getGithubIntegration(userId);
      
      if (!integration) {
        return res.status(400).json({ error: "GitHub not connected" });
      }

      // In production, actually sync with GitHub
      await storage.updateGithubIntegration(integration.id, {
        lastSync: new Date(),
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to sync with GitHub" });
    }
  });

  app.post("/api/github/fork", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const integration = await storage.getGithubIntegration(userId);
      
      if (!integration) {
        return res.status(400).json({ error: "GitHub not connected" });
      }

      // In production, create a fork/branch on GitHub
      res.json({ success: true, message: "Fork created" });
    } catch (error) {
      res.status(500).json({ error: "Failed to create fork" });
    }
  });

  app.get("/api/github/commits", requireAuth, async (req, res) => {
    try {
      // In production, fetch actual commits from GitHub
      res.json([]);
    } catch (error) {
      res.status(500).json({ error: "Failed to get commits" });
    }
  });

  // Settings routes
  app.patch("/api/settings/webhook", requireAuth, async (req, res) => {
    try {
      const { webhookUrl } = req.body;
      // In production, save webhook URL to user settings
      process.env.N8N_WEBHOOK_URL = webhookUrl;
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update webhook" });
    }
  });

  // Archive conversation to GitHub
  app.post("/api/conversations/:id/archive", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const conversationId = req.params.id;
      
      const conversation = await storage.getConversation(conversationId);
      if (!conversation || conversation.userId !== userId) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const integration = await storage.getGithubIntegration(userId);
      if (!integration || !integration.accessToken) {
        return res.status(400).json({ error: "GitHub not connected. Please connect GitHub first." });
      }

      const messages = await storage.getMessages(conversationId);
      const summaries = await storage.getConversationSummaries(conversationId);
      
      // Generate markdown content
      const markdownContent = generateConversationMarkdown(conversation, messages, summaries);
      
      // Create filename with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `conversations/${conversation.title.replace(/[^a-zA-Z0-9]/g, '-')}-${timestamp}.md`;
      
      // Upload to GitHub
      const repoUrl = integration.repositoryUrl || '';
      const [owner, repo] = parseGitHubUrl(repoUrl);
      
      if (!owner || !repo) {
        return res.status(400).json({ error: "Invalid repository URL configured" });
      }

      const fileUrl = await uploadToGitHub(
        integration.accessToken,
        owner,
        repo,
        filename,
        markdownContent,
        integration.branch || 'main'
      );

      // Generate context summary for continuation
      const contextSummary = await generateContextSummary(messages, summaries);

      // Update conversation with archive info
      await storage.archiveConversation(conversationId, fileUrl, contextSummary);

      res.json({ 
        success: true, 
        archiveUrl: fileUrl,
        contextSummary,
        message: "Conversation archived to GitHub" 
      });
    } catch (error) {
      console.error("Archive error:", error);
      res.status(500).json({ error: "Failed to archive conversation" });
    }
  });

  // Fork/continue from archived conversation
  app.post("/api/conversations/:id/fork", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const parentConversationId = req.params.id;
      
      const parentConversation = await storage.getConversation(parentConversationId);
      if (!parentConversation || parentConversation.userId !== userId) {
        return res.status(404).json({ error: "Parent conversation not found" });
      }

      // Get context from parent (either from archive or generate fresh)
      let contextSummary = parentConversation.contextSummary;
      
      if (!contextSummary) {
        const messages = await storage.getMessages(parentConversationId);
        const summaries = await storage.getConversationSummaries(parentConversationId);
        contextSummary = await generateContextSummary(messages, summaries);
      }

      // Create new conversation with parent reference
      const newConversation = await storage.createConversation({
        userId,
        title: `${parentConversation.title} (continued)`,
        mode: parentConversation.mode || 'chat',
        vpsServerId: parentConversation.vpsServerId,
        parentConversationId,
        contextSummary,
      });

      // Add system message with context
      await storage.createMessage({
        conversationId: newConversation.id,
        role: 'system',
        content: `This conversation continues from a previous session. Here's the context summary:\n\n${contextSummary}\n\nThe previous conversation was archived${parentConversation.archiveUrl ? ` at: ${parentConversation.archiveUrl}` : ''}.`,
      });

      res.json({ 
        success: true, 
        conversation: newConversation,
        parentArchiveUrl: parentConversation.archiveUrl 
      });
    } catch (error) {
      console.error("Fork error:", error);
      res.status(500).json({ error: "Failed to fork conversation" });
    }
  });

  // Get conversation chain (history of forks)
  app.get("/api/conversations/:id/chain", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const conversationId = req.params.id;
      
      const chain: any[] = [];
      let currentId: string | null = conversationId;
      
      while (currentId) {
        const conversation = await storage.getConversation(currentId);
        if (!conversation || conversation.userId !== userId) break;
        
        chain.unshift({
          id: conversation.id,
          title: conversation.title,
          archiveUrl: conversation.archiveUrl,
          archivedAt: conversation.archivedAt,
          createdAt: conversation.createdAt,
        });
        
        currentId = conversation.parentConversationId || null;
      }

      res.json(chain);
    } catch (error) {
      res.status(500).json({ error: "Failed to get conversation chain" });
    }
  });

  // API Usage stats endpoint
  app.get("/api/usage", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const stats = await storage.getApiUsageStats(userId);
      const recentUsage = await storage.getApiUsage(userId);
      
      res.json({
        stats,
        recentUsage: recentUsage.slice(0, 20),
      });
    } catch (error) {
      console.error("Usage stats error:", error);
      res.status(500).json({ error: "Failed to get usage stats" });
    }
  });

  return httpServer;
}

// Helper functions for GitHub archiving
function generateConversationMarkdown(
  conversation: any, 
  messages: any[], 
  summaries: any[]
): string {
  const lines = [
    `# ${conversation.title}`,
    '',
    `**Created:** ${conversation.createdAt}`,
    `**Mode:** ${conversation.mode || 'chat'}`,
    `**Archived:** ${new Date().toISOString()}`,
    '',
    '---',
    '',
  ];

  if (summaries.length > 0) {
    lines.push('## Context Summaries', '');
    for (const summary of summaries) {
      lines.push(`### Messages ${summary.messageRange}`, '', summary.summary, '');
    }
    lines.push('---', '');
  }

  lines.push('## Conversation', '');
  
  for (const msg of messages) {
    const roleLabel = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
    lines.push(`### ${roleLabel}`, '');
    lines.push(msg.content, '');
    
    if (msg.commandOutput) {
      lines.push('```', msg.commandOutput, '```', '');
    }
    lines.push('');
  }

  return lines.join('\n');
}

function parseGitHubUrl(url: string): [string | null, string | null] {
  try {
    const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (match) {
      return [match[1], match[2]];
    }
  } catch {}
  return [null, null];
}

async function uploadToGitHub(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  branch: string
): Promise<string> {
  const base64Content = Buffer.from(content).toString('base64');
  
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        message: `Archive conversation: ${path}`,
        content: base64Content,
        branch,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub API error: ${error}`);
  }

  const data = await response.json();
  return data.content?.html_url || `https://github.com/${owner}/${repo}/blob/${branch}/${path}`;
}

async function generateContextSummary(messages: any[], summaries: any[]): Promise<string> {
  const anthropic = new Anthropic();
  
  // Combine existing summaries with recent messages
  let contextParts: string[] = [];
  
  if (summaries.length > 0) {
    contextParts.push("Previous summaries:");
    for (const s of summaries) {
      contextParts.push(s.summary);
    }
  }
  
  // Add last 10 messages for recency
  const recentMessages = messages.slice(-10);
  if (recentMessages.length > 0) {
    contextParts.push("\nRecent conversation:");
    for (const msg of recentMessages) {
      contextParts.push(`${msg.role}: ${msg.content.slice(0, 500)}`);
    }
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: `Create a comprehensive summary of this conversation that can be used to continue the discussion in a new chat. Include key decisions, server configurations, commands run, and any important context. Keep it under 500 words.

${contextParts.join('\n')}`,
    }],
  });

  return (response.content[0] as any).text || "No context available.";
}
