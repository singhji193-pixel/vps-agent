/**
 * VPS Agent Tool Executor
 * 
 * Handles execution of AI tool calls on VPS servers via SSH.
 * This is the core engine that makes VPS Agent agentic.
 * 
 * REFACTORED: Uses modular executors from ./executors/
 */

import {
  ToolResult,
  SSHConnection,
  FileExecutor,
  SystemExecutor,
  DockerExecutor,
  WebServerExecutor,
  BackupExecutor,
  GitHubExecutor,
} from "./executors";

// Re-export types for external use
export { ToolResult, SSHConnection };

/**
 * Main Tool Executor class
 * Delegates to specialized executors based on tool category
 */
export class ToolExecutor {
  private fileExecutor: FileExecutor;
  private systemExecutor: SystemExecutor;
  private dockerExecutor: DockerExecutor;
  private webServerExecutor: WebServerExecutor;
  private backupExecutor: BackupExecutor;
  private githubExecutor: GitHubExecutor;

  constructor(conn: SSHConnection, userId: string, serverId: string) {
    this.fileExecutor = new FileExecutor(conn, userId, serverId);
    this.systemExecutor = new SystemExecutor(conn, userId, serverId);
    this.dockerExecutor = new DockerExecutor(conn, userId, serverId);
    this.webServerExecutor = new WebServerExecutor(conn, userId, serverId);
    this.backupExecutor = new BackupExecutor(conn, userId, serverId);
    this.githubExecutor = new GitHubExecutor(conn, userId, serverId);
  }

  /**
   * Main execution method - routes to appropriate specialized executor
   */
  async execute(toolName: string, input: Record<string, any>): Promise<ToolResult> {
    try {
      // File operations
      if (["execute_command", "read_file", "write_file", "edit_file", "list_directory"].includes(toolName)) {
        return await this.executeFileOperation(toolName, input);
      }
      
      // System operations
      if (["get_system_metrics", "check_service_status", "get_logs", "package_manage", 
           "process_manage", "cron_manage", "network_diagnose", "security_audit"].includes(toolName)) {
        return await this.executeSystemOperation(toolName, input);
      }
      
      // Docker operations
      if (["docker_list", "docker_manage", "docker_compose"].includes(toolName)) {
        return await this.executeDockerOperation(toolName, input);
      }
      
      // Web server operations
      if (["nginx_manage", "ssl_certificate", "database_query"].includes(toolName)) {
        return await this.executeWebServerOperation(toolName, input);
      }
      
      // Backup operations
      if (["backup_create", "restic_init", "restic_backup", "restic_list", "restic_restore",
           "restic_verify", "restic_prune", "restic_stats", "restic_diff", "restic_mount"].includes(toolName)) {
        return await this.executeBackupOperation(toolName, input);
      }
      
      // GitHub operations
      if (toolName.startsWith("github_")) {
        return await this.executeGitHubOperation(toolName, input);
      }
      
      return { success: false, output: "", error: `Unknown tool: ${toolName}` };
    } catch (error: any) {
      return { 
        success: false, 
        output: "", 
        error: error.message || "Tool execution failed" 
      };
    }
  }

  // === Delegated Operations ===

  private async executeFileOperation(toolName: string, input: Record<string, any>): Promise<ToolResult> {
    switch (toolName) {
      case "execute_command":
        return await this.fileExecutor.executeCommand(input as any);
      case "read_file":
        return await this.fileExecutor.readFile(input as any);
      case "write_file":
        return await this.fileExecutor.writeFile(input as any);
      case "edit_file":
        return await this.fileExecutor.editFile(input as any);
      case "list_directory":
        return await this.fileExecutor.listDirectory(input as any);
      default:
        return { success: false, output: "", error: `Unknown file operation: ${toolName}` };
    }
  }

