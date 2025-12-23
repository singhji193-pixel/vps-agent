/**
 * Restic Backup Executor
 * Handles backup operations using restic
 */

import { BaseExecutor, ToolResult } from "./types";
import { storage } from "../../storage";

export class BackupExecutor extends BaseExecutor {
  /**
   * Get backup configuration from storage
   */
  private async getBackupConfig(configId: string): Promise<any> {
    const config = await storage.getBackupConfig(configId);
    if (!config) {
      throw new Error(`Backup configuration ${configId} not found`);
    }
    return config;
  }

  /**
   * Build restic environment variables
   */
  private buildResticEnv(config: any): string {
    let env = `RESTIC_PASSWORD="${config.decryptedPassword}"`;
    
    switch (config.repositoryType) {
      case "s3":
        env += ` AWS_ACCESS_KEY_ID="${config.accessKeyId}" AWS_SECRET_ACCESS_KEY="${config.secretAccessKey}"`;
        if (config.endpoint) {
          env += ` AWS_DEFAULT_REGION="${config.region || 'us-east-1'}"`;
        }
        break;
      case "b2":
        env += ` B2_ACCOUNT_ID="${config.accessKeyId}" B2_ACCOUNT_KEY="${config.secretAccessKey}"`;
        break;
    }
    
    return env;
  }

  /**
   * Create a simple tar backup
   */
  async backupCreate(input: {
    type: "files" | "database" | "full";
    source: string;
    destination: string;
    compress?: boolean;
  }): Promise<ToolResult> {
    const { type, source, destination, compress = true } = input;
    
    let command: string;
    const timestamp = "$(date +%Y%m%d_%H%M%S)";
    
    switch (type) {
      case "files":
        command = compress
          ? `tar -czvf "${destination}/backup_files_${timestamp}.tar.gz" "${source}"`
          : `tar -cvf "${destination}/backup_files_${timestamp}.tar" "${source}"`;
        break;
      case "database":
        command = `pg_dump ${source} | gzip > "${destination}/backup_db_${timestamp}.sql.gz"`;
        break;
      case "full":
        command = `tar -czvf "${destination}/backup_full_${timestamp}.tar.gz" /etc /var/www /home 2>/dev/null`;
        break;
      default:
        return { success: false, output: "", error: `Invalid type: ${type}` };
    }
    
    return {
      success: false,
      output: "",
      requires_approval: true,
      pending_command: command,
      error: `⚠️ Backup creation requires approval:

Type: ${type}
Source: ${source}
Destination: ${destination}
Command: ${command}

Please confirm.`
    };
  }

  /**
   * Initialize a new restic repository
   */
  async resticInit(input: {
    repositoryType: "local" | "s3" | "sftp" | "b2";
    repositoryPath: string;
    password: string;
  }): Promise<ToolResult> {
    const { repositoryType, repositoryPath, password } = input;
    
    let repoUrl: string;
    switch (repositoryType) {
      case "local":
        repoUrl = repositoryPath;
        break;
      case "s3":
        repoUrl = `s3:${repositoryPath}`;
        break;
      case "sftp":
        repoUrl = `sftp:${repositoryPath}`;
        break;
      case "b2":
        repoUrl = `b2:${repositoryPath}`;
        break;
      default:
        return { success: false, output: "", error: `Invalid repository type: ${repositoryType}` };
    }
    
    // First check if restic is installed
    const checkCmd = "which restic || echo 'not_installed'";
    const checkResult = await this.ssh(checkCmd);
    
    if (checkResult.stdout.includes("not_installed")) {
      return {
        success: false,
        output: "",
        requires_approval: true,
        pending_command: `apt-get update && apt-get install -y restic && RESTIC_PASSWORD="${password}" restic init -r "${repoUrl}"`,
        error: `⚠️ Restic is not installed. This will install restic and initialize the repository:

Repository Type: ${repositoryType}
Repository Path: ${repoUrl}

Please confirm.`
      };
    }
    
    return {
      success: false,
      output: "",
      requires_approval: true,
      pending_command: `RESTIC_PASSWORD="${password}" restic init -r "${repoUrl}"`,
      error: `⚠️ Initialize restic repository:

Repository Type: ${repositoryType}
Repository Path: ${repoUrl}

This will create an encrypted backup repository. Please confirm.`
    };
  }

  /**
   * Create a backup with restic
   */
  async resticBackup(input: {
    configId: string;
    paths?: string[];
    tags?: string[];
    excludePatterns?: string[];
  }): Promise<ToolResult> {
    const { configId, paths, tags, excludePatterns } = input;
    
    try {
      const config = await this.getBackupConfig(configId);
      const env = this.buildResticEnv(config);
      
      const backupPaths = paths || config.includePaths || ["/etc", "/var/www", "/home"];
      const excludes = excludePatterns || config.excludePatterns || [];
      
      let cmd = `${env} restic -r "${config.repositoryPath}" backup`;
      
      backupPaths.forEach((p: string) => {
        cmd += ` "${p}"`;
      });
      
      excludes.forEach((e: string) => {
        cmd += ` --exclude "${e}"`;
      });
      
      if (tags && tags.length > 0) {
        tags.forEach(t => {
          cmd += ` --tag "${t}"`;
        });
      }
      
      cmd += " --json";
      
      return {
        success: false,
        output: "",
        requires_approval: true,
        pending_command: cmd,
        error: `⚠️ Create backup with restic:

Configuration: ${config.name}
Paths: ${backupPaths.join(", ")}
Excludes: ${excludes.length > 0 ? excludes.join(", ") : "none"}
Tags: ${tags?.join(", ") || "none"}

This will create an incremental backup. Please confirm.`
      };
    } catch (error: any) {
      return { success: false, output: "", error: error.message };
    }
  }

