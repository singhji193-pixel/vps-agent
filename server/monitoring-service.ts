/**
 * Server Monitoring Service
 * 
 * Collects real-time metrics from VPS servers:
 * - CPU usage and load averages
 * - Memory usage (RAM, swap)
 * - Disk usage and I/O
 * - Network statistics
 * - Process information
 * - Docker container stats
 */

import { Client as SSHClient } from "ssh2";
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

// Metric types
export interface CpuMetrics {
  cores: number;
  loadAverage: [number, number, number];
  usagePercent: number;
  idle: number;
}

export interface MemoryMetrics {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  availableBytes: number;
  usagePercent: number;
  swapTotal: number;
  swapUsed: number;
  swapPercent: number;
}

export interface DiskMetrics {
  mountPoint: string;
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usagePercent: number;
  filesystem: string;
}

export interface NetworkMetrics {
  interface: string;
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
  rxErrors: number;
  txErrors: number;
}

export interface ProcessInfo {
  pid: number;
  user: string;
  cpu: number;
  memory: number;
  command: string;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  cpuPercent: number;
  memoryUsage: string;
  memoryPercent: number;
  netIO: string;
  blockIO: string;
}

export interface ServerMetrics {
  serverId: string;
  serverName: string;
  timestamp: Date;
  online: boolean;
  uptime: string;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disks: DiskMetrics[];
  network: NetworkMetrics[];
  topProcesses: ProcessInfo[];
  dockerContainers: DockerContainer[];
  alerts: Alert[];
}

export interface Alert {
  id: string;
  severity: "info" | "warning" | "critical";
  type: string;
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
}

// Alert thresholds
const THRESHOLDS = {
  cpu: { warning: 70, critical: 90 },
  memory: { warning: 80, critical: 95 },
  disk: { warning: 80, critical: 95 },
  swap: { warning: 50, critical: 80 },
  load: { warning: 0.8, critical: 1.5 }, // multiplier of CPU cores
};

// Anthropic client for anomaly detection
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Execute SSH command
async function executeSSH(
  server: any,
  command: string,
  timeout: number = 15000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = new SSHClient();
    let output = "";

    const timer = setTimeout(() => {
      client.end();
      reject(new Error("SSH command timeout"));
    }, timeout);

    client.on("ready", () => {
      client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          client.end();
          reject(err);
          return;
        }

        stream.on("close", () => {
          clearTimeout(timer);
          client.end();
          resolve(output);
        });

        stream.on("data", (data: Buffer) => {
          output += data.toString();
        });

        stream.stderr.on("data", (data: Buffer) => {
          output += data.toString();
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

// Parse CPU metrics
function parseCpuMetrics(output: string, loadOutput: string): CpuMetrics {
  const cores = parseInt(output.trim()) || 1;
  const loadParts = loadOutput.trim().split(" ").map(parseFloat);
  
  return {
    cores,
    loadAverage: [loadParts[0] || 0, loadParts[1] || 0, loadParts[2] || 0],
    usagePercent: Math.min(100, (loadParts[0] / cores) * 100),
    idle: Math.max(0, 100 - (loadParts[0] / cores) * 100),
  };
}

// Parse memory metrics
function parseMemoryMetrics(output: string): MemoryMetrics {
  const lines = output.trim().split("\n");
  let metrics: MemoryMetrics = {
    totalBytes: 0,
    usedBytes: 0,
    freeBytes: 0,
    availableBytes: 0,
    usagePercent: 0,
    swapTotal: 0,
    swapUsed: 0,
    swapPercent: 0,
  };

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (line.startsWith("Mem:")) {
      metrics.totalBytes = parseInt(parts[1]) || 0;
      metrics.usedBytes = parseInt(parts[2]) || 0;
      metrics.freeBytes = parseInt(parts[3]) || 0;
      metrics.availableBytes = parseInt(parts[6]) || metrics.freeBytes;
    } else if (line.startsWith("Swap:")) {
      metrics.swapTotal = parseInt(parts[1]) || 0;
      metrics.swapUsed = parseInt(parts[2]) || 0;
    }
  }

  metrics.usagePercent = metrics.totalBytes > 0 
    ? (metrics.usedBytes / metrics.totalBytes) * 100 
    : 0;
  metrics.swapPercent = metrics.swapTotal > 0 
    ? (metrics.swapUsed / metrics.swapTotal) * 100 
    : 0;

  return metrics;
}

// Parse disk metrics
function parseDiskMetrics(output: string): DiskMetrics[] {
  const lines = output.trim().split("\n").slice(1); // Skip header
  const disks: DiskMetrics[] = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 6 && !parts[0].startsWith("tmpfs") && !parts[0].startsWith("devtmpfs")) {
      disks.push({
        filesystem: parts[0],
        totalBytes: parseInt(parts[1]) || 0,
        usedBytes: parseInt(parts[2]) || 0,
        availableBytes: parseInt(parts[3]) || 0,
        usagePercent: parseInt(parts[4]?.replace("%", "")) || 0,
        mountPoint: parts[5],
      });
    }
  }

  return disks;
}

// Parse network metrics
function parseNetworkMetrics(output: string): NetworkMetrics[] {
  const interfaces: NetworkMetrics[] = [];
  const lines = output.trim().split("\n").slice(2); // Skip headers

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 10 && !parts[0].startsWith("lo")) {
      interfaces.push({
        interface: parts[0].replace(":", ""),
        rxBytes: parseInt(parts[1]) || 0,
        rxPackets: parseInt(parts[2]) || 0,
        rxErrors: parseInt(parts[3]) || 0,
        txBytes: parseInt(parts[9]) || 0,
        txPackets: parseInt(parts[10]) || 0,
        txErrors: parseInt(parts[11]) || 0,
      });
    }
  }

  return interfaces;
}

