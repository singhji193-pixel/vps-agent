/**
 * VPS Agent - Agentic Routes
 * 
 * Express routes for agentic AI capabilities.
 * This module provides Cursor/Emergent-level VPS management.
 */

import { Router, Request, Response } from "express";
import { Client as SSHClient } from "ssh2";
import { storage } from "./storage";
import { handleAgenticChat } from "./agentic-handler";
import { VPS_TOOLS, TOOL_CATEGORIES } from "./tools/index";
import { randomBytes, scryptSync, createDecipheriv } from "crypto";
import { collectServerMetrics, analyzeMetricsWithAI, formatBytes } from "./monitoring-service";
import {
  planTask,
  createTask,
  executeTask,
  rollbackTask,
  pauseTask,
  resumeTask,
  approveStep,
  cancelTask,
  getTask,
  getUserTasks,
  TASK_TEMPLATES,
  taskEvents,
} from "./task-orchestrator";
import {
  listContainers,
  listImages,
  containerAction,
  pullImage,
  runContainer,
  dockerCompose,
  getNginxStatus,
  listNginxSites,
  getNginxSiteConfig,
  toggleNginxSite,
  createNginxSite,
  reloadNginx,
  generateNginxConfig,
  checkCertbot,
  installCertbot,
  listSSLCertificates,
  requestSSLCertificate,
  renewSSLCertificates,
} from "./infrastructure-service";

const router = Router();

// Encryption config (must match routes.ts)
const ENCRYPTION_KEY = process.env.SESSION_SECRET;
const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const key = ENCRYPTION_KEY || "insecure-dev-key-do-not-use-in-production";
  return scryptSync(key, "vps-agent-salt", 32);
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

// Get available tools
router.get("/tools", (req: Request, res: Response) => {
  res.json({
    tools: VPS_TOOLS.map(t => ({
      name: t.name,
      description: t.description,
    })),
    categories: TOOL_CATEGORIES,
  });
});

// Agentic chat endpoint - AI with autonomous tool execution
router.post("/chat", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { content, conversationId, serverId, model, enableThinking, enableResearch, attachments } = req.body;

    if (!content) {
      return res.status(400).json({ error: "Content is required" });
    }

    if (!serverId) {
      return res.status(400).json({ error: "Server ID is required for agentic mode" });
    }

    // Get server details
    const server = await storage.getVpsServer(serverId);
    if (!server) {
      return res.status(404).json({ error: "Server not found" });
    }

    // Decrypt credentials
    const decryptedCredential = decryptCredential(server.encryptedCredential);

    // Build server connection
    const serverConnection = {
      host: server.host,
      port: server.port ?? 22,
      username: server.username,
      password: server.authMethod === "password" ? decryptedCredential : undefined,
      privateKey: server.authMethod === "key" ? decryptedCredential : undefined,
    };

    // Handle agentic chat
    await handleAgenticChat(
      {
        userId,
        content,
        conversationId,
        serverId,
        serverConnection,
        model,
        enableThinking,
        enableResearch,
        attachments,
      },
      res
    );
  } catch (error: any) {
    console.error("Agentic chat error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "Agentic chat failed" });
    }
  }
});

// Approve pending command
router.post("/approve", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { serverId, pendingCommand, approved } = req.body;

    if (!serverId || !pendingCommand) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const server = await storage.getVpsServer(serverId);
    if (!server) {
      return res.status(404).json({ error: "Server not found" });
    }

    if (!approved) {
      return res.json({ success: true, message: "Command rejected" });
    }

    // Execute the approved command
    const decryptedCredential = decryptCredential(server.encryptedCredential);
    
    const conn = new SSHClient();
    
    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error("Command timeout"));
      }, 60000);

      conn.on("ready", () => {
        conn.exec(pendingCommand, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            conn.end();
            reject(err);
            return;
          }

          let stdout = "";
          let stderr = "";

          stream.on("close", (code: number) => {
            clearTimeout(timeout);
            conn.end();
            resolve({ stdout, stderr, exitCode: code });
          });

          stream.on("data", (data: Buffer) => {
            stdout += data.toString();
          });

          stream.stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
          });
        });
      });

      conn.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      conn.connect({
        host: server.host,
        port: server.port ?? 22,
        username: server.username,
        password: server.authMethod === "password" ? decryptedCredential : undefined,
        privateKey: server.authMethod === "key" ? decryptedCredential : undefined,
      });
    });

    // Log command execution
    await storage.createCommandHistory({
      userId,
      vpsServerId: serverId,
      command: pendingCommand,
      output: result.stdout + (result.stderr ? `\n[STDERR]\n${result.stderr}` : ""),
      exitCode: result.exitCode,
    });

    res.json({
      success: result.exitCode === 0,
      output: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    });
  } catch (error: any) {
    console.error("Approval execution error:", error);
    res.status(500).json({ error: error.message || "Failed to execute approved command" });
  }
});