  /**
   * List restic snapshots
   */
  async resticList(input: {
    configId: string;
    tags?: string[];
    paths?: string[];
    last?: number;
  }): Promise<ToolResult> {
    const { configId, tags, paths, last } = input;
    
    try {
      const config = await this.getBackupConfig(configId);
      const env = this.buildResticEnv(config);
      
      let cmd = `${env} restic -r "${config.repositoryPath}" snapshots --json`;
      
      if (tags && tags.length > 0) {
        tags.forEach(t => {
          cmd += ` --tag "${t}"`;
        });
      }
      
      if (paths && paths.length > 0) {
        paths.forEach(p => {
          cmd += ` --path "${p}"`;
        });
      }
      
      if (last) {
        cmd += ` --last ${last}`;
      }
      
      const result = await this.ssh(cmd, 60);
      
      if (result.exitCode !== 0) {
        return { success: false, output: "", error: result.stderr };
      }
      
      try {
        const snapshots = JSON.parse(result.stdout);
        const formatted = snapshots.map((s: any) => ({
          id: s.short_id || s.id?.substring(0, 8),
          time: s.time,
          hostname: s.hostname,
          paths: s.paths,
          tags: s.tags,
        }));
        
        return {
          success: true,
          output: `Found ${formatted.length} snapshot(s):\n\n${JSON.stringify(formatted, null, 2)}`,
          metadata: { snapshots: formatted }
        };
      } catch {
        return { success: true, output: result.stdout };
      }
    } catch (error: any) {
      return { success: false, output: "", error: error.message };
    }
  }

  /**
   * Restore from a restic snapshot
   */
  async resticRestore(input: {
    configId: string;
    snapshotId: string;
    targetPath?: string;
    includePaths?: string[];
    excludePaths?: string[];
  }): Promise<ToolResult> {
    const { configId, snapshotId, targetPath, includePaths, excludePaths } = input;
    
    try {
      const config = await this.getBackupConfig(configId);
      const env = this.buildResticEnv(config);
      
      let cmd = `${env} restic -r "${config.repositoryPath}" restore ${snapshotId}`;
      
      if (targetPath) {
        cmd += ` --target "${targetPath}"`;
      } else {
        cmd += " --target /";
      }
      
      if (includePaths && includePaths.length > 0) {
        includePaths.forEach(p => {
          cmd += ` --include "${p}"`;
        });
      }
      
      if (excludePaths && excludePaths.length > 0) {
        excludePaths.forEach(p => {
          cmd += ` --exclude "${p}"`;
        });
      }
      
      return {
        success: false,
        output: "",
        requires_approval: true,
        pending_command: cmd,
        error: `⚠️ RESTORE from backup - This will overwrite files!

Configuration: ${config.name}
Snapshot: ${snapshotId}
Target Path: ${targetPath || "/" + " (original locations)"}
Include: ${includePaths?.join(", ") || "all"}
Exclude: ${excludePaths?.join(", ") || "none"}

WARNING: Existing files will be overwritten! Please confirm.`
      };
    } catch (error: any) {
      return { success: false, output: "", error: error.message };
    }
  }

  /**
   * Verify restic repository integrity
   */
  async resticVerify(input: {
    configId: string;
    readData?: boolean;
  }): Promise<ToolResult> {
    const { configId, readData = false } = input;
    
    try {
      const config = await this.getBackupConfig(configId);
      const env = this.buildResticEnv(config);
      
      let cmd = `${env} restic -r "${config.repositoryPath}" check`;
      
      if (readData) {
        cmd += " --read-data";
      }
      
      const result = await this.ssh(cmd, 300); // 5 min timeout for verification
      
      return {
        success: result.exitCode === 0,
        output: result.stdout + (result.stderr ? `\n${result.stderr}` : ""),
        metadata: { verified: result.exitCode === 0, readData }
      };
    } catch (error: any) {
      return { success: false, output: "", error: error.message };
    }
  }

