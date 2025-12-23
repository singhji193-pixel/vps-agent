/**
 * Web Server Executor
 * Handles Nginx management and SSL certificates
 */

import { BaseExecutor, ToolResult } from "./types";

export class WebServerExecutor extends BaseExecutor {
  /**
   * Manage Nginx web server
   */
  async nginxManage(input: {
    action: "test" | "reload" | "restart" | "list-sites" | "enable-site" | "disable-site" | "show-config";
    site_name?: string;
  }): Promise<ToolResult> {
    const { action, site_name } = input;
    
    let command: string;
    let dangerous = false;
    
    switch (action) {
      case "test":
        command = "nginx -t 2>&1";
        break;
      case "reload":
        command = "nginx -t 2>&1 && systemctl reload nginx";
        dangerous = true;
        break;
      case "restart":
        command = "nginx -t 2>&1 && systemctl restart nginx";
        dangerous = true;
        break;
      case "list-sites":
        command = 'echo "=== AVAILABLE ===" && ls -la /etc/nginx/sites-available/ && echo -e "\\n=== ENABLED ===" && ls -la /etc/nginx/sites-enabled/';
        break;
      case "enable-site":
        if (!site_name) return { success: false, output: "", error: "site_name required" };
        command = `ln -sf /etc/nginx/sites-available/${site_name} /etc/nginx/sites-enabled/ && nginx -t`;
        dangerous = true;
        break;
      case "disable-site":
        if (!site_name) return { success: false, output: "", error: "site_name required" };
        command = `rm -f /etc/nginx/sites-enabled/${site_name}`;
        dangerous = true;
        break;
      case "show-config":
        command = site_name 
          ? `cat /etc/nginx/sites-available/${site_name}`
          : "cat /etc/nginx/nginx.conf";
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
        error: `⚠️ Nginx ${action} requires approval:

Command: ${command}

Please confirm.`
      };
    }
    
    const result = await this.ssh(command);
    
    return {
      success: result.exitCode === 0,
      output: result.stdout + result.stderr,
    };
  }

  /**
   * Manage SSL certificates with Certbot
   */
  async sslCertificate(input: {
    action: "list" | "obtain" | "renew" | "revoke" | "check-expiry";
    domain?: string;
    email?: string;
  }): Promise<ToolResult> {
    const { action, domain, email } = input;
    
    let command: string;
    let dangerous = false;
    
    switch (action) {
      case "list":
        command = "certbot certificates 2>&1";
        break;
      case "check-expiry":
        command = domain 
          ? `echo | openssl s_client -servername ${domain} -connect ${domain}:443 2>/dev/null | openssl x509 -noout -dates`
          : "certbot certificates 2>&1 | grep -E '(Domain|Expiry)'";
        break;
      case "obtain":
        if (!domain) return { success: false, output: "", error: "domain required" };
        command = `certbot certonly --nginx -d ${domain}${email ? ` --email ${email}` : ""} --non-interactive --agree-tos`;
        dangerous = true;
        break;
      case "renew":
        command = "certbot renew --dry-run 2>&1";
        break;
      case "revoke":
        if (!domain) return { success: false, output: "", error: "domain required" };
        command = `certbot revoke --cert-name ${domain}`;
        dangerous = true;
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
        error: `⚠️ SSL ${action} requires approval:

Command: ${command}

Please confirm.`
      };
    }
    
    const result = await this.ssh(command, 60);
    
    return {
      success: result.exitCode === 0,
      output: result.stdout + result.stderr,
    };
  }

  /**
   * Database query execution
   */
  async databaseQuery(input: {
    db_type: "postgresql" | "mysql" | "sqlite";
    query: string;
    database: string;
    requires_approval?: boolean;
  }): Promise<ToolResult> {
    const { db_type, query, database, requires_approval } = input;
    
    // Check if it's a non-SELECT query
    const isModifying = /^\s*(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)/i.test(query);
    
    if (isModifying && !requires_approval) {
      return {
        success: false,
        output: "",
        requires_approval: true,
        pending_command: query,
        error: `⚠️ This is a modifying query and requires approval:

\`\`\`sql
${query}
\`\`\`

Database: ${database}

Please confirm.`
      };
    }
    
    let command: string;
    
    switch (db_type) {
      case "postgresql":
        command = `psql -d ${database} -c "${query.replace(/"/g, '\\"')}"`;
        break;
      case "mysql":
        command = `mysql ${database} -e "${query.replace(/"/g, '\\"')}"`;
        break;
      case "sqlite":
        command = `sqlite3 ${database} "${query.replace(/"/g, '\\"')}"`;
        break;
      default:
        return { success: false, output: "", error: `Invalid db_type: ${db_type}` };
    }
    
    const result = await this.ssh(command, 60);
    
    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.stderr || undefined
    };
  }
}