// Parse top processes
function parseProcesses(output: string): ProcessInfo[] {
  const lines = output.trim().split("\n").slice(1); // Skip header
  const processes: ProcessInfo[] = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 11) {
      processes.push({
        user: parts[0],
        pid: parseInt(parts[1]) || 0,
        cpu: parseFloat(parts[2]) || 0,
        memory: parseFloat(parts[3]) || 0,
        command: parts.slice(10).join(" "),
      });
    }
  }

  return processes.slice(0, 10);
}

// Parse Docker stats
function parseDockerStats(output: string): DockerContainer[] {
  if (!output.trim()) return [];
  
  const lines = output.trim().split("\n");
  const containers: DockerContainer[] = [];

  for (const line of lines) {
    try {
      const container = JSON.parse(line);
      containers.push({
        id: container.ID || "",
        name: container.Name || "",
        image: container.Image || "",
        status: container.Status || "",
        cpuPercent: parseFloat(container.CPUPerc?.replace("%", "")) || 0,
        memoryUsage: container.MemUsage || "",
        memoryPercent: parseFloat(container.MemPerc?.replace("%", "")) || 0,
        netIO: container.NetIO || "",
        blockIO: container.BlockIO || "",
      });
    } catch {
      // Skip invalid JSON lines
    }
  }

  return containers;
}

