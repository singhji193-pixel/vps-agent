/**
 * Infrastructure Management Service
 * 
 * Provides management for:
 * - Docker containers and images
 * - Nginx sites and configuration
 * - SSL certificates (Let's Encrypt)
 */

import { Client as SSHClient } from "ssh2";
import { storage } from "./storage";
import { createDecipheriv, scryptSync } from "crypto";

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

// Execute SSH command
async function executeSSH(
  server: any,
  command: string,
  timeout: number = 30000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const client = new SSHClient();
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      client.end();
      reject(new Error("SSH timeout"));
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
    });
  });
}

// ============ DOCKER MANAGEMENT ============

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
  created: string;
  size: string;
}

export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created: string;
}

export interface DockerNetwork {
  id: string;
  name: string;
  driver: string;
  scope: string;
}

export interface DockerVolume {
  name: string;
  driver: string;
  mountpoint: string;
}

// List containers
export async function listContainers(serverId: string, all: boolean = true): Promise<DockerContainer[]> {
  const server = await storage.getVpsServer(serverId);
  if (!server) throw new Error("Server not found");

  const flag = all ? "-a" : "";
  const result = await executeSSH(
    server,
    `docker ps ${flag} --format '{{json .}}' 2>/dev/null`
  );

  if (result.exitCode !== 0) {
    return [];
  }

  return result.stdout
    .trim()
    .split("\n")
    .filter((line) => line)
    .map((line) => {
      try {
        const c = JSON.parse(line);
        return {
          id: c.ID,
          name: c.Names,
          image: c.Image,
          status: c.Status,
          state: c.State,
          ports: c.Ports,
          created: c.CreatedAt,
          size: c.Size || "",
        };
      } catch {
        return null;
      }
    })
    .filter((c): c is DockerContainer => c !== null);
}

// List images
export async function listImages(serverId: string): Promise<DockerImage[]> {
  const server = await storage.getVpsServer(serverId);
  if (!server) throw new Error("Server not found");

  const result = await executeSSH(
    server,
    `docker images --format '{{json .}}' 2>/dev/null`
  );

  if (result.exitCode !== 0) {
    return [];
  }

  return result.stdout
    .trim()
    .split("\n")
    .filter((line) => line)
    .map((line) => {
      try {
        const i = JSON.parse(line);
        return {
          id: i.ID,
          repository: i.Repository,
          tag: i.Tag,
          size: i.Size,
          created: i.CreatedAt,
        };
      } catch {
        return null;
      }
    })
    .filter((i): i is DockerImage => i !== null);
}

// Container actions
export async function containerAction(
  serverId: string,
  containerId: string,
  action: "start" | "stop" | "restart" | "pause" | "unpause" | "remove" | "logs"
): Promise<{ success: boolean; output: string }> {
  const server = await storage.getVpsServer(serverId);
  if (!server) throw new Error("Server not found");

  let command: string;
  let timeout = 30000;

  switch (action) {
    case "start":
      command = `docker start ${containerId}`;
      break;
    case "stop":
      command = `docker stop ${containerId}`;
      timeout = 60000;
      break;
    case "restart":
      command = `docker restart ${containerId}`;
      timeout = 60000;
      break;
    case "pause":
      command = `docker pause ${containerId}`;
      break;
    case "unpause":
      command = `docker unpause ${containerId}`;
      break;
    case "remove":
      command = `docker rm -f ${containerId}`;
      break;
    case "logs":
      command = `docker logs --tail 100 ${containerId}`;
      break;
    default:
      throw new Error("Invalid action");
  }

  const result = await executeSSH(server, command, timeout);

  return {
    success: result.exitCode === 0,
    output: result.stdout + result.stderr,
  };
}

// Pull image
export async function pullImage(
  serverId: string,
  image: string
): Promise<{ success: boolean; output: string }> {
  const server = await storage.getVpsServer(serverId);
  if (!server) throw new Error("Server not found");

  const result = await executeSSH(server, `docker pull ${image}`, 300000);

  return {
    success: result.exitCode === 0,
    output: result.stdout + result.stderr,
  };
}

// Run container
export async function runContainer(
  serverId: string,
  options: {
    image: string;
    name?: string;
    ports?: string[];
    env?: Record<string, string>;
    volumes?: string[];
    network?: string;
    restart?: string;
    detach?: boolean;
  }
): Promise<{ success: boolean; containerId: string; output: string }> {
  const server = await storage.getVpsServer(serverId);
  if (!server) throw new Error("Server not found");

  let command = "docker run";

  if (options.detach !== false) command += " -d";
  if (options.name) command += ` --name ${options.name}`;
  if (options.restart) command += ` --restart ${options.restart}`;
  if (options.network) command += ` --network ${options.network}`;

  if (options.ports) {
    for (const port of options.ports) {
      command += ` -p ${port}`;
    }
  }

  if (options.env) {
    for (const [key, value] of Object.entries(options.env)) {
      command += ` -e ${key}="${value}"`;
    }
  }

  if (options.volumes) {
    for (const vol of options.volumes) {
      command += ` -v ${vol}`;
    }
  }

  command += ` ${options.image}`;

  const result = await executeSSH(server, command, 120000);

  return {
    success: result.exitCode === 0,
    containerId: result.stdout.trim(),
    output: result.stdout + result.stderr,
  };
}