// Quick server health check
router.get("/health/:serverId", async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const server = await storage.getVpsServer(serverId);
    
    if (!server) {
      return res.status(404).json({ error: "Server not found" });
    }

    const decryptedCredential = decryptCredential(server.encryptedCredential);
    const conn = new SSHClient();

    const healthData = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error("Health check timeout"));
      }, 15000);

      conn.on("ready", () => {
        const commands = [
          "uptime",
          "free -m | grep Mem | awk '{print $3/$2 * 100}'",
          "df -h / | tail -1 | awk '{print $5}'",
          "cat /proc/loadavg | cut -d' ' -f1-3",
        ].join(" && echo '---' && ");

        conn.exec(commands, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            conn.end();
            reject(err);
            return;
          }

          let output = "";
          stream.on("close", () => {
            clearTimeout(timeout);
            conn.end();

            const parts = output.split("---").map(s => s.trim());
            resolve({
              online: true,
              uptime: parts[0] || "unknown",
              memoryPercent: parseFloat(parts[1]) || 0,
              diskPercent: parseInt(parts[2]) || 0,
              loadAverage: parts[3] || "0 0 0",
            });
          });

          stream.on("data", (data: Buffer) => {
            output += data.toString();
          });
        });
      });

      conn.on("error", (err) => {
        clearTimeout(timeout);
        resolve({ online: false, error: err.message });
      });

      conn.connect({
        host: server.host,
        port: server.port ?? 22,
        username: server.username,
        password: server.authMethod === "password" ? decryptedCredential : undefined,
        privateKey: server.authMethod === "key" ? decryptedCredential : undefined,
      });
    });

    res.json(healthData);
  } catch (error: any) {
    res.json({ online: false, error: error.message });
  }
});

// Quick system metrics
router.get("/metrics/:serverId", async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const server = await storage.getVpsServer(serverId);
    
    if (!server) {
      return res.status(404).json({ error: "Server not found" });
    }

    const decryptedCredential = decryptCredential(server.encryptedCredential);
    const conn = new SSHClient();

    const metrics = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error("Metrics timeout"));
      }, 30000);

      conn.on("ready", () => {
        const command = `
echo "=== CPU ===" && 
grep -c ^processor /proc/cpuinfo && 
head -1 /proc/loadavg && 
echo "=== MEMORY ===" && 
free -b && 
echo "=== DISK ===" && 
df -B1 / && 
echo "=== PROCESSES ===" && 
ps aux --sort=-%mem | head -6
`;

        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            conn.end();
            reject(err);
            return;
          }

          let output = "";
          stream.on("close", () => {
            clearTimeout(timeout);
            conn.end();
            resolve({ raw: output, timestamp: new Date().toISOString() });
          });

          stream.on("data", (data: Buffer) => {
            output += data.toString();
          });

          stream.stderr.on("data", (data: Buffer) => {
            output += data.toString();
          });
        });
      });

      conn.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      conn.connect({
        host: server.host,
        port: server.port ?? 22,
        username: server.username,
        password: server.authMethod === "password" ? decryptedCredential : undefined,
        privateKey: server.authMethod === "key" ? decryptedCredential : undefined,
      });
    });

    res.json(metrics);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ MONITORING ENDPOINTS ============