// Generate alerts based on metrics
function generateAlerts(metrics: Partial<ServerMetrics>): Alert[] {
  const alerts: Alert[] = [];
  const timestamp = new Date();

  // CPU alerts
  if (metrics.cpu) {
    const loadPerCore = metrics.cpu.loadAverage[0] / metrics.cpu.cores;
    if (loadPerCore >= THRESHOLDS.load.critical) {
      alerts.push({
        id: `cpu-critical-${Date.now()}`,
        severity: "critical",
        type: "cpu_load",
        message: `CPU load is critically high: ${metrics.cpu.loadAverage[0].toFixed(2)} (${metrics.cpu.cores} cores)`,
        value: loadPerCore,
        threshold: THRESHOLDS.load.critical,
        timestamp,
      });
    } else if (loadPerCore >= THRESHOLDS.load.warning) {
      alerts.push({
        id: `cpu-warning-${Date.now()}`,
        severity: "warning",
        type: "cpu_load",
        message: `CPU load is high: ${metrics.cpu.loadAverage[0].toFixed(2)} (${metrics.cpu.cores} cores)`,
        value: loadPerCore,
        threshold: THRESHOLDS.load.warning,
        timestamp,
      });
    }
  }

  // Memory alerts
  if (metrics.memory) {
    if (metrics.memory.usagePercent >= THRESHOLDS.memory.critical) {
      alerts.push({
        id: `memory-critical-${Date.now()}`,
        severity: "critical",
        type: "memory",
        message: `Memory usage is critically high: ${metrics.memory.usagePercent.toFixed(1)}%`,
        value: metrics.memory.usagePercent,
        threshold: THRESHOLDS.memory.critical,
        timestamp,
      });
    } else if (metrics.memory.usagePercent >= THRESHOLDS.memory.warning) {
      alerts.push({
        id: `memory-warning-${Date.now()}`,
        severity: "warning",
        type: "memory",
        message: `Memory usage is high: ${metrics.memory.usagePercent.toFixed(1)}%`,
        value: metrics.memory.usagePercent,
        threshold: THRESHOLDS.memory.warning,
        timestamp,
      });
    }

    // Swap alerts
    if (metrics.memory.swapPercent >= THRESHOLDS.swap.critical) {
      alerts.push({
        id: `swap-critical-${Date.now()}`,
        severity: "critical",
        type: "swap",
        message: `Swap usage is critically high: ${metrics.memory.swapPercent.toFixed(1)}%`,
        value: metrics.memory.swapPercent,
        threshold: THRESHOLDS.swap.critical,
        timestamp,
      });
    }
  }

  // Disk alerts
  if (metrics.disks) {
    for (const disk of metrics.disks) {
      if (disk.usagePercent >= THRESHOLDS.disk.critical) {
        alerts.push({
          id: `disk-critical-${disk.mountPoint}-${Date.now()}`,
          severity: "critical",
          type: "disk",
          message: `Disk ${disk.mountPoint} is critically full: ${disk.usagePercent}%`,
          value: disk.usagePercent,
          threshold: THRESHOLDS.disk.critical,
          timestamp,
        });
      } else if (disk.usagePercent >= THRESHOLDS.disk.warning) {
        alerts.push({
          id: `disk-warning-${disk.mountPoint}-${Date.now()}`,
          severity: "warning",
          type: "disk",
          message: `Disk ${disk.mountPoint} is getting full: ${disk.usagePercent}%`,
          value: disk.usagePercent,
          threshold: THRESHOLDS.disk.warning,
          timestamp,
        });
      }
    }
  }

  return alerts;
}