  /**
   * Prune old snapshots based on retention policy
   */
  async resticPrune(input: {
    configId: string;
    keepDaily?: number;
    keepWeekly?: number;
    keepMonthly?: number;
    keepYearly?: number;
    dryRun?: boolean;
  }): Promise<ToolResult> {
    const { configId, keepDaily, keepWeekly, keepMonthly, keepYearly, dryRun = false } = input;
    
    try {
      const config = await this.getBackupConfig(configId);
      const env = this.buildResticEnv(config);
      
      const daily = keepDaily ?? config.retentionDaily ?? 7;
      const weekly = keepWeekly ?? config.retentionWeekly ?? 4;
      const monthly = keepMonthly ?? config.retentionMonthly ?? 12;
      const yearly = keepYearly ?? config.retentionYearly ?? 2;
      
      let cmd = `${env} restic -r "${config.repositoryPath}" forget --prune`;
      cmd += ` --keep-daily ${daily}`;
      cmd += ` --keep-weekly ${weekly}`;
      cmd += ` --keep-monthly ${monthly}`;
      cmd += ` --keep-yearly ${yearly}`;
      
      if (dryRun) {
        cmd += " --dry-run";
        const result = await this.ssh(cmd, 120);
        return {
          success: result.exitCode === 0,
          output: `[DRY RUN] Would prune with policy:
Keep daily: ${daily}
Keep weekly: ${weekly}
Keep monthly: ${monthly}
Keep yearly: ${yearly}

${result.stdout}`,
          metadata: { dryRun: true }
        };
      }
      
      return {
        success: false,
        output: "",
        requires_approval: true,
        pending_command: cmd,
        error: `⚠️ Prune old backups - This will permanently delete old snapshots!

Configuration: ${config.name}
Retention Policy:
  - Keep daily: ${daily}
  - Keep weekly: ${weekly}
  - Keep monthly: ${monthly}
  - Keep yearly: ${yearly}

This action cannot be undone! Please confirm.`
      };
    } catch (error: any) {
      return { success: false, output: "", error: error.message };
    }
  }

  /**
   * Get repository statistics
   */
  async resticStats(input: {
    configId: string;
    mode?: string;
  }): Promise<ToolResult> {
    const { configId, mode = "restore-size" } = input;
    
    try {
      const config = await this.getBackupConfig(configId);
      const env = this.buildResticEnv(config);
      
      const cmd = `${env} restic -r "${config.repositoryPath}" stats --mode=${mode} --json`;
      
      const result = await this.ssh(cmd, 120);
      
      if (result.exitCode !== 0) {
        return { success: false, output: "", error: result.stderr };
      }
      
      try {
        const stats = JSON.parse(result.stdout);
        const sizeGB = (stats.total_size / (1024 * 1024 * 1024)).toFixed(2);
        
        return {
          success: true,
          output: `Repository Statistics:

Total Size: ${sizeGB} GB
Total Files: ${stats.total_file_count || "N/A"}

Raw data:
${JSON.stringify(stats, null, 2)}`,
          metadata: stats
        };
      } catch {
        return { success: true, output: result.stdout };
      }
    } catch (error: any) {
      return { success: false, output: "", error: error.message };
    }
  }

  /**
   * Compare two snapshots
   */
  async resticDiff(input: {
    configId: string;
    snapshotId1: string;
    snapshotId2?: string;
  }): Promise<ToolResult> {
    const { configId, snapshotId1, snapshotId2 } = input;
    
    try {
      const config = await this.getBackupConfig(configId);
      const env = this.buildResticEnv(config);
      
      const secondSnapshot = snapshotId2 || "latest";
      const cmd = `${env} restic -r "${config.repositoryPath}" diff ${snapshotId1} ${secondSnapshot}`;
      
      const result = await this.ssh(cmd, 120);
      
      return {
        success: result.exitCode === 0,
        output: result.stdout + (result.stderr ? `\n${result.stderr}` : ""),
        metadata: { snapshot1: snapshotId1, snapshot2: secondSnapshot }
      };
    } catch (error: any) {
      return { success: false, output: "", error: error.message };
    }
  }

  /**
   * Mount repository as filesystem
   */
  async resticMount(input: {
    configId: string;
    mountPath: string;
    snapshotId?: string;
  }): Promise<ToolResult> {
    const { configId, mountPath, snapshotId } = input;
    
    try {
      const config = await this.getBackupConfig(configId);
      const env = this.buildResticEnv(config);
      
      // First check if FUSE is available
      const fuseCheck = await this.ssh("which fusermount || echo 'not_installed'");
      
      if (fuseCheck.stdout.includes("not_installed")) {
        return {
          success: false,
          output: "",
          error: "FUSE is not installed. Install with: apt-get install fuse"
        };
      }
      
      let cmd = `mkdir -p "${mountPath}" && ${env} restic -r "${config.repositoryPath}" mount "${mountPath}"`;
      
      if (snapshotId) {
        cmd += ` --snapshot ${snapshotId}`;
      }
      
      return {
        success: false,
        output: "",
        requires_approval: true,
        pending_command: cmd + " &",
        error: `⚠️ Mount restic repository as filesystem:

Configuration: ${config.name}
Mount Path: ${mountPath}
Snapshot: ${snapshotId || "all snapshots"}

Note: This will run in background. Use 'fusermount -u ${mountPath}' to unmount.

Please confirm.`
      };
    } catch (error: any) {
      return { success: false, output: "", error: error.message };
    }
  }
}