  private async executeSystemOperation(toolName: string, input: Record<string, any>): Promise<ToolResult> {
    switch (toolName) {
      case "get_system_metrics":
        return await this.systemExecutor.getSystemMetrics(input as any);
      case "check_service_status":
        return await this.systemExecutor.checkServiceStatus(input as any);
      case "get_logs":
        return await this.systemExecutor.getLogs(input as any);
      case "package_manage":
        return await this.systemExecutor.packageManage(input as any);
      case "process_manage":
        return await this.systemExecutor.processManage(input as any);
      case "cron_manage":
        return await this.systemExecutor.cronManage(input as any);
      case "network_diagnose":
        return await this.systemExecutor.networkDiagnose(input as any);
      case "security_audit":
        return await this.systemExecutor.securityAudit(input as any);
      default:
        return { success: false, output: "", error: `Unknown system operation: ${toolName}` };
    }
  }

  private async executeDockerOperation(toolName: string, input: Record<string, any>): Promise<ToolResult> {
    switch (toolName) {
      case "docker_list":
        return await this.dockerExecutor.dockerList(input as any);
      case "docker_manage":
        return await this.dockerExecutor.dockerManage(input as any);
      case "docker_compose":
        return await this.dockerExecutor.dockerCompose(input as any);
      default:
        return { success: false, output: "", error: `Unknown docker operation: ${toolName}` };
    }
  }

  private async executeWebServerOperation(toolName: string, input: Record<string, any>): Promise<ToolResult> {
    switch (toolName) {
      case "nginx_manage":
        return await this.webServerExecutor.nginxManage(input as any);
      case "ssl_certificate":
        return await this.webServerExecutor.sslCertificate(input as any);
      case "database_query":
        return await this.webServerExecutor.databaseQuery(input as any);
      default:
        return { success: false, output: "", error: `Unknown webserver operation: ${toolName}` };
    }
  }

  private async executeBackupOperation(toolName: string, input: Record<string, any>): Promise<ToolResult> {
    switch (toolName) {
      case "backup_create":
        return await this.backupExecutor.backupCreate(input as any);
      case "restic_init":
        return await this.backupExecutor.resticInit(input as any);
      case "restic_backup":
        return await this.backupExecutor.resticBackup(input as any);
      case "restic_list":
        return await this.backupExecutor.resticList(input as any);
      case "restic_restore":
        return await this.backupExecutor.resticRestore(input as any);
      case "restic_verify":
        return await this.backupExecutor.resticVerify(input as any);
      case "restic_prune":
        return await this.backupExecutor.resticPrune(input as any);
      case "restic_stats":
        return await this.backupExecutor.resticStats(input as any);
      case "restic_diff":
        return await this.backupExecutor.resticDiff(input as any);
      case "restic_mount":
        return await this.backupExecutor.resticMount(input as any);
      default:
        return { success: false, output: "", error: `Unknown backup operation: ${toolName}` };
    }
  }

  private async executeGitHubOperation(toolName: string, input: Record<string, any>): Promise<ToolResult> {
    switch (toolName) {
      case "github_search_repos":
        return await this.githubExecutor.githubSearchRepos(input as any);
      case "github_get_repo":
        return await this.githubExecutor.githubGetRepo(input as any);
      case "github_list_contents":
        return await this.githubExecutor.githubListContents(input as any);
      case "github_get_file":
        return await this.githubExecutor.githubGetFile(input as any);
      case "github_search_code":
        return await this.githubExecutor.githubSearchCode(input as any);
      case "github_list_commits":
        return await this.githubExecutor.githubListCommits(input as any);
      case "github_list_branches":
        return await this.githubExecutor.githubListBranches(input as any);
      case "github_list_issues":
        return await this.githubExecutor.githubListIssues(input as any);
      case "github_create_issue":
        return await this.githubExecutor.githubCreateIssue(input as any);
      case "github_list_pull_requests":
        return await this.githubExecutor.githubListPullRequests(input as any);
      case "github_create_file":
        return await this.githubExecutor.githubCreateFile(input as any);
      default:
        return { success: false, output: "", error: `Unknown GitHub operation: ${toolName}` };
    }
  }
}