// Docker Compose operations
export async function dockerCompose(
  serverId: string,
  action: "up" | "down" | "restart" | "ps" | "logs",
  path: string
): Promise<{ success: boolean; output: string }> {
  const server = await storage.getVpsServer(serverId);
  if (!server) throw new Error("Server not found");

  let command: string;
  let timeout = 120000;

  switch (action) {
    case "up":
      command = `cd ${path} && docker-compose up -d`;
      break;
    case "down":
      command = `cd ${path} && docker-compose down`;
      break;
    case "restart":
      command = `cd ${path} && docker-compose restart`;
      break;
    case "ps":
      command = `cd ${path} && docker-compose ps`;
      break;
    case "logs":
      command = `cd ${path} && docker-compose logs --tail 50`;
      break;
    default:
      throw new Error("Invalid action");
  }

  const result = await executeSSH(server, command, timeout);

  return {
    success: result.exitCode === 0,
    output: result.stdout + result.stderr,
  };
}

// ============ NGINX MANAGEMENT ============

export interface NginxSite {
  name: string;
  enabled: boolean;
  configPath: string;
}

export interface NginxStatus {
  running: boolean;
  version: string;
  configTest: boolean;
  sitesAvailable: string[];
  sitesEnabled: string[];
}

// Get Nginx status
export async function getNginxStatus(serverId: string): Promise<NginxStatus> {
  const server = await storage.getVpsServer(serverId);
  if (!server) throw new Error("Server not found");

  const [versionResult, statusResult, configResult, availableResult, enabledResult] = await Promise.all([
    executeSSH(server, "nginx -v 2>&1").catch(() => ({ stdout: "", stderr: "", exitCode: 1 })),
    executeSSH(server, "systemctl is-active nginx").catch(() => ({ stdout: "inactive", stderr: "", exitCode: 1 })),
    executeSSH(server, "nginx -t 2>&1").catch(() => ({ stdout: "", stderr: "failed", exitCode: 1 })),
    executeSSH(server, "ls /etc/nginx/sites-available/ 2>/dev/null").catch(() => ({ stdout: "", stderr: "", exitCode: 1 })),
    executeSSH(server, "ls /etc/nginx/sites-enabled/ 2>/dev/null").catch(() => ({ stdout: "", stderr: "", exitCode: 1 })),
  ]);

  return {
    running: statusResult.stdout.trim() === "active",
    version: versionResult.stderr.replace("nginx version: ", "").trim(),
    configTest: configResult.exitCode === 0,
    sitesAvailable: availableResult.stdout.trim().split("\n").filter((s) => s && s !== "default"),
    sitesEnabled: enabledResult.stdout.trim().split("\n").filter((s) => s && s !== "default"),
  };
}

// List Nginx sites
export async function listNginxSites(serverId: string): Promise<NginxSite[]> {
  const status = await getNginxStatus(serverId);

  return status.sitesAvailable.map((name) => ({
    name,
    enabled: status.sitesEnabled.includes(name),
    configPath: `/etc/nginx/sites-available/${name}`,
  }));
}

// Get site config
export async function getNginxSiteConfig(serverId: string, siteName: string): Promise<string> {
  const server = await storage.getVpsServer(serverId);
  if (!server) throw new Error("Server not found");

  const result = await executeSSH(server, `cat /etc/nginx/sites-available/${siteName}`);
  return result.stdout;
}

// Enable/disable site
export async function toggleNginxSite(
  serverId: string,
  siteName: string,
  enable: boolean
): Promise<{ success: boolean; output: string }> {
  const server = await storage.getVpsServer(serverId);
  if (!server) throw new Error("Server not found");

  let command: string;
  if (enable) {
    command = `sudo ln -sf /etc/nginx/sites-available/${siteName} /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx`;
  } else {
    command = `sudo rm -f /etc/nginx/sites-enabled/${siteName} && sudo nginx -t && sudo systemctl reload nginx`;
  }

  const result = await executeSSH(server, command);

  return {
    success: result.exitCode === 0,
    output: result.stdout + result.stderr,
  };
}

