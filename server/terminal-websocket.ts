/**
 * Real-time Terminal WebSocket Handler
 * 
 * Provides interactive SSH terminal sessions with:
 * - Live PTY streaming
 * - AI command suggestions
 * - Command history and auto-complete
 */

import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { Client as SSHClient, ClientChannel } from "ssh2";
import { storage } from "./storage";
import { createDecipheriv, scryptSync } from "crypto";
import Anthropic from "@anthropic-ai/sdk";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "vps-agent-default-key-32chars!!";

function decryptCredential(encrypted: string): string {
  try {
    const [ivHex, authTagHex, encryptedHex] = encrypted.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const encryptedBuffer = Buffer.from(encryptedHex, "hex");
    const key = scryptSync(ENCRYPTION_KEY, "salt", 32);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedBuffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return encrypted;
  }
}

// Active terminal sessions
interface TerminalSession {
  ws: WebSocket;
  sshClient: SSHClient;
  stream: ClientChannel | null;
  serverId: string;
  userId: string;
  commandBuffer: string;
  commandHistory: string[];
  historyIndex: number;
  isConnected: boolean;
}

const activeSessions = new Map<string, TerminalSession>();

// AI client for suggestions
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Common command suggestions based on context
const COMMAND_SUGGESTIONS: Record<string, string[]> = {
  docker: [
    "docker ps -a",
    "docker images",
    "docker logs <container>",
    "docker-compose up -d",
    "docker system prune -af",
  ],
  system: [
    "htop",
    "df -h",
    "free -h",
    "ps aux --sort=-%mem | head",
    "systemctl status",
  ],
  nginx: [
    "nginx -t",
    "systemctl reload nginx",
    "cat /etc/nginx/nginx.conf",
    "ls -la /etc/nginx/sites-enabled/",
  ],
  network: [
    "netstat -tulpn",
    "ss -tulpn",
    "curl -I localhost",
    "ping -c 4 google.com",
  ],
  files: [
    "ls -la",
    "pwd",
    "find . -name '*.log'",
    "tail -f /var/log/syslog",
  ],
  pm2: [
    "pm2 list",
    "pm2 logs",
    "pm2 restart all",
    "pm2 monit",
  ],
};

// Get AI command suggestion
async function getAISuggestion(
  partialCommand: string,
  context: { cwd?: string; recentCommands?: string[]; serverInfo?: string }
): Promise<string[]> {
  if (!partialCommand || partialCommand.length < 2) {
    return [];
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `Complete this Linux command (respond with ONLY the command completions, one per line, max 5):
          
Partial command: ${partialCommand}
Current directory: ${context.cwd || "~"}
Recent commands: ${context.recentCommands?.slice(0, 5).join(", ") || "none"}

Return only command completions, nothing else.`,
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (textContent && textContent.type === "text") {
      return textContent.text
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith("#"))
        .slice(0, 5);
    }
    return [];
  } catch {
    return [];
  }
}

// Quick local suggestions without API call
function getQuickSuggestions(partial: string): string[] {
  const suggestions: string[] = [];
  
  for (const [category, commands] of Object.entries(COMMAND_SUGGESTIONS)) {
    for (const cmd of commands) {
      if (cmd.startsWith(partial)) {
        suggestions.push(cmd);
      }
    }
  }
  
  // Common commands
  const commonCommands = [
    "ls", "cd", "pwd", "cat", "grep", "find", "tail", "head",
    "vim", "nano", "mkdir", "rm", "cp", "mv", "chmod", "chown",
    "sudo", "apt", "yum", "systemctl", "journalctl", "docker",
    "git", "npm", "node", "python", "pip", "curl", "wget",
  ];
  
  for (const cmd of commonCommands) {
    if (cmd.startsWith(partial) && !suggestions.includes(cmd)) {
      suggestions.push(cmd);
    }
  }
  
  return suggestions.slice(0, 8);
}

