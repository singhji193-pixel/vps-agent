/**
 * Docker Operations Executor
 * Handles Docker containers and Docker Compose operations
 */

import { BaseExecutor, ToolResult } from "./types";

export class DockerExecutor extends BaseExecutor {
  /**
   * List Docker containers
   */
  async dockerList(input: {
    all?: boolean;
    filter?: string;
  }): Promise<ToolResult> {
    let command = "docker ps";
    if (input.all) command += " -a";
    command += ' --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"';
    
    if (input.filter) {
      command += ` --filter "name=${input.filter}"`;
    }
    
    // Also get resource usage
    command += ' && echo -e "\\n=== CONTAINER STATS ===" && docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null';
    
    const result = await this.ssh(command);
    
    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.stderr || undefined
    };
  }

  /**
   * Manage Docker containers
   */
  async dockerManage(input: {
    container: string;
    action: "start" | "stop" | "restart" | "remove" | "logs" | "inspect" | "exec";
    exec_command?: string;
  }): Promise<ToolResult> {
    const { container, action, exec_command } = input;
    
    let command: string;
    let dangerous = false;
    
    switch (action) {
      case "start":
        command = `docker start ${container}`;
        break;
      case "stop":
        command = `docker stop ${container}`;
        dangerous = true;
        break;
      case "restart":
        command = `docker restart ${container}`;
        dangerous = true;
        break;
      case "remove":
        command = `docker rm -f ${container}`;
        dangerous = true;
        break;
      case "logs":
        command = `docker logs --tail 100 ${container} 2>&1`;
        break;
      case "inspect":
        command = `docker inspect ${container}`;
        break;
      case "exec":
        if (!exec_command) {
          return { success: false, output: "", error: "exec_command required for exec action" };
        }
        command = `docker exec ${container} ${exec_command}`;
        break;
      default:
        return { success: false, output: "", error: `Invalid action: ${action}` };
    }
    
    if (dangerous) {
      return {
        success: false,
        output: "",
        requires_approval: true,
        pending_command: command,
        error: `⚠️ Docker ${action} requires approval:

Container: ${container}
Command: ${command}

Please confirm.`
      };
    }
    
    const result = await this.ssh(command, 60);
    
    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.stderr || undefined
    };
  }

  /**
   * Docker Compose operations
   */
  async dockerCompose(input: {
    path: string;
    action: "up" | "down" | "restart" | "pull" | "logs" | "ps" | "build";
    service?: string;
    detach?: boolean;
  }): Promise<ToolResult> {
    const { path, action, service, detach = true } = input;
    
    let command = `cd "${path}" && docker-compose`;
    let dangerous = false;
    
    switch (action) {
      case "up":
        command += detach ? " up -d" : " up";
        if (service) command += ` ${service}`;
        break;
      case "down":
        command += " down";
        dangerous = true;
        break;
      case "restart":
        command += " restart";
        if (service) command += ` ${service}`;
        dangerous = true;
        break;
      case "pull":
        command += " pull";
        if (service) command += ` ${service}`;
        break;
      case "logs":
        command += " logs --tail 100";
        if (service) command += ` ${service}`;
        break;
      case "ps":
        command += " ps";
        break;
      case "build":
        command += " build";
        if (service) command += ` ${service}`;
        break;
    }
    
    if (dangerous) {
      return {
        success: false,
        output: "",
        requires_approval: true,
        pending_command: command,
        error: `⚠️ Docker Compose ${action} requires approval:

Path: ${path}
Command: ${command}

Please confirm.`
      };
    }
    
    const result = await this.ssh(command, 120);
    
    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.stderr || undefined
    };
  }
}
