/**
 * GitHub Integration Executor
 * Handles GitHub API operations
 */

import { BaseExecutor, ToolResult } from "./types";
import { storage } from "../../storage";

export class GitHubExecutor extends BaseExecutor {
  /**
   * Get GitHub access token from storage
   */
  private async getGithubToken(): Promise<string | null> {
    const integration = await storage.getGithubIntegration(this.userId);
    return integration?.accessToken || null;
  }

  /**
   * Make authenticated GitHub API request
   */
  private async githubFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
    const token = await this.getGithubToken();
    if (!token) {
      throw new Error("GitHub not connected. Please connect GitHub in the GitHub Integration page.");
    }

    const response = await fetch(`https://api.github.com${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'VPS-Agent',
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Search GitHub repositories
   */
  async githubSearchRepos(input: {
    query: string;
    sort?: string;
    limit?: number;
  }): Promise<ToolResult> {
    const { query, sort = "best-match", limit = 10 } = input;
    
    try {
      const data = await this.githubFetch(
        `/search/repositories?q=${encodeURIComponent(query)}&sort=${sort}&per_page=${limit}`
      );
      
      const repos = data.items.map((r: any) => ({
        name: r.full_name,
        description: r.description?.slice(0, 100) || '',
        stars: r.stargazers_count,
        forks: r.forks_count,
        language: r.language,
        url: r.html_url,
      }));
      
      const output = repos.map((r: any) => 
        `${r.name} (${r.stars} stars, ${r.language || 'N/A'})\n  ${r.description}\n  ${r.url}`
      ).join('\n\n');
      
      return { success: true, output: `Found ${data.total_count} repositories:\n\n${output}` };
    } catch (error: any) {
      return { success: false, output: '', error: error.message };
    }
  }

  /**
   * Get repository details
   */
  async githubGetRepo(input: {
    owner: string;
    repo: string;
  }): Promise<ToolResult> {
    try {
      const data = await this.githubFetch(`/repos/${input.owner}/${input.repo}`);
      
      const output = `Repository: ${data.full_name}
Description: ${data.description || 'N/A'}
Language: ${data.language || 'N/A'}
Stars: ${data.stargazers_count} | Forks: ${data.forks_count} | Issues: ${data.open_issues_count}
Default Branch: ${data.default_branch}
Created: ${data.created_at}
Last Updated: ${data.updated_at}
Clone URL: ${data.clone_url}
Topics: ${data.topics?.join(', ') || 'None'}`;
      
      return { success: true, output };
    } catch (error: any) {
      return { success: false, output: '', error: error.message };
    }
  }

  /**
   * List repository contents
   */
  async githubListContents(input: {
    owner: string;
    repo: string;
    path?: string;
    branch?: string;
  }): Promise<ToolResult> {
    const { owner, repo, path = '', branch = 'main' } = input;
    
    try {
      const data = await this.githubFetch(
        `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
      );
      
      const items = Array.isArray(data) ? data : [data];
      const output = items.map((item: any) => {
        const icon = item.type === 'dir' ? '📁' : '📄';
        const size = item.size ? ` (${item.size} bytes)` : '';
        return `${icon} ${item.name}${size}`;
      }).join('\n');
      
