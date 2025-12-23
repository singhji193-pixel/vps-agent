/**
 * VPS Agent Tool Calling System
 * 
 * This module defines tools that Claude can use to autonomously manage VPS servers.
 * Inspired by Cursor/Emergent.sh agentic capabilities.
 */

import type { Tool } from "@anthropic-ai/sdk/resources/messages";

// Tool definitions for Claude's function calling
export const VPS_TOOLS: Tool[] = [
  // === SSH Command Execution ===
  {
    name: "execute_command",
    description: `Execute a shell command on the connected VPS server. Use this for system administration tasks like checking status, installing packages, managing services, viewing logs, etc. 
    
IMPORTANT SAFETY RULES:
- NEVER execute destructive commands (rm -rf, dd, mkfs, etc.) without explicit user approval
- For potentially dangerous commands, set requires_approval to true
- Always explain what the command will do before executing`,
    input_schema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute"
        },
        requires_approval: {
          type: "boolean",
          description: "Set to true for dangerous/destructive commands that need user approval before execution"
        },
        explanation: {
          type: "string",
          description: "Brief explanation of what this command does and why"
        },
        timeout_seconds: {
          type: "number",
          description: "Command timeout in seconds (default: 30, max: 300)"
        }
      },
      required: ["command", "explanation"]
    }
  },

  // === File Operations ===
  {
    name: "read_file",
    description: "Read the contents of a file on the VPS server. Useful for viewing configurations, logs, or any text file.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Absolute path to the file to read"
        },
        start_line: {
          type: "number",
          description: "Starting line number (1-indexed, optional)"
        },
        end_line: {
          type: "number",
          description: "Ending line number (inclusive, optional)"
        },
        max_lines: {
          type: "number",
          description: "Maximum number of lines to return (default: 500)"
        }
      },
      required: ["path"]
    }
  },
  {
    name: "write_file",
    description: "Write or create a file on the VPS server. Use for creating configurations, scripts, or updating files. ALWAYS requires user approval.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Absolute path where the file should be written"
        },
        content: {
          type: "string",
          description: "Content to write to the file"
        },
        mode: {
          type: "string",
          description: "File permission mode (e.g., '644', '755')"
        },
        backup: {
          type: "boolean",
          description: "Create a backup of existing file before overwriting (default: true)"
        }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "edit_file",
    description: "Make precise edits to an existing file using search and replace. Safer than write_file for modifications.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Absolute path to the file to edit"
        },
        edits: {
          type: "array",
          description: "Array of edit operations",
          items: {
            type: "object",
            properties: {
              old_text: {
                type: "string",
                description: "Exact text to find and replace"
              },
              new_text: {
                type: "string",
                description: "Text to replace with"
              }
            },
            required: ["old_text", "new_text"]
          }
        }
      },
      required: ["path", "edits"]
    }
  },
  {
    name: "list_directory",
    description: "List files and directories at a given path with details (size, permissions, timestamps)",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Directory path to list (default: current directory)"
        },
        show_hidden: {
          type: "boolean",
          description: "Include hidden files (starting with .)"
        },
        recursive: {
          type: "boolean",
          description: "List recursively (be careful with large directories)"
        }
      },
      required: ["path"]
    }
  },

  // === System Monitoring ===
  {
    name: "get_system_metrics",
    description: "Get current system resource usage: CPU, memory, disk, network, and top processes",
    input_schema: {
      type: "object" as const,
      properties: {
        include_processes: {
          type: "boolean",
          description: "Include top resource-consuming processes"
        },
        include_network: {
          type: "boolean",
          description: "Include network interface statistics"
        },
        include_disk_io: {
          type: "boolean",
          description: "Include disk I/O statistics"
        }
      },
      required: []
    }
  },
  {
    name: "check_service_status",
    description: "Check the status of a systemd service",
    input_schema: {
      type: "object" as const,
      properties: {
        service_name: {
          type: "string",
          description: "Name of the service (e.g., 'nginx', 'docker', 'postgresql')"
        },
        show_logs: {
          type: "boolean",
          description: "Include recent logs from journalctl"
        },
        log_lines: {
          type: "number",
          description: "Number of log lines to include (default: 20)"
        }
      },
      required: ["service_name"]
    }
  },
  {
    name: "get_logs",
    description: "Retrieve logs from various sources (journalctl, log files, Docker containers)",
    input_schema: {
      type: "object" as const,
      properties: {
        source: {
          type: "string",
          description: "Log source: 'journalctl', 'file', 'docker'",
          enum: ["journalctl", "file", "docker"]
        },
        target: {
          type: "string",
          description: "Service name for journalctl, file path for file, container name for docker"
        },
        lines: {
          type: "number",
          description: "Number of lines to retrieve (default: 50)"
        },
        since: {
          type: "string",
          description: "Time filter (e.g., '1 hour ago', '2024-01-01')"
        },
        grep: {
          type: "string",
          description: "Filter logs containing this pattern"
        }
      },
      required: ["source", "target"]
    }
  },

  // === Docker Management ===
  {
    name: "docker_list",
    description: "List Docker containers with their status, ports, and resource usage",
    input_schema: {
      type: "object" as const,
      properties: {
        all: {
          type: "boolean",
          description: "Include stopped containers"
        },
        filter: {
          type: "string",
          description: "Filter by name pattern"
        }
      },
      required: []
    }
  },
  {
    name: "docker_manage",
    description: "Manage Docker containers: start, stop, restart, remove",
    input_schema: {
      type: "object" as const,
      properties: {
        container: {
          type: "string",
          description: "Container name or ID"
        },
        action: {
          type: "string",
          description: "Action to perform",
          enum: ["start", "stop", "restart", "remove", "logs", "inspect", "exec"]
        },
        exec_command: {
          type: "string",
          description: "Command to execute inside container (only for exec action)"
        }
      },
      required: ["container", "action"]
    }
  },
  {
    name: "docker_compose",
    description: "Manage Docker Compose services",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Path to docker-compose.yml directory"
        },
        action: {
          type: "string",
          description: "Action to perform",
          enum: ["up", "down", "restart", "pull", "logs", "ps", "build"]
        },
        service: {
          type: "string",
          description: "Specific service name (optional)"
        },
        detach: {
          type: "boolean",
          description: "Run in detached mode for 'up' action"
        }
      },
      required: ["path", "action"]
    }
  },

  // === Web Server Management ===
  {
    name: "nginx_manage",
    description: "Manage Nginx: test config, reload, list sites, enable/disable sites",
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Action to perform",
          enum: ["test", "reload", "restart", "list-sites", "enable-site", "disable-site", "show-config"]
        },
        site_name: {
          type: "string",
          description: "Site name for enable/disable actions"
        }
      },
      required: ["action"]
    }
  },

  // === Security & SSL ===
  {
    name: "ssl_certificate",
    description: "Manage SSL certificates with Let's Encrypt / Certbot",
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Action to perform",
          enum: ["list", "obtain", "renew", "revoke", "check-expiry"]
        },
        domain: {
          type: "string",
          description: "Domain name for obtain/renew actions"
        },
        email: {
          type: "string",
          description: "Email for Let's Encrypt registration"
        }
      },
      required: ["action"]
    }
  },
  {
    name: "security_audit",
    description: "Run security checks on the server: open ports, failed logins, updates available",
    input_schema: {
      type: "object" as const,
      properties: {
        checks: {
          type: "array",
          description: "Checks to perform",
          items: {
            type: "string",
            enum: ["ports", "failed-logins", "updates", "firewall", "ssh-config", "users"]
          }
        }
      },
      required: ["checks"]
    }
  },

  // === Database Operations ===
  {
    name: "database_query",
    description: "Execute a database query (PostgreSQL, MySQL, or SQLite). Only SELECT queries are allowed without approval.",
    input_schema: {
      type: "object" as const,
      properties: {
        db_type: {
          type: "string",
          description: "Database type",
          enum: ["postgresql", "mysql", "sqlite"]
        },
        query: {
          type: "string",
          description: "SQL query to execute"
        },
        database: {
          type: "string",
          description: "Database name"
        },
        requires_approval: {
          type: "boolean",
          description: "Set to true for non-SELECT queries"
        }
      },
      required: ["db_type", "query", "database"]
    }
  },

  // === Package Management ===
  {
    name: "package_manage",
    description: "Manage system packages (apt, yum, dnf)",
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Action to perform",
          enum: ["update", "upgrade", "install", "remove", "search", "list-upgradable"]
        },
        packages: {
          type: "array",
          description: "Package names for install/remove",
          items: { type: "string" }
        }
      },
      required: ["action"]
    }
  },

  // === Network Tools ===
  {
    name: "network_diagnose",
    description: "Diagnose network issues: connectivity, DNS, ports, routes",
    input_schema: {
      type: "object" as const,
      properties: {
        tool: {
          type: "string",
          description: "Diagnostic tool to use",
          enum: ["ping", "traceroute", "dig", "nslookup", "curl", "netstat", "ss", "ip"]
        },
        target: {
          type: "string",
          description: "Target host, IP, or URL"
        },
        options: {
          type: "string",
          description: "Additional options for the tool"
        }
      },
      required: ["tool"]
    }
  },

  // === Backup & Restore (Restic-based) ===
  {
    name: "backup_create",
    description: "Create a backup of files, directories, or databases using restic",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          description: "Backup type",
          enum: ["files", "database", "full"]
        },
        source: {
          type: "string",
          description: "Source path or database name"
        },
        destination: {
          type: "string",
          description: "Destination path for backup"
        },
        compress: {
          type: "boolean",
          description: "Compress the backup (default: true)"
        }
      },
      required: ["type", "source", "destination"]
    }
  },
  {
    name: "restic_init",
    description: "Initialize a new restic backup repository (local, S3, SFTP, or B2)",
    input_schema: {
      type: "object" as const,
      properties: {
        repositoryType: {
          type: "string",
          description: "Repository type",
          enum: ["local", "s3", "sftp", "b2"]
        },
        repositoryPath: {
          type: "string",
          description: "Repository path (local path, s3:bucket/path, sftp:user@host:/path, b2:bucket:path)"
        },
        password: {
          type: "string",
          description: "Repository encryption password"
        }
      },
      required: ["repositoryType", "repositoryPath", "password"]
    }
  },
  {
    name: "restic_backup",
    description: "Create an incremental backup using restic with deduplication and encryption",
    input_schema: {
      type: "object" as const,
      properties: {
        configId: {
          type: "string",
          description: "Backup configuration ID"
        },
        paths: {
          type: "array",
          items: { type: "string" },
          description: "Paths to backup (overrides config if provided)"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags to add to the snapshot"
        },
        excludePatterns: {
          type: "array",
          items: { type: "string" },
          description: "Patterns to exclude (e.g., '*.log', 'node_modules')"
        }
      },
      required: ["configId"]
    }
  },
  {
    name: "restic_list",
    description: "List all backup snapshots in a restic repository",
    input_schema: {
      type: "object" as const,
      properties: {
        configId: {
          type: "string",
          description: "Backup configuration ID"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Filter by tags"
        },
        paths: {
          type: "array",
          items: { type: "string" },
          description: "Filter by paths"
        },
        last: {
          type: "number",
          description: "Show only last N snapshots"
        }
      },
      required: ["configId"]
    }
  },
  {
    name: "restic_restore",
    description: "Restore files from a restic backup snapshot",
    input_schema: {
      type: "object" as const,
      properties: {
        configId: {
          type: "string",
          description: "Backup configuration ID"
        },
        snapshotId: {
          type: "string",
          description: "Snapshot ID to restore (use 'latest' for most recent)"
        },
        targetPath: {
          type: "string",
          description: "Where to restore files (default: original location)"
        },
        includePaths: {
          type: "array",
          items: { type: "string" },
          description: "Only restore specific paths from snapshot"
        },
        excludePaths: {
          type: "array",
          items: { type: "string" },
          description: "Exclude specific paths from restore"
        }
      },
      required: ["configId", "snapshotId"]
    }
  },
  {
    name: "restic_verify",
    description: "Verify the integrity of backup data in a restic repository",
    input_schema: {
      type: "object" as const,
      properties: {
        configId: {
          type: "string",
          description: "Backup configuration ID"
        },
        readData: {
          type: "boolean",
          description: "Also verify actual backup data (slower but thorough)"
        }
      },
      required: ["configId"]
    }
  },
  {
    name: "restic_prune",
    description: "Remove old snapshots according to retention policy and free disk space",
    input_schema: {
      type: "object" as const,
      properties: {
        configId: {
          type: "string",
          description: "Backup configuration ID"
        },
        keepDaily: {
          type: "number",
          description: "Keep N daily snapshots (default from config)"
        },
        keepWeekly: {
          type: "number",
          description: "Keep N weekly snapshots (default from config)"
        },
        keepMonthly: {
          type: "number",
          description: "Keep N monthly snapshots (default from config)"
        },
        keepYearly: {
          type: "number",
          description: "Keep N yearly snapshots (default from config)"
        },
        dryRun: {
          type: "boolean",
          description: "Preview what would be pruned without actually deleting"
        }
      },
      required: ["configId"]
    }
  },
  {
    name: "restic_stats",
    description: "Show statistics about a restic repository (size, snapshots, etc.)",
    input_schema: {
      type: "object" as const,
      properties: {
        configId: {
          type: "string",
          description: "Backup configuration ID"
        },
        mode: {
          type: "string",
          description: "Stats mode",
          enum: ["restore-size", "files-by-contents", "blobs-per-file", "raw-data"]
        }
      },
      required: ["configId"]
    }
  },
  {
    name: "restic_diff",
    description: "Show differences between two backup snapshots",
    input_schema: {
      type: "object" as const,
      properties: {
        configId: {
          type: "string",
          description: "Backup configuration ID"
        },
        snapshotId1: {
          type: "string",
          description: "First snapshot ID"
        },
        snapshotId2: {
          type: "string",
          description: "Second snapshot ID (default: latest)"
        }
      },
      required: ["configId", "snapshotId1"]
    }
  },
  {
    name: "restic_mount",
    description: "Mount a restic repository as a FUSE filesystem for browsing",
    input_schema: {
      type: "object" as const,
      properties: {
        configId: {
          type: "string",
          description: "Backup configuration ID"
        },
        mountPath: {
          type: "string",
          description: "Path to mount the repository"
        },
        snapshotId: {
          type: "string",
          description: "Mount specific snapshot (optional)"
        }
      },
      required: ["configId", "mountPath"]
    }
  },

  // === Process Management ===
  {
    name: "process_manage",
    description: "Manage system processes: list, kill, monitor",
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Action to perform",
          enum: ["list", "kill", "find", "top"]
        },
        pid: {
          type: "number",
          description: "Process ID for kill action"
        },
        pattern: {
          type: "string",
          description: "Pattern to search for with find action"
        },
        signal: {
          type: "string",
          description: "Signal to send (default: TERM)",
          enum: ["TERM", "KILL", "HUP", "INT"]
        }
      },
      required: ["action"]
    }
  },

  // === Cron Job Management ===
  {
    name: "cron_manage",
    description: "Manage cron jobs: list, add, remove scheduled tasks",
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Action to perform",
          enum: ["list", "add", "remove"]
        },
        schedule: {
          type: "string",
          description: "Cron schedule expression (e.g., '0 * * * *' for hourly)"
        },
        command: {
          type: "string",
          description: "Command to schedule"
        },
        user: {
          type: "string",
          description: "User for the cron job (default: current user)"
        }
      },
      required: ["action"]
    }
  },

  // === GitHub Integration ===
  {
    name: "github_search_repos",
    description: "Search for GitHub repositories by name, description, or topic",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query (e.g., 'vps-agent', 'language:typescript', 'topic:docker')"
        },
        sort: {
          type: "string",
          description: "Sort by",
          enum: ["stars", "forks", "updated", "best-match"]
        },
        limit: {
          type: "number",
          description: "Max results (default: 10)"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "github_get_repo",
    description: "Get details about a GitHub repository including description, stats, and recent activity",
    input_schema: {
      type: "object" as const,
      properties: {
        owner: {
          type: "string",
          description: "Repository owner (username or org)"
        },
        repo: {
          type: "string",
          description: "Repository name"
        }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "github_list_contents",
    description: "List files and directories in a GitHub repository path",
    input_schema: {
      type: "object" as const,
      properties: {
        owner: {
          type: "string",
          description: "Repository owner"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        path: {
          type: "string",
          description: "Path within the repo (empty for root)"
        },
        branch: {
          type: "string",
          description: "Branch name (default: main)"
        }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "github_get_file",
    description: "Get the contents of a file from a GitHub repository",
    input_schema: {
      type: "object" as const,
      properties: {
        owner: {
          type: "string",
          description: "Repository owner"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        path: {
          type: "string",
          description: "File path within the repo"
        },
        branch: {
          type: "string",
          description: "Branch name (default: main)"
        }
      },
      required: ["owner", "repo", "path"]
    }
  },
  {
    name: "github_search_code",
    description: "Search for code within GitHub repositories",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Code search query (e.g., 'function deploy repo:owner/repo')"
        },
        limit: {
          type: "number",
          description: "Max results (default: 10)"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "github_list_commits",
    description: "List recent commits in a repository",
    input_schema: {
      type: "object" as const,
      properties: {
        owner: {
          type: "string",
          description: "Repository owner"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        branch: {
          type: "string",
          description: "Branch name (default: main)"
        },
        limit: {
          type: "number",
          description: "Number of commits (default: 10)"
        }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "github_list_branches",
    description: "List all branches in a repository",
    input_schema: {
      type: "object" as const,
      properties: {
        owner: {
          type: "string",
          description: "Repository owner"
        },
        repo: {
          type: "string",
          description: "Repository name"
        }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "github_list_issues",
    description: "List issues in a repository",
    input_schema: {
      type: "object" as const,
      properties: {
        owner: {
          type: "string",
          description: "Repository owner"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        state: {
          type: "string",
          description: "Filter by state",
          enum: ["open", "closed", "all"]
        },
        limit: {
          type: "number",
          description: "Max results (default: 10)"
        }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "github_create_issue",
    description: "Create a new issue in a repository",
    input_schema: {
      type: "object" as const,
      properties: {
        owner: {
          type: "string",
          description: "Repository owner"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        title: {
          type: "string",
          description: "Issue title"
        },
        body: {
          type: "string",
          description: "Issue body/description"
        },
        labels: {
          type: "array",
          description: "Labels to add",
          items: { type: "string" }
        }
      },
      required: ["owner", "repo", "title"]
    }
  },
  {
    name: "github_list_pull_requests",
    description: "List pull requests in a repository",
    input_schema: {
      type: "object" as const,
      properties: {
        owner: {
          type: "string",
          description: "Repository owner"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        state: {
          type: "string",
          description: "Filter by state",
          enum: ["open", "closed", "all"]
        },
        limit: {
          type: "number",
          description: "Max results (default: 10)"
        }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "github_create_file",
    description: "Create or update a file in a GitHub repository",
    input_schema: {
      type: "object" as const,
      properties: {
        owner: {
          type: "string",
          description: "Repository owner"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        path: {
          type: "string",
          description: "File path"
        },
        content: {
          type: "string",
          description: "File content"
        },
        message: {
          type: "string",
          description: "Commit message"
        },
        branch: {
          type: "string",
          description: "Branch name (default: main)"
        }
      },
      required: ["owner", "repo", "path", "content", "message"]
    }
  }
];

// Dangerous command patterns that require approval
export const DANGEROUS_PATTERNS = [
  /rm\s+(-rf?|--recursive)/i,
  /rm\s+-[a-z]*f[a-z]*/i,
  /dd\s+/i,
  /mkfs/i,
  /fdisk/i,
  /parted/i,
  />\s*\/dev\//i,
  /shutdown/i,
  /reboot/i,
  /init\s+0/i,
  /halt/i,
  /poweroff/i,
  /chmod\s+777/i,
  /chown\s+-R\s+.*\s+\//i,
  /:(){ :|:& };:/i, // Fork bomb
  />\s*\/etc\//i,
  /systemctl\s+(stop|disable)\s+(ssh|sshd|network|networking)/i,
  /ufw\s+disable/i,
  /iptables\s+-F/i,
  /DROP\s+TABLE/i,
  /TRUNCATE/i,
  /DELETE\s+FROM\s+\w+\s*;?\s*$/i, // DELETE without WHERE
  /userdel/i,
  /passwd\s+root/i,
];

// Check if a command is dangerous
export function isDangerousCommand(command: string): boolean {
  return DANGEROUS_PATTERNS.some(pattern => pattern.test(command));
}

// Tool categories for UI organization
export const TOOL_CATEGORIES = {
  execution: ["execute_command"],
  files: ["read_file", "write_file", "edit_file", "list_directory"],
  monitoring: ["get_system_metrics", "check_service_status", "get_logs"],
  docker: ["docker_list", "docker_manage", "docker_compose"],
  webserver: ["nginx_manage"],
  security: ["ssl_certificate", "security_audit"],
  database: ["database_query"],
  packages: ["package_manage"],
  network: ["network_diagnose"],
  backup: [
    "backup_create",
    "restic_init",
    "restic_backup",
    "restic_list",
    "restic_restore",
    "restic_verify",
    "restic_prune",
    "restic_stats",
    "restic_diff",
    "restic_mount"
  ],
  processes: ["process_manage"],
  cron: ["cron_manage"],
  github: [
    "github_search_repos",
    "github_get_repo",
    "github_list_contents",
    "github_get_file",
    "github_search_code",
    "github_list_commits",
    "github_list_branches",
    "github_list_issues",
    "github_create_issue",
    "github_list_pull_requests",
    "github_create_file"
  ]
};
