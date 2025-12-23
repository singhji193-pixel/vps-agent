/**
 * Shared types and utilities for tool executors
 */

import { Client as SSHClient } from "ssh2";

/**
 * Result returned from tool execution
 */
export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  requires_approval?: boolean;
  pending_command?: string;
  metadata?: Record<string, any>;
}

/**
 * SSH connection configuration
 */
export interface SSHConnection {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

/**
 * Execute SSH command with timeout and streaming capability
 */
export async function executeSSHCommand(
  conn: SSHConnection,
  command: string,
  timeoutSeconds: number = 30
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const client = new SSHClient();
    let stdout = "";
    let stderr = "";
    
    const timeout = setTimeout(() => {
      client.end();
      reject(new Error(`Command timed out after ${timeoutSeconds} seconds`));
    }, timeoutSeconds * 1000);

    client.on("ready", () => {
      client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          client.end();
          reject(err);
          return;
        }

        stream.on("close", (code: number) => {
          clearTimeout(timeout);
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
      clearTimeout(timeout);
      reject(err);
    });

    client.connect({
      host: conn.host,
      port: conn.port,
      username: conn.username,
      password: conn.password,
      privateKey: conn.privateKey,
    });
  });
}

/**
 * Base executor class that other executors extend
 */
export abstract class BaseExecutor {
  protected conn: SSHConnection;
  protected userId: string;
  protected serverId: string;

  constructor(conn: SSHConnection, userId: string, serverId: string) {
    this.conn = conn;
    this.userId = userId;
    this.serverId = serverId;
  }

  /**
   * Execute SSH command helper
   */
  protected async ssh(command: string, timeout: number = 30): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return executeSSHCommand(this.conn, command, timeout);
  }
}
