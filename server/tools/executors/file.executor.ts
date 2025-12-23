/**
 * File Operations Executor
 * Handles read, write, edit, and list directory operations
 */

import { BaseExecutor, ToolResult, executeSSHCommand } from "./types";
import { isDangerousCommand } from "../index";
import { storage } from "../../storage";

export class FileExecutor extends BaseExecutor {
  /**
   * Execute a shell command
   */
  async executeCommand(input: {
    command: string;
    requires_approval?: boolean;
    explanation: string;
    timeout_seconds?: number;
  }): Promise<ToolResult> {
    const { command, requires_approval, explanation, timeout_seconds = 30 } = input;

    // Check for dangerous commands
    if (isDangerousCommand(command) && !requires_approval) {
      return {
        success: false,
        output: "",
        requires_approval: true,
        pending_command: command,
        error: `⚠️ This command appears dangerous and requires explicit approval:
\`${command}\`

Explanation: ${explanation}

Please confirm you want to execute this command.`
      };
    }

    try {
      const result = await this.ssh(command, Math.min(timeout_seconds, 300));
      
      // Log command execution
      await storage.createCommandHistory({
        userId: this.userId,
        vpsServerId: this.serverId,
        command,
        output: result.stdout + (result.stderr ? `\n[STDERR]\n${result.stderr}` : ""),
        exitCode: result.exitCode,
      });

      return {
        success: result.exitCode === 0,
        output: result.stdout + (result.stderr ? `\n[STDERR]\n${result.stderr}` : ""),
        metadata: { exitCode: result.exitCode }
      };
    } catch (error: any) {
      return { success: false, output: "", error: error.message };
    }
  }

  /**
   * Read file contents
   */
  async readFile(input: {
    path: string;
    start_line?: number;
    end_line?: number;
    max_lines?: number;
  }): Promise<ToolResult> {
    const { path, start_line, end_line, max_lines = 500 } = input;
    
    let command = `cat "${path}"`;
    if (start_line && end_line) {
      command = `sed -n '${start_line},${end_line}p' "${path}"`;
    } else if (start_line) {
      command = `tail -n +${start_line} "${path}" | head -n ${max_lines}`;
    } else {
      command = `head -n ${max_lines} "${path}"`;
    }

    const result = await this.ssh(command);
    
    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: { path, lines: result.stdout.split("\n").length }
    };
  }

  /**
   * Write file contents (requires approval)
   */
  async writeFile(input: {
    path: string;
    content: string;
    mode?: string;
    backup?: boolean;
  }): Promise<ToolResult> {
    const { path, content, mode = "644", backup = true } = input;
    
    let commands: string[] = [];
    
    if (backup) {
      commands.push(`[ -f "${path}" ] && cp "${path}" "${path}.backup.$(date +%Y%m%d_%H%M%S)"`);
    }
    
    // Use heredoc for file content
    commands.push(`cat > "${path}" << 'VPSAGENT_EOF'\n${content}\nVPSAGENT_EOF`);
    commands.push(`chmod ${mode} "${path}"`);
    
    const fullCommand = commands.join(" && ");
    
    return {
      success: false,
      output: "",
      requires_approval: true,
      pending_command: fullCommand,
      error: `⚠️ File write operation requires approval:

Path: ${path}
Content length: ${content.length} characters
Mode: ${mode}
Backup: ${backup}

Please confirm you want to write this file.`
    };
  }

  /**
   * Edit file with find/replace (requires approval)
   */
  async editFile(input: {
    path: string;
    edits: Array<{ old_text: string; new_text: string }>;
  }): Promise<ToolResult> {
    const { path, edits } = input;
    
    // Build sed command for edits
    const sedCommands = edits.map(edit => {
      const escaped_old = edit.old_text.replace(/[\/&]/g, "\\$&").replace(/\n/g, "\\n");
      const escaped_new = edit.new_text.replace(/[\/&]/g, "\\$&").replace(/\n/g, "\\n");
      return `s/${escaped_old}/${escaped_new}/g`;
    });
    
    const command = `sed -i.bak ${sedCommands.map(s => `-e '${s}'`).join(" ")} "${path}"`;
    
    return {
      success: false,
      output: "",
      requires_approval: true,
      pending_command: command,
      error: `⚠️ File edit operation requires approval:

Path: ${path}
Edits: ${edits.length} replacement(s)

Please confirm you want to edit this file.`
    };
  }

  /**
   * List directory contents
   */
  async listDirectory(input: {
    path: string;
    show_hidden?: boolean;
    recursive?: boolean;
  }): Promise<ToolResult> {
    const { path, show_hidden = false, recursive = false } = input;
    
    let flags = "-lh";
    if (show_hidden) flags += "a";
    
    const command = recursive 
      ? `find "${path}" -maxdepth 2 -ls 2>/dev/null | head -100`
      : `ls ${flags} "${path}"`;
    
    const result = await this.ssh(command);
    
    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr : undefined
    };
  }
}