// Create new site config
export async function createNginxSite(
  serverId: string,
  siteName: string,
  config: string
): Promise<{ success: boolean; output: string }> {
  const server = await storage.getVpsServer(serverId);
  if (!server) throw new Error("Server not found");

  // Escape the config for shell
  const escapedConfig = config.replace(/'/g, "'\\''");
  const command = `echo '${escapedConfig}' | sudo tee /etc/nginx/sites-available/${siteName} && sudo nginx -t`;

  const result = await executeSSH(server, command);

  return {
    success: result.exitCode === 0,
    output: result.stdout + result.stderr,
  };
}

// Reload Nginx
export async function reloadNginx(serverId: string): Promise<{ success: boolean; output: string }> {
  const server = await storage.getVpsServer(serverId);
  if (!server) throw new Error("Server not found");

  const result = await executeSSH(server, "sudo nginx -t && sudo systemctl reload nginx");

  return {
    success: result.exitCode === 0,
    output: result.stdout + result.stderr,
  };
}

// Generate Nginx config template
export function generateNginxConfig(options: {
  domain: string;
  proxyPort?: number;
  staticRoot?: string;
  ssl?: boolean;
}): string {
  const { domain, proxyPort, staticRoot, ssl } = options;

  if (proxyPort) {
    // Reverse proxy config
    return `server {
    listen 80;
    server_name ${domain};

    location / {
        proxy_pass http://127.0.0.1:${proxyPort};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}`;
  } else if (staticRoot) {
    // Static site config
    return `server {
    listen 80;
    server_name ${domain};
    root ${staticRoot};
    index index.html index.htm;

    location / {
        try_files $uri $uri/ =404;
    }
}`;
  }

  return "";
}

// ============ SSL CERTIFICATE MANAGEMENT ============

export interface SSLCertificate {
  domain: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  autoRenew: boolean;
}

// Check if certbot is installed
export async function checkCertbot(serverId: string): Promise<boolean> {
  const server = await storage.getVpsServer(serverId);
  if (!server) throw new Error("Server not found");

  const result = await executeSSH(server, "which certbot");
  return result.exitCode === 0;
}

// Install certbot
export async function installCertbot(serverId: string): Promise<{ success: boolean; output: string }> {
  const server = await storage.getVpsServer(serverId);
  if (!server) throw new Error("Server not found");

  const command = `sudo apt-get update && sudo apt-get install -y certbot python3-certbot-nginx`;
  const result = await executeSSH(server, command, 180000);

  return {
    success: result.exitCode === 0,
    output: result.stdout + result.stderr,
  };
}

// List SSL certificates
export async function listSSLCertificates(serverId: string): Promise<SSLCertificate[]> {
  const server = await storage.getVpsServer(serverId);
  if (!server) throw new Error("Server not found");

  const result = await executeSSH(server, "sudo certbot certificates 2>/dev/null");

  if (result.exitCode !== 0 || !result.stdout.includes("Certificate Name:")) {
    return [];
  }

  const certs: SSLCertificate[] = [];
  const blocks = result.stdout.split("Certificate Name:");

  for (const block of blocks.slice(1)) {
    const lines = block.trim().split("\n");
    const domain = lines[0]?.trim() || "";
    
    let validTo = "";
    let issuer = "Let's Encrypt";

    for (const line of lines) {
      if (line.includes("Expiry Date:")) {
        validTo = line.split("Expiry Date:")[1]?.trim().split(" ")[0] || "";
      }
    }

    if (domain) {
      const expiryDate = new Date(validTo);
      const daysRemaining = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      certs.push({
        domain,
        issuer,
        validFrom: "",
        validTo,
        daysRemaining,
        autoRenew: true,
      });
    }
  }

  return certs;
}

// Request new SSL certificate
export async function requestSSLCertificate(
  serverId: string,
  domain: string,
  email: string
): Promise<{ success: boolean; output: string }> {
  const server = await storage.getVpsServer(serverId);
  if (!server) throw new Error("Server not found");

  const command = `sudo certbot --nginx -d ${domain} --non-interactive --agree-tos --email ${email}`;
  const result = await executeSSH(server, command, 120000);

  return {
    success: result.exitCode === 0,
    output: result.stdout + result.stderr,
  };
}

// Renew certificates
export async function renewSSLCertificates(serverId: string): Promise<{ success: boolean; output: string }> {
  const server = await storage.getVpsServer(serverId);
  if (!server) throw new Error("Server not found");

  const result = await executeSSH(server, "sudo certbot renew --dry-run", 120000);

  return {
    success: result.exitCode === 0,
    output: result.stdout + result.stderr,
  };
}

// Revoke certificate
export async function revokeSSLCertificate(
  serverId: string,
  domain: string
): Promise<{ success: boolean; output: string }> {
  const server = await storage.getVpsServer(serverId);
  if (!server) throw new Error("Server not found");

  const command = `sudo certbot revoke --cert-name ${domain} --non-interactive`;
  const result = await executeSSH(server, command);

  return {
    success: result.exitCode === 0,
    output: result.stdout + result.stderr,
  };
}