// Collect all metrics for a server
export async function collectServerMetrics(serverId: string): Promise<ServerMetrics | null> {
  try {
    const server = await storage.getVpsServer(serverId);
    if (!server) return null;

    // Collect all metrics in parallel
    const [
      coreCount,
      loadAvg,
      memoryInfo,
      diskInfo,
      networkInfo,
      processInfo,
      dockerStats,
      uptimeInfo,
    ] = await Promise.all([
      executeSSH(server, "grep -c ^processor /proc/cpuinfo").catch(() => "1"),
      executeSSH(server, "head -1 /proc/loadavg").catch(() => "0 0 0"),
      executeSSH(server, "free -b").catch(() => ""),
      executeSSH(server, "df -B1").catch(() => ""),
      executeSSH(server, "cat /proc/net/dev").catch(() => ""),
      executeSSH(server, "ps aux --sort=-%mem | head -11").catch(() => ""),
      executeSSH(server, "docker stats --no-stream --format '{{json .}}' 2>/dev/null").catch(() => ""),
      executeSSH(server, "uptime -p 2>/dev/null || uptime").catch(() => "unknown"),
    ]);

    const cpu = parseCpuMetrics(coreCount, loadAvg);
    const memory = parseMemoryMetrics(memoryInfo);
    const disks = parseDiskMetrics(diskInfo);
    const network = parseNetworkMetrics(networkInfo);
    const topProcesses = parseProcesses(processInfo);
    const dockerContainers = parseDockerStats(dockerStats);

    const metrics: ServerMetrics = {
      serverId,
      serverName: server.name,
      timestamp: new Date(),
      online: true,
      uptime: uptimeInfo.trim(),
      cpu,
      memory,
      disks,
      network,
      topProcesses,
      dockerContainers,
      alerts: [],
    };

    // Generate alerts
    metrics.alerts = generateAlerts(metrics);

    return metrics;
  } catch (error: any) {
    return {
      serverId,
      serverName: "Unknown",
      timestamp: new Date(),
      online: false,
      uptime: "",
      cpu: { cores: 0, loadAverage: [0, 0, 0], usagePercent: 0, idle: 100 },
      memory: { totalBytes: 0, usedBytes: 0, freeBytes: 0, availableBytes: 0, usagePercent: 0, swapTotal: 0, swapUsed: 0, swapPercent: 0 },
      disks: [],
      network: [],
      topProcesses: [],
      dockerContainers: [],
      alerts: [{
        id: `offline-${Date.now()}`,
        severity: "critical",
        type: "connectivity",
        message: `Server is offline: ${error.message}`,
        value: 0,
        threshold: 0,
        timestamp: new Date(),
      }],
    };
  }
}

// AI-powered anomaly detection
export async function analyzeMetricsWithAI(
  metrics: ServerMetrics,
  historicalData?: ServerMetrics[]
): Promise<{ analysis: string; recommendations: string[]; severity: string }> {
  try {
    const prompt = `Analyze these server metrics and identify any anomalies or concerns:

Server: ${metrics.serverName}
Uptime: ${metrics.uptime}

CPU:
- Cores: ${metrics.cpu.cores}
- Load Average: ${metrics.cpu.loadAverage.join(", ")}
- Usage: ${metrics.cpu.usagePercent.toFixed(1)}%

Memory:
- Total: ${(metrics.memory.totalBytes / 1024 / 1024 / 1024).toFixed(2)} GB
- Used: ${(metrics.memory.usedBytes / 1024 / 1024 / 1024).toFixed(2)} GB (${metrics.memory.usagePercent.toFixed(1)}%)
- Swap Used: ${metrics.memory.swapPercent.toFixed(1)}%

Disks:
${metrics.disks.map(d => `- ${d.mountPoint}: ${d.usagePercent}% used`).join("\n")}

Top Processes by Memory:
${metrics.topProcesses.slice(0, 5).map(p => `- ${p.command.slice(0, 40)}: CPU ${p.cpu}%, MEM ${p.memory}%`).join("\n")}

Docker Containers: ${metrics.dockerContainers.length} running

Current Alerts: ${metrics.alerts.length > 0 ? metrics.alerts.map(a => a.message).join("; ") : "None"}

Provide:
1. Brief analysis (2-3 sentences)
2. Top 3 actionable recommendations
3. Overall severity: healthy, warning, or critical

Format as JSON: {"analysis": "...", "recommendations": ["...", "...", "..."], "severity": "..."}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
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
        // Parse failed, return default
      }
    }

    return {
      analysis: "Unable to analyze metrics at this time.",
      recommendations: ["Check server connectivity", "Review system logs"],
      severity: metrics.alerts.some(a => a.severity === "critical") ? "critical" : "healthy",
    };
  } catch {
    return {
      analysis: "AI analysis unavailable.",
      recommendations: [],
      severity: "healthy",
    };
  }
}

// Format bytes to human readable
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
