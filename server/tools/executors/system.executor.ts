/**
 * System Monitoring Executor
 * Handles system metrics, service status, logs, packages, processes
 */

import { BaseExecutor, ToolResult } from "./types";

export class SystemExecutor extends BaseExecutor {
  /**
   * Get comprehensive system metrics
   */
  async getSystemMetrics(input: {
    include_processes?: boolean;
    include_network?: boolean;
    include_disk_io?: boolean;
  }): Promise<ToolResult> {
    const commands = [
      "echo '=== SYSTEM INFO ==='",
      "uname -a",
      "echo ''",
      "echo '=== UPTIME ==='",
      "uptime",
      "echo ''",
      "echo '=== MEMORY ==='",
      "free -h",
      "echo ''",
      "echo '=== DISK USAGE ==='",
      "df -h",
      "echo ''",
      "echo '=== CPU INFO ==='",
      "grep -c ^processor /proc/cpuinfo && head -1 /proc/loadavg"
    ];

    if (input.include_processes) {
      commands.push(
        "echo ''",
        "echo '=== TOP PROCESSES ==='",
        "ps aux --sort=-%mem | head -10"
      );
    }

    if (input.include_network) {
      commands.push(
        "echo ''",
        "echo '=== NETWORK INTERFACES ==='",
        "ip -s link show 2>/dev/null || ifconfig 2>/dev/null || echo 'Network info unavailable'"
      );
    }

    if (input.include_disk_io) {
      commands.push(
        "echo ''",
        "echo '=== DISK I/O ==='",
        "iostat 2>/dev/null || echo 'iostat not available'"
      );
    }

    const result = await this.ssh(commands.join(" && "));
    
    return {
      success: result.exitCode === 0,
      output: result.stdout,
      metadata: { type: "system_metrics" }
    };
  }

  /**
   * Check systemd service status
   */
  async checkServiceStatus(input: {
    service_name: string;
    show_logs?: boolean;
    log_lines?: number;
  }): Promise<ToolResult> {
    const { service_name, show_logs = false, log_lines = 20 } = input;
    
    let command = `systemctl status ${service_name} 2>&1`;
    
    if (show_logs) {
      command += ` && echo -e "\\n=== RECENT LOGS ===" && journalctl -u ${service_name} -n ${log_lines} --no-pager 2>&1`;
    }
    
    const result = await this.ssh(command);
    
    return {
      success: true, // Service might be stopped, that's still valid output
      output: result.stdout + (result.stderr ? `\n${result.stderr}` : ""),
      metadata: { service: service_name }
    };
  }

  /**
   * Get logs from various sources
   */
  async getLogs(input: {
    source: "journalctl" | "file" | "docker";
    target: string;
    lines?: number;
    since?: string;
    grep?: string;
  }): Promise<ToolResult> {
    const { source, target, lines = 50, since, grep } = input;
    
    let command: string;
    
    switch (source) {
      case "journalctl":
        command = `journalctl -u ${target} -n ${lines} --no-pager`;
        if (since) command += ` --since "${since}"`;
        break;
      case "file":
        command = `tail -n ${lines} "${target}"`;
        break;
      case "docker":
        command = `docker logs --tail ${lines} ${target} 2>&1`;
        if (since) command += ` --since "${since}"`;
        break;
      default:
        return { success: false, output: "", error: "Invalid log source" };
    }
    
    if (grep) {
      command += ` | grep -i "${grep}"`;
    }
    
    const result = await this.ssh(command, 60);
    
    return {
      success: result.exitCode === 0,
      output: result.stdout + result.stderr,
      metadata: { source, target }
    };
  }

