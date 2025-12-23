/**
 * Task Orchestration Engine
 * 
 * Enables complex multi-step task execution with:
 * - AI-powered task planning
 * - Step-by-step execution with state tracking
 * - Rollback capabilities for failed operations
 * - Real-time progress streaming
 */

import { Client as SSHClient } from "ssh2";
import { storage } from "./storage";
import { createDecipheriv, scryptSync } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { EventEmitter } from "events";

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

// Task types
export interface TaskStep {
  id: string;
  name: string;
  description: string;
  command: string;
  rollbackCommand?: string;
  requiresApproval: boolean;
  timeout: number;
  status: "pending" | "running" | "completed" | "failed" | "skipped" | "rolled_back";
  output?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  exitCode?: number;
}

export interface Task {
  id: string;
  userId: string;
  serverId: string;
  title: string;
  description: string;
  status: "planning" | "pending" | "running" | "paused" | "completed" | "failed" | "rolling_back" | "rolled_back" | "cancelled";
  steps: TaskStep[];
  currentStepIndex: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  metadata?: Record<string, any>;
}

export interface TaskPlan {
  title: string;
  description: string;
  steps: Omit<TaskStep, "id" | "status" | "output" | "error" | "startedAt" | "completedAt" | "exitCode">[];
  estimatedDuration: string;
  risks: string[];
  requiresApproval: boolean;
}

// Active tasks storage (in production, use database)
const activeTasks = new Map<string, Task>();

// Task event emitter for real-time updates
export const taskEvents = new EventEmitter();

// Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Generate unique ID
function generateId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

// Execute SSH command
async function executeSSH(
  server: any,
  command: string,
  timeout: number = 60000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const client = new SSHClient();
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      client.end();
      reject(new Error(`Command timed out after ${timeout / 1000}s`));
    }, timeout);

    client.on("ready", () => {
      client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          client.end();
          reject(err);
          return;
        }

        stream.on("close", (code: number) => {
          clearTimeout(timer);
          client.end();
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

    client.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    const decryptedCredential = decryptCredential(server.encryptedCredential);

    client.connect({
      host: server.host,
      port: server.port ?? 22,
      username: server.username,
      password: server.authMethod === "password" ? decryptedCredential : undefined,
      privateKey: server.authMethod === "key" ? decryptedCredential : undefined,
      readyTimeout: 10000,
    });
  });
}