// Setup terminal WebSocket server
export function setupTerminalWebSocket(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: "/ws/terminal" 
  });

  console.log("Terminal WebSocket server initialized at /ws/terminal");

  wss.on("connection", async (ws: WebSocket, req) => {
    const sessionId = Math.random().toString(36).substring(7);
    console.log(`Terminal WebSocket connected: ${sessionId}`);

    // Send initial connection acknowledgment
    ws.send(JSON.stringify({
      type: "connected",
      sessionId,
      message: "Terminal WebSocket connected. Send 'connect' with serverId to start.",
    }));

    const session: TerminalSession = {
      ws,
      sshClient: new SSHClient(),
      stream: null,
      serverId: "",
      userId: "",
      commandBuffer: "",
      commandHistory: [],
      historyIndex: -1,
      isConnected: false,
    };

    activeSessions.set(sessionId, session);

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await handleTerminalMessage(sessionId, session, message);
      } catch (err: any) {
        ws.send(JSON.stringify({
          type: "error",
          message: err.message || "Invalid message format",
        }));
      }
    });

    ws.on("close", () => {
      console.log(`Terminal WebSocket disconnected: ${sessionId}`);
      cleanupSession(sessionId);
    });

    ws.on("error", (err) => {
      console.error(`Terminal WebSocket error: ${sessionId}`, err);
      cleanupSession(sessionId);
    });
  });

  return wss;
}

// Handle incoming terminal messages
async function handleTerminalMessage(
  sessionId: string,
  session: TerminalSession,
  message: any
): Promise<void> {
  switch (message.type) {
    case "connect":
      await handleConnect(sessionId, session, message);
      break;

    case "input":
      handleInput(session, message.data);
      break;

    case "resize":
      handleResize(session, message.cols, message.rows);
      break;

    case "suggest":
      await handleSuggest(session, message.partial);
      break;

    case "ai-help":
      await handleAIHelp(session, message.question);
      break;

    case "disconnect":
      cleanupSession(sessionId);
      break;

    default:
      session.ws.send(JSON.stringify({
        type: "error",
        message: `Unknown message type: ${message.type}`,
      }));
  }
}

// Connect to SSH server
async function handleConnect(
  sessionId: string,
  session: TerminalSession,
  message: { serverId: string; userId: string; cols?: number; rows?: number }
): Promise<void> {
  const { serverId, userId, cols = 80, rows = 24 } = message;

  try {
    const server = await storage.getVpsServer(serverId);
    if (!server) {
      session.ws.send(JSON.stringify({
        type: "error",
        message: "Server not found",
      }));
      return;
    }

    session.serverId = serverId;
    session.userId = userId;

    const decryptedCredential = decryptCredential(server.encryptedCredential);

    session.sshClient.on("ready", () => {
      console.log(`SSH connected for session ${sessionId}`);
      
      session.sshClient.shell(
        { cols, rows, term: "xterm-256color" },
        (err, stream) => {
          if (err) {
            session.ws.send(JSON.stringify({
              type: "error",
              message: `Shell error: ${err.message}`,
            }));
            return;
          }

          session.stream = stream;
          session.isConnected = true;

          session.ws.send(JSON.stringify({
            type: "connected",
            message: `Connected to ${server.name} (${server.host})`,
          }));

          // Stream terminal output to WebSocket
          stream.on("data", (data: Buffer) => {
            session.ws.send(JSON.stringify({
              type: "output",
              data: data.toString("utf8"),
            }));

            // Track command buffer for suggestions
            const text = data.toString("utf8");
            if (text.includes("\n") || text.includes("\r")) {
              // Command was executed, save to history
              if (session.commandBuffer.trim()) {
                session.commandHistory.unshift(session.commandBuffer.trim());
                if (session.commandHistory.length > 100) {
                  session.commandHistory.pop();
                }
              }
              session.commandBuffer = "";
              session.historyIndex = -1;
            }
          });

          stream.stderr.on("data", (data: Buffer) => {
            session.ws.send(JSON.stringify({
              type: "output",
              data: data.toString("utf8"),
            }));
          });

          stream.on("close", () => {
            session.ws.send(JSON.stringify({
              type: "disconnected",
              message: "SSH connection closed",
            }));
            session.isConnected = false;
            cleanupSession(sessionId);
          });
        }
      );
    });

    session.sshClient.on("error", (err) => {
      session.ws.send(JSON.stringify({
        type: "error",
        message: `SSH error: ${err.message}`,
      }));
    });

    session.sshClient.connect({
      host: server.host,
      port: server.port ?? 22,
      username: server.username,
      password: server.authMethod === "password" ? decryptedCredential : undefined,
      privateKey: server.authMethod === "key" ? decryptedCredential : undefined,
      readyTimeout: 10000,
    });
  } catch (err: any) {
    session.ws.send(JSON.stringify({
      type: "error",
      message: `Connection failed: ${err.message}`,
    }));
  }
}