  /**
   * Manage system packages
   */
  async packageManage(input: {
    action: "update" | "upgrade" | "install" | "remove" | "search" | "list-upgradable";
    packages?: string[];
  }): Promise<ToolResult> {
    // Detect package manager
    const detectPkgMgr = await this.ssh(
      "which apt-get >/dev/null 2>&1 && echo 'apt' || (which yum >/dev/null 2>&1 && echo 'yum' || (which dnf >/dev/null 2>&1 && echo 'dnf' || echo 'unknown'))"
    );
    const pkgMgr = detectPkgMgr.stdout.trim();
    
    if (pkgMgr === "unknown") {
      return { success: false, output: "", error: "Could not detect package manager" };
    }
    
    let command: string;
    let dangerous = false;
    
    const { action, packages = [] } = input;
    const pkgList = packages.join(" ");
    
    switch (action) {
      case "update":
        command = pkgMgr === "apt" ? "apt-get update" : `${pkgMgr} check-update`;
        break;
      case "upgrade":
        command = pkgMgr === "apt" ? "apt-get upgrade -y" : `${pkgMgr} upgrade -y`;
        dangerous = true;
        break;
      case "install":
        if (!pkgList) return { success: false, output: "", error: "packages required for install" };
        command = pkgMgr === "apt" ? `apt-get install -y ${pkgList}` : `${pkgMgr} install -y ${pkgList}`;
        dangerous = true;
        break;
      case "remove":
        if (!pkgList) return { success: false, output: "", error: "packages required for remove" };
        command = pkgMgr === "apt" ? `apt-get remove -y ${pkgList}` : `${pkgMgr} remove -y ${pkgList}`;
        dangerous = true;
        break;
      case "search":
        if (!pkgList) return { success: false, output: "", error: "packages required for search" };
        command = pkgMgr === "apt" ? `apt-cache search ${pkgList}` : `${pkgMgr} search ${pkgList}`;
        break;
      case "list-upgradable":
        command = pkgMgr === "apt" ? "apt list --upgradable" : `${pkgMgr} list updates`;
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
        error: `⚠️ Package ${action} requires approval:

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

  /**
   * Manage processes
   */
  async processManage(input: {
    action: "list" | "kill" | "find" | "top";
    pid?: number;
    pattern?: string;
    signal?: "TERM" | "KILL" | "HUP" | "INT";
  }): Promise<ToolResult> {
    const { action, pid, pattern, signal = "TERM" } = input;
    
    let command: string;
    
    switch (action) {
      case "list":
        command = "ps aux --sort=-%mem | head -20";
        break;
      case "top":
        command = "top -bn1 | head -30";
        break;
      case "find":
        if (!pattern) return { success: false, output: "", error: "pattern required for find" };
        command = `pgrep -fl "${pattern}"`;
        break;
      case "kill":
        if (!pid) return { success: false, output: "", error: "pid required for kill" };
        return {
          success: false,
          output: "",
          requires_approval: true,
          pending_command: `kill -${signal} ${pid}`,
          error: `⚠️ Process kill requires approval:

PID: ${pid}
Signal: ${signal}

Please confirm.`
        };
      default:
        return { success: false, output: "", error: `Invalid action: ${action}` };
    }
    
    const result = await this.ssh(command);
    
    return {
      success: result.exitCode === 0,
      output: result.stdout,
    };
  }

  /**
   * Manage cron jobs
   */
  async cronManage(input: {
    action: "list" | "add" | "remove";
    schedule?: string;
    command?: string;
    user?: string;
  }): Promise<ToolResult> {
    const { action, schedule, command: cronCmd, user } = input;
    
    let cmd: string;
    
    switch (action) {
      case "list":
        cmd = user ? `crontab -u ${user} -l` : "crontab -l";
        break;
      case "add":
        if (!schedule || !cronCmd) {
          return { success: false, output: "", error: "schedule and command required for add" };
        }
        return {
          success: false,
          output: "",
          requires_approval: true,
          pending_command: `(crontab -l 2>/dev/null; echo "${schedule} ${cronCmd}") | crontab -`,
          error: `⚠️ Cron job addition requires approval:

Schedule: ${schedule}
Command: ${cronCmd}

Please confirm.`
        };
      case "remove":
        return {
          success: false,
          output: "",
          requires_approval: true,
          pending_command: "crontab -e",
          error: "⚠️ For removing cron jobs, please specify the exact line to remove or use crontab -e manually."
        };
      default:
        return { success: false, output: "", error: `Invalid action: ${action}` };
    }
    
    const result = await this.ssh(cmd);
    
    return {
      success: result.exitCode === 0,
      output: result.stdout || "No cron jobs found",
    };
  }

  /**
   * Network diagnostics
   */
  async networkDiagnose(input: {
    tool: "ping" | "traceroute" | "dig" | "nslookup" | "curl" | "netstat" | "ss" | "ip";
    target?: string;
    options?: string;
  }): Promise<ToolResult> {
    const { tool, target = "", options = "" } = input;
    
    let command: string;
    
    switch (tool) {
      case "ping":
        command = `ping -c 4 ${target}`;
        break;
      case "traceroute":
        command = `traceroute ${target} 2>&1 || tracepath ${target} 2>&1`;
        break;
      case "dig":
        command = `dig ${target} ${options}`;
        break;
      case "nslookup":
        command = `nslookup ${target}`;
        break;
      case "curl":
        command = `curl -sI ${options} ${target}`;
        break;
      case "netstat":
        command = "netstat -tulpn 2>/dev/null || ss -tulpn";
        break;
      case "ss":
        command = `ss ${options || "-tulpn"}`;
        break;
      case "ip":
        command = `ip ${options || "addr show"}`;
        break;
      default:
        return { success: false, output: "", error: `Invalid tool: ${tool}` };
    }
    
    const result = await this.ssh(command, 30);
    
    return {
      success: result.exitCode === 0,
      output: result.stdout + result.stderr,
    };
  }

  /**
   * Security audit checks
   */
  async securityAudit(input: {
    checks: Array<"ports" | "failed-logins" | "updates" | "firewall" | "ssh-config" | "users">;
  }): Promise<ToolResult> {
    const commands: string[] = [];
    
    for (const check of input.checks) {
      switch (check) {
        case "ports":
          commands.push(
            "echo '=== OPEN PORTS ==='",
            "ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null"
          );
          break;
        case "failed-logins":
          commands.push(
            "echo -e '\\n=== FAILED SSH LOGINS (last 20) ==='",
            "grep 'Failed password' /var/log/auth.log 2>/dev/null | tail -20 || journalctl -u sshd | grep 'Failed' | tail -20"
          );
          break;
        case "updates":
          commands.push(
            "echo -e '\\n=== AVAILABLE UPDATES ==='",
            "apt list --upgradable 2>/dev/null | head -20 || yum check-update 2>/dev/null | head -20 || echo 'Package manager not detected'"
          );
          break;
        case "firewall":
          commands.push(
            "echo -e '\\n=== FIREWALL STATUS ==='",
            "ufw status verbose 2>/dev/null || iptables -L -n 2>/dev/null | head -30 || firewall-cmd --list-all 2>/dev/null || echo 'No firewall detected'"
          );
          break;
        case "ssh-config":
          commands.push(
            "echo -e '\\n=== SSH CONFIG ==='",
            "grep -E '^(PermitRootLogin|PasswordAuthentication|Port|AllowUsers|AllowGroups)' /etc/ssh/sshd_config"
          );
          break;
        case "users":
          commands.push(
            "echo -e '\\n=== USERS WITH LOGIN SHELL ==='",
            "cat /etc/passwd | grep -v nologin | grep -v false"
          );
          break;
      }
    }
    
    const result = await this.ssh(commands.join(" && "), 60);
    
    return {
      success: result.exitCode === 0,
      output: result.stdout,
      metadata: { checks: input.checks }
    };
  }
}