// Get comprehensive server metrics
router.get("/monitor/:serverId", async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const metrics = await collectServerMetrics(serverId);
    
    if (!metrics) {
      return res.status(404).json({ error: "Server not found" });
    }
    
    res.json(metrics);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get AI analysis of server metrics
router.get("/monitor/:serverId/analyze", async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const metrics = await collectServerMetrics(serverId);
    
    if (!metrics) {
      return res.status(404).json({ error: "Server not found" });
    }
    
    const analysis = await analyzeMetricsWithAI(metrics);
    
    res.json({
      metrics,
      analysis,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get metrics for all user's servers
router.get("/monitor", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const servers = await storage.getVpsServers(userId);
    
    const metricsPromises = servers.map(server => 
      collectServerMetrics(server.id).catch(() => null)
    );
    
    const allMetrics = await Promise.all(metricsPromises);
    const validMetrics = allMetrics.filter(m => m !== null);
    
    // Summary stats
    const summary = {
      totalServers: servers.length,
      onlineServers: validMetrics.filter(m => m?.online).length,
      criticalAlerts: validMetrics.reduce((sum, m) => 
        sum + (m?.alerts.filter(a => a.severity === "critical").length || 0), 0),
      warningAlerts: validMetrics.reduce((sum, m) => 
        sum + (m?.alerts.filter(a => a.severity === "warning").length || 0), 0),
    };
    
    res.json({
      summary,
      servers: validMetrics,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ TASK ORCHESTRATION ENDPOINTS ============

// Get task templates
router.get("/tasks/templates", (req: Request, res: Response) => {
  res.json({ templates: TASK_TEMPLATES });
});

// Get all tasks for user
router.get("/tasks", (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const tasks = getUserTasks(userId);
    res.json({ tasks });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single task
router.get("/tasks/:taskId", (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const task = getTask(taskId);
    
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    
    res.json({ task });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Plan a new task (AI generates execution plan)
router.post("/tasks/plan", async (req: Request, res: Response) => {
  try {
    const { request, serverId } = req.body;
    
    if (!request) {
      return res.status(400).json({ error: "Request is required" });
    }
    
    // Get server info for context
    let serverInfo = {};
    if (serverId) {
      const server = await storage.getVpsServer(serverId);
      if (server) {
        serverInfo = { os: "Linux", hasDocker: true, hasNginx: true };
      }
    }
    
    const plan = await planTask(request, serverInfo);
    res.json({ plan });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a task from a plan
router.post("/tasks", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { serverId, plan } = req.body;
    
    if (!serverId || !plan) {
      return res.status(400).json({ error: "serverId and plan are required" });
    }
    
    const task = await createTask(userId, serverId, plan);
    res.json({ task });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Execute a task
router.post("/tasks/:taskId/execute", async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    
    // Set up SSE for streaming updates
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    
    // Listen for task events
    const handlers = {
      taskUpdated: (task: any) => {
        if (task.id === taskId) {
          res.write(`data: ${JSON.stringify({ type: "taskUpdated", task })}\n\n`);
        }
      },
      stepStarted: ({ task, step }: any) => {
        if (task.id === taskId) {
          res.write(`data: ${JSON.stringify({ type: "stepStarted", step })}\n\n`);
        }
      },
      stepCompleted: ({ task, step }: any) => {
        if (task.id === taskId) {
          res.write(`data: ${JSON.stringify({ type: "stepCompleted", step })}\n\n`);
        }
      },
      stepFailed: ({ task, step }: any) => {
        if (task.id === taskId) {
          res.write(`data: ${JSON.stringify({ type: "stepFailed", step })}\n\n`);
        }
      },
      taskNeedsApproval: ({ task, step }: any) => {
        if (task.id === taskId) {
          res.write(`data: ${JSON.stringify({ type: "needsApproval", step })}\n\n`);
        }
      },
      taskCompleted: (task: any) => {
        if (task.id === taskId) {
          res.write(`data: ${JSON.stringify({ type: "taskCompleted", task })}\n\n`);
          cleanup();
          res.end();
        }
      },
      taskFailed: (task: any) => {
        if (task.id === taskId) {
          res.write(`data: ${JSON.stringify({ type: "taskFailed", task })}\n\n`);
          cleanup();
          res.end();
        }
      },
    };
    
    // Register handlers
    Object.entries(handlers).forEach(([event, handler]) => {
      taskEvents.on(event, handler);
    });
    
    const cleanup = () => {
      Object.entries(handlers).forEach(([event, handler]) => {
        taskEvents.off(event, handler);
      });
    };
    
    req.on("close", cleanup);
    
    // Start execution
    const task = await executeTask(taskId);
    
    // If task completed synchronously (no approval needed)
    if (task.status === "completed" || task.status === "failed") {
      cleanup();
      res.end();
    }
  } catch (error: any) {
    res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);
    res.end();
  }
});

// Approve a step
router.post("/tasks/:taskId/steps/:stepId/approve", async (req: Request, res: Response) => {
  try {
    const { taskId, stepId } = req.params;
    const task = await approveStep(taskId, stepId);
    res.json({ task });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Pause a task
router.post("/tasks/:taskId/pause", (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const task = pauseTask(taskId);
    res.json({ task });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Resume a task
router.post("/tasks/:taskId/resume", async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const task = await resumeTask(taskId);
    res.json({ task });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Rollback a task
router.post("/tasks/:taskId/rollback", async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    
    // Set up SSE for streaming rollback updates
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    
    const handlers = {
      stepRollingBack: ({ task, step }: any) => {
        if (task.id === taskId) {
          res.write(`data: ${JSON.stringify({ type: "stepRollingBack", step })}\n\n`);
        }
      },
      stepRolledBack: ({ task, step }: any) => {
        if (task.id === taskId) {
          res.write(`data: ${JSON.stringify({ type: "stepRolledBack", step })}\n\n`);
        }
      },
      taskRolledBack: (task: any) => {
        if (task.id === taskId) {
          res.write(`data: ${JSON.stringify({ type: "taskRolledBack", task })}\n\n`);
          cleanup();
          res.end();
        }
      },
    };
    
    Object.entries(handlers).forEach(([event, handler]) => {
      taskEvents.on(event, handler);
    });
    
    const cleanup = () => {
      Object.entries(handlers).forEach(([event, handler]) => {
        taskEvents.off(event, handler);
      });
    };
    
    req.on("close", cleanup);
    
    await rollbackTask(taskId);
  } catch (error: any) {
    res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);
    res.end();
  }
});

// Cancel a task
router.post("/tasks/:taskId/cancel", (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const task = cancelTask(taskId);
    res.json({ task });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ DOCKER MANAGEMENT ENDPOINTS ============

// List Docker containers
router.get("/docker/:serverId/containers", async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const all = req.query.all !== "false";
    const containers = await listContainers(serverId, all);
    res.json({ containers });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List Docker images
router.get("/docker/:serverId/images", async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const images = await listImages(serverId);
    res.json({ images });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Container action (start, stop, restart, etc.)
router.post("/docker/:serverId/containers/:containerId/:action", async (req: Request, res: Response) => {
  try {
    const { serverId, containerId, action } = req.params;
    const validActions = ["start", "stop", "restart", "pause", "unpause", "remove", "logs"];
    
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }
    
    const result = await containerAction(serverId, containerId, action as any);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Pull Docker image
router.post("/docker/:serverId/pull", async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const { image } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: "Image name required" });
    }
    
    const result = await pullImage(serverId, image);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Run new container
router.post("/docker/:serverId/run", async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const { image, name, ports, env, volumes, network, restart } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: "Image name required" });
    }
    
    const result = await runContainer(serverId, {
      image,
      name,
      ports,
      env,
      volumes,
      network,
      restart,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Docker Compose operations
router.post("/docker/:serverId/compose/:action", async (req: Request, res: Response) => {
  try {
    const { serverId, action } = req.params;
    const { path } = req.body;
    
    if (!path) {
      return res.status(400).json({ error: "Path to docker-compose.yml required" });
    }
    
    const result = await dockerCompose(serverId, action as any, path);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ NGINX MANAGEMENT ENDPOINTS ============

// Get Nginx status
router.get("/nginx/:serverId/status", async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const status = await getNginxStatus(serverId);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List Nginx sites
router.get("/nginx/:serverId/sites", async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const sites = await listNginxSites(serverId);
    res.json({ sites });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get site config
router.get("/nginx/:serverId/sites/:siteName", async (req: Request, res: Response) => {
  try {
    const { serverId, siteName } = req.params;
    const config = await getNginxSiteConfig(serverId, siteName);
    res.json({ config });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create new site
router.post("/nginx/:serverId/sites", async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const { siteName, config, domain, proxyPort, staticRoot } = req.body;
    
    let siteConfig = config;
    if (!siteConfig && domain) {
      siteConfig = generateNginxConfig({ domain, proxyPort, staticRoot });
    }
    
    if (!siteName || !siteConfig) {
      return res.status(400).json({ error: "siteName and config (or domain) required" });
    }
    
    const result = await createNginxSite(serverId, siteName, siteConfig);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Enable/disable site
router.post("/nginx/:serverId/sites/:siteName/toggle", async (req: Request, res: Response) => {
  try {
    const { serverId, siteName } = req.params;
    const { enable } = req.body;
    
    const result = await toggleNginxSite(serverId, siteName, enable);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Reload Nginx
router.post("/nginx/:serverId/reload", async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const result = await reloadNginx(serverId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ SSL CERTIFICATE ENDPOINTS ============

// Check certbot status
router.get("/ssl/:serverId/status", async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const installed = await checkCertbot(serverId);
    const certificates = installed ? await listSSLCertificates(serverId) : [];
    res.json({ installed, certificates });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Install certbot
router.post("/ssl/:serverId/install", async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const result = await installCertbot(serverId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Request new certificate
router.post("/ssl/:serverId/request", async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const { domain, email } = req.body;
    
    if (!domain || !email) {
      return res.status(400).json({ error: "domain and email required" });
    }
    
    const result = await requestSSLCertificate(serverId, domain, email);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Renew certificates
router.post("/ssl/:serverId/renew", async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const result = await renewSSLCertificates(serverId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