      return { success: true, output: `Contents of ${owner}/${repo}/${path}:\n\n${output}` };
    } catch (error: any) {
      return { success: false, output: '', error: error.message };
    }
  }

  /**
   * Get file contents from repository
   */
  async githubGetFile(input: {
    owner: string;
    repo: string;
    path: string;
    branch?: string;
  }): Promise<ToolResult> {
    const { owner, repo, path, branch = 'main' } = input;
    
    try {
      const data = await this.githubFetch(
        `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
      );
      
      if (data.type !== 'file') {
        return { success: false, output: '', error: 'Path is not a file' };
      }
      
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      return { success: true, output: `File: ${path}\nSize: ${data.size} bytes\n\n${content}` };
    } catch (error: any) {
      return { success: false, output: '', error: error.message };
    }
  }

  /**
   * Search code across repositories
   */
  async githubSearchCode(input: {
    query: string;
    limit?: number;
  }): Promise<ToolResult> {
    const { query, limit = 10 } = input;
    
    try {
      const data = await this.githubFetch(
        `/search/code?q=${encodeURIComponent(query)}&per_page=${limit}`
      );
      
      const results = data.items.map((item: any) => 
        `${item.repository.full_name}/${item.path}\n  ${item.html_url}`
      ).join('\n\n');
      
      return { success: true, output: `Found ${data.total_count} code matches:\n\n${results}` };
    } catch (error: any) {
      return { success: false, output: '', error: error.message };
    }
  }

  /**
   * List repository commits
   */
  async githubListCommits(input: {
    owner: string;
    repo: string;
    branch?: string;
    limit?: number;
  }): Promise<ToolResult> {
    const { owner, repo, branch = 'main', limit = 10 } = input;
    
    try {
      const data = await this.githubFetch(
        `/repos/${owner}/${repo}/commits?sha=${branch}&per_page=${limit}`
      );
      
      const commits = data.map((c: any) => {
        const date = new Date(c.commit.author.date).toLocaleDateString();
        return `${c.sha.slice(0, 7)} - ${c.commit.message.split('\n')[0]}\n  by ${c.commit.author.name} on ${date}`;
      }).join('\n\n');
      
      return { success: true, output: `Recent commits on ${branch}:\n\n${commits}` };
    } catch (error: any) {
      return { success: false, output: '', error: error.message };
    }
  }

  /**
   * List repository branches
   */
  async githubListBranches(input: {
    owner: string;
    repo: string;
  }): Promise<ToolResult> {
    try {
      const data = await this.githubFetch(`/repos/${input.owner}/${input.repo}/branches`);
      
      const branches = data.map((b: any) => `• ${b.name}${b.protected ? ' (protected)' : ''}`).join('\n');
      
      return { success: true, output: `Branches:\n\n${branches}` };
    } catch (error: any) {
      return { success: false, output: '', error: error.message };
    }
  }

  /**
   * List repository issues
   */
  async githubListIssues(input: {
    owner: string;
    repo: string;
    state?: string;
    limit?: number;
  }): Promise<ToolResult> {
    const { owner, repo, state = 'open', limit = 10 } = input;
    
    try {
      const data = await this.githubFetch(
        `/repos/${owner}/${repo}/issues?state=${state}&per_page=${limit}`
      );
      
      const issues = data.map((i: any) => {
        const labels = i.labels.map((l: any) => l.name).join(', ');
        return `#${i.number} ${i.title}\n  State: ${i.state} | Labels: ${labels || 'none'}\n  ${i.html_url}`;
      }).join('\n\n');
      
      return { success: true, output: `Issues (${state}):\n\n${issues || 'No issues found'}` };
    } catch (error: any) {
      return { success: false, output: '', error: error.message };
    }
  }

  /**
   * Create a new issue
   */
  async githubCreateIssue(input: {
    owner: string;
    repo: string;
    title: string;
    body?: string;
    labels?: string[];
  }): Promise<ToolResult> {
    const { owner, repo, title, body = '', labels = [] } = input;
    
    try {
      const data = await this.githubFetch(`/repos/${owner}/${repo}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, labels }),
      });
      
      return { 
        success: true, 
        output: `Issue created: #${data.number} - ${data.title}\n${data.html_url}` 
      };
    } catch (error: any) {
      return { success: false, output: '', error: error.message };
    }
  }

  /**
   * List pull requests
   */
  async githubListPullRequests(input: {
    owner: string;
    repo: string;
    state?: string;
    limit?: number;
  }): Promise<ToolResult> {
    const { owner, repo, state = 'open', limit = 10 } = input;
    
    try {
      const data = await this.githubFetch(
        `/repos/${owner}/${repo}/pulls?state=${state}&per_page=${limit}`
      );
      
      const prs = data.map((pr: any) => 
        `#${pr.number} ${pr.title}\n  ${pr.head.ref} -> ${pr.base.ref} | ${pr.state}\n  ${pr.html_url}`
      ).join('\n\n');
      
      return { success: true, output: `Pull Requests (${state}):\n\n${prs || 'No pull requests found'}` };
    } catch (error: any) {
      return { success: false, output: '', error: error.message };
    }
  }

  /**
   * Create or update a file in a repository
   */
  async githubCreateFile(input: {
    owner: string;
    repo: string;
    path: string;
    content: string;
    message: string;
    branch?: string;
  }): Promise<ToolResult> {
    const { owner, repo, path, content, message, branch = 'main' } = input;
    
    // Check if file exists first to get SHA for update
    let sha: string | undefined;
    try {
      const existing = await this.githubFetch(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
      sha = existing.sha;
    } catch {
      // File doesn't exist, that's fine for creation
    }
    
    try {
      const data = await this.githubFetch(`/repos/${owner}/${repo}/contents/${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          content: Buffer.from(content).toString('base64'),
          branch,
          ...(sha ? { sha } : {}),
        }),
      });
      
      return { 
        success: true, 
        output: `File ${sha ? 'updated' : 'created'}: ${path}\nCommit: ${data.commit.sha}\n${data.content.html_url}` 
      };
    } catch (error: any) {
      return { success: false, output: '', error: error.message };
    }
  }
}