// AI Task Planner
export async function planTask(
  request: string,
  serverInfo: { os?: string; hasDocker?: boolean; hasNginx?: boolean }
): Promise<TaskPlan> {
  const prompt = `You are a DevOps task planner. Create a detailed execution plan for this request:

REQUEST: ${request}

SERVER INFO:
- OS: ${serverInfo.os || "Linux (unknown distro)"}
- Docker: ${serverInfo.hasDocker ? "Yes" : "Unknown"}
- Nginx: ${serverInfo.hasNginx ? "Yes" : "Unknown"}

Create a step-by-step plan with:
1. Each step should be a single command or small set of related commands
2. Include rollback commands for destructive operations
3. Mark steps that need user approval (dangerous operations)
4. Set appropriate timeouts

Respond in JSON format:
{
  "title": "Short task title",
  "description": "What this task accomplishes",
  "steps": [
    {
      "name": "Step name",
      "description": "What this step does",
      "command": "shell command to execute",
      "rollbackCommand": "command to undo this step (optional)",
      "requiresApproval": false,
      "timeout": 30
    }
  ],
  "estimatedDuration": "e.g., 2-5 minutes",
  "risks": ["potential risk 1", "potential risk 2"],
  "requiresApproval": true
}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const textContent = response.content.find((c) => c.type === "text");
  if (textContent && textContent.type === "text") {
    try {
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Parse failed
    }
  }

  // Default fallback plan
  return {
    title: "Execute Request",
    description: request,
    steps: [
      {
        name: "Execute command",
        description: request,
        command: "echo 'Unable to parse complex request. Please break it down into simpler steps.'",
        requiresApproval: false,
        timeout: 30,
      },
    ],
    estimatedDuration: "Unknown",
    risks: ["Task planning failed - manual execution recommended"],
    requiresApproval: true,
  };
}

// Create a new task from a plan
export async function createTask(
  userId: string,
  serverId: string,
  plan: TaskPlan
): Promise<Task> {
  const taskId = generateId();

  const task: Task = {
    id: taskId,
    userId,
    serverId,
    title: plan.title,
    description: plan.description,
    status: "pending",
    steps: plan.steps.map((step, index) => ({
      ...step,
      id: `${taskId}_step_${index}`,
      status: "pending" as const,
    })),
    currentStepIndex: 0,
    createdAt: new Date(),
    metadata: {
      estimatedDuration: plan.estimatedDuration,
      risks: plan.risks,
    },
  };

  activeTasks.set(taskId, task);
  taskEvents.emit("taskCreated", task);

  return task;
}

// Execute a task
export async function executeTask(taskId: string): Promise<Task> {
  const task = activeTasks.get(taskId);
  if (!task) {
    throw new Error("Task not found");
  }

  const server = await storage.getVpsServer(task.serverId);
  if (!server) {
    throw new Error("Server not found");
  }

  task.status = "running";
  task.startedAt = new Date();
  taskEvents.emit("taskUpdated", task);

  try {
    for (let i = task.currentStepIndex; i < task.steps.length; i++) {
      const step = task.steps[i];
      task.currentStepIndex = i;

      // Check if task was paused or cancelled (status may have changed externally)
      const currentStatus = task.status as string;
      if (currentStatus === "paused" || currentStatus === "cancelled") {
        break;
      }

      // Check for approval requirement
      if (step.requiresApproval && step.status === "pending") {
        task.status = "paused";
        taskEvents.emit("taskNeedsApproval", { task, step });
        return task;
      }

      // Execute step
      step.status = "running";
      step.startedAt = new Date();
      taskEvents.emit("stepStarted", { task, step });

      try {
        const result = await executeSSH(server, step.command, step.timeout * 1000);
        
        step.output = result.stdout + (result.stderr ? `\n[STDERR]\n${result.stderr}` : "");
        step.exitCode = result.exitCode;
        step.completedAt = new Date();

        if (result.exitCode === 0) {
          step.status = "completed";
          taskEvents.emit("stepCompleted", { task, step });
        } else {
          step.status = "failed";
          step.error = `Exit code: ${result.exitCode}`;
          taskEvents.emit("stepFailed", { task, step });

          // Trigger rollback
          task.status = "failed";
          task.error = `Step "${step.name}" failed with exit code ${result.exitCode}`;
          taskEvents.emit("taskFailed", task);
          return task;
        }
      } catch (error: any) {
        step.status = "failed";
        step.error = error.message;
        step.completedAt = new Date();
        taskEvents.emit("stepFailed", { task, step });

        task.status = "failed";
        task.error = `Step "${step.name}" failed: ${error.message}`;
        taskEvents.emit("taskFailed", task);
        return task;
      }
    }

    // All steps completed
    task.status = "completed";
    task.completedAt = new Date();
    taskEvents.emit("taskCompleted", task);
  } catch (error: any) {
    task.status = "failed";
    task.error = error.message;
    taskEvents.emit("taskFailed", task);
  }

  return task;
}

// Rollback a task
export async function rollbackTask(taskId: string): Promise<Task> {
  const task = activeTasks.get(taskId);
  if (!task) {
    throw new Error("Task not found");
  }

  const server = await storage.getVpsServer(task.serverId);
  if (!server) {
    throw new Error("Server not found");
  }

  task.status = "rolling_back";
  taskEvents.emit("taskRollingBack", task);

  // Rollback completed steps in reverse order
  const completedSteps = task.steps
    .filter((s) => s.status === "completed" && s.rollbackCommand)
    .reverse();

  for (const step of completedSteps) {
    if (!step.rollbackCommand) continue;

    taskEvents.emit("stepRollingBack", { task, step });

    try {
      const result = await executeSSH(server, step.rollbackCommand, step.timeout * 1000);
      
      if (result.exitCode === 0) {
        step.status = "rolled_back";
        taskEvents.emit("stepRolledBack", { task, step });
      } else {
        // Rollback failed, but continue with other steps
        step.error = `Rollback failed: exit code ${result.exitCode}`;
        taskEvents.emit("stepRollbackFailed", { task, step });
      }
    } catch (error: any) {
      step.error = `Rollback failed: ${error.message}`;
      taskEvents.emit("stepRollbackFailed", { task, step });
    }
  }

  task.status = "rolled_back";
  task.completedAt = new Date();
  taskEvents.emit("taskRolledBack", task);

  return task;
}

// Pause a running task
export function pauseTask(taskId: string): Task {
  const task = activeTasks.get(taskId);
  if (!task) {
    throw new Error("Task not found");
  }

  if (task.status === "running") {
    task.status = "paused";
    taskEvents.emit("taskPaused", task);
  }

  return task;
}

// Resume a paused task
export async function resumeTask(taskId: string): Promise<Task> {
  const task = activeTasks.get(taskId);
  if (!task) {
    throw new Error("Task not found");
  }

  if (task.status === "paused") {
    return executeTask(taskId);
  }

  return task;
}

// Approve a step and continue
export async function approveStep(taskId: string, stepId: string): Promise<Task> {
  const task = activeTasks.get(taskId);
  if (!task) {
    throw new Error("Task not found");
  }

  const step = task.steps.find((s) => s.id === stepId);
  if (!step) {
    throw new Error("Step not found");
  }

  // Mark step as approved (no longer requires approval for this execution)
  step.requiresApproval = false;
  taskEvents.emit("stepApproved", { task, step });

  // Resume task execution
  return executeTask(taskId);
}

// Cancel a task
export function cancelTask(taskId: string): Task {
  const task = activeTasks.get(taskId);
  if (!task) {
    throw new Error("Task not found");
  }

  task.status = "cancelled";
  task.completedAt = new Date();
  
  // Mark pending steps as skipped
  for (const step of task.steps) {
    if (step.status === "pending") {
      step.status = "skipped";
    }
  }

  taskEvents.emit("taskCancelled", task);
  return task;
}

// Get task by ID
export function getTask(taskId: string): Task | undefined {
  return activeTasks.get(taskId);
}

// Get all tasks for a user
export function getUserTasks(userId: string): Task[] {
  return Array.from(activeTasks.values())
    .filter((t) => t.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// Delete completed/cancelled tasks
export function cleanupTasks(userId: string, olderThanHours: number = 24): number {
  const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;
  let deleted = 0;

  for (const [id, task] of Array.from(activeTasks)) {
    if (
      task.userId === userId &&
      (task.status === "completed" || task.status === "cancelled" || task.status === "rolled_back") &&
      task.createdAt.getTime() < cutoff
    ) {
      activeTasks.delete(id);
      deleted++;
    }
  }

  return deleted;
}

// Common task templates
export const TASK_TEMPLATES = {
  "deploy-docker-app": {
    name: "Deploy Docker Application",
    description: "Pull and deploy a Docker container",
    params: ["image", "container_name", "port"],
  },
  "setup-nginx-site": {
    name: "Setup Nginx Site",
    description: "Configure Nginx for a new domain",
    params: ["domain", "port", "ssl"],
  },
  "update-system": {
    name: "System Update",
    description: "Update system packages",
    params: [],
  },
  "setup-ssl": {
    name: "Setup SSL Certificate",
    description: "Install Let's Encrypt SSL certificate",
    params: ["domain", "email"],
  },
  "backup-database": {
    name: "Backup Database",
    description: "Create database backup",
    params: ["db_type", "db_name", "backup_path"],
  },
};