// Handle terminal input
function handleInput(session: TerminalSession, data: string): void {
  if (!session.stream || !session.isConnected) {
    session.ws.send(JSON.stringify({
      type: "error",
      message: "Not connected to server",
    }));
    return;
  }

  // Track command buffer
  if (data === "\r" || data === "\n") {
    // Enter pressed - command will be executed
  } else if (data === "\x7f" || data === "\b") {
    // Backspace
    session.commandBuffer = session.commandBuffer.slice(0, -1);
  } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
    // Printable character
    session.commandBuffer += data;
  }

  // Write to SSH stream
  session.stream.write(data);
}

// Handle terminal resize
function handleResize(session: TerminalSession, cols: number, rows: number): void {
  if (session.stream && session.isConnected) {
    session.stream.setWindow(rows, cols, 0, 0);
    session.ws.send(JSON.stringify({
      type: "resized",
      cols,
      rows,
    }));
  }
}

// Handle command suggestions
async function handleSuggest(session: TerminalSession, partial: string): Promise<void> {
  // Quick local suggestions first
  const quickSuggestions = getQuickSuggestions(partial);
  
  session.ws.send(JSON.stringify({
    type: "suggestions",
    suggestions: quickSuggestions,
    source: "local",
  }));

  // If partial is long enough, get AI suggestions
  if (partial.length >= 3) {
    const aiSuggestions = await getAISuggestion(partial, {
      recentCommands: session.commandHistory,
    });
    
    if (aiSuggestions.length > 0) {
      session.ws.send(JSON.stringify({
        type: "suggestions",
        suggestions: aiSuggestions,
        source: "ai",
      }));
    }
  }
}

// Handle AI help request
async function handleAIHelp(session: TerminalSession, question: string): Promise<void> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `You are a Linux terminal assistant. Answer this question concisely:

${question}

Recent commands for context: ${session.commandHistory.slice(0, 10).join(", ") || "none"}

Provide a brief answer with command examples if relevant.`,
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (textContent && textContent.type === "text") {
      session.ws.send(JSON.stringify({
        type: "ai-response",
        response: textContent.text,
      }));
    }
  } catch (err: any) {
    session.ws.send(JSON.stringify({
      type: "error",
      message: `AI help failed: ${err.message}`,
    }));
  }
}

// Cleanup session
function cleanupSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    if (session.stream) {
      session.stream.end();
    }
    if (session.sshClient) {
      session.sshClient.end();
    }
    activeSessions.delete(sessionId);
    console.log(`Session cleaned up: ${sessionId}`);
  }
}

// Get active session count
export function getActiveSessionCount(): number {
  return activeSessions.size;
}

// Broadcast to all sessions on a server
export function broadcastToServer(serverId: string, message: any): void {
  for (const [, session] of Array.from(activeSessions)) {
    if (session.serverId === serverId && session.isConnected) {
      session.ws.send(JSON.stringify(message));
    }
  }
}
