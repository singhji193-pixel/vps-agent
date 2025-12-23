/**
 * VPS Agent - Agentic Chat Handler
 * 
 * This is the core engine that makes VPS Agent work like Cursor/Emergent.sh
 * It enables Claude to autonomously execute tools on VPS servers.
 * 
 * Enhanced with: Research mode, Model selection, Attachments, Conversation persistence
 */

import Anthropic from "@anthropic-ai/sdk";
import { Request, Response } from "express";
import { VPS_TOOLS, isDangerousCommand } from "./tools/index";
import { ToolExecutor } from "./tools/executor";
import { storage } from "./storage";
import { getApiKeys } from "./api-keys";

// Maximum iterations to prevent infinite loops
const MAX_TOOL_ITERATIONS = 10;

interface Attachment {
  name: string;
  type: string;
  content?: string;
  base64?: string;
  mediaType?: string;
}

interface AgenticChatParams {
  userId: string;
  content: string;
  conversationId?: string;
  serverId: string;
  serverConnection: {
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string;
  };
  model?: string;
  enableThinking?: boolean;
  enableResearch?: boolean;
  attachments?: Attachment[];
}

// Perplexity API for research mode
async function performWebResearch(
  query: string, 
  perplexityApiKey: string,
  userId: string,
  conversationId: string
): Promise<{ answer: string; citations: string[] }> {
  if (!perplexityApiKey) {
    return { answer: "", citations: [] };
  }
  
  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${perplexityApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-sonar-small-128k-online",
        messages: [
          { role: "system", content: "Provide concise, technical answers focused on server administration, DevOps, and VPS management." },
          { role: "user", content: query }
        ],
        max_tokens: 1500,
        temperature: 0.2,
      }),
    });
    
    if (!response.ok) {
      return { answer: "", citations: [] };
    }
    
    const data = await response.json();
    
    // Track Perplexity usage
    if (data.usage) {
      const inputTokens = data.usage.prompt_tokens || 0;
      const outputTokens = data.usage.completion_tokens || 0;
      const totalTokens = inputTokens + outputTokens;
      // Perplexity pricing: ~$0.20/1M tokens for sonar-small
      const estimatedCost = totalTokens * 0.0000002;
      
      try {
        await storage.createApiUsage({
          userId,
          conversationId,
          model: "llama-3.1-sonar-small-128k-online",
          inputTokens,
          outputTokens,
          totalTokens,
          estimatedCost: estimatedCost.toFixed(6),
        });
      } catch (e) {
        console.error("Failed to track Perplexity usage:", e);
      }
    }
    
    return {
      answer: data.choices?.[0]?.message?.content || "",
      citations: data.citations || [],
    };
  } catch {
    return { answer: "", citations: [] };
  }
}

// Build the agentic system prompt
function buildAgenticSystemPrompt(serverInfo: string, commandHistory: string, githubInfo: string): string {
  return `You are VPS Agent, an AI-powered DevOps assistant with FULL ACCESS to manage VPS servers autonomously.

## CAPABILITIES
You have access to powerful tools that let you execute commands, read/write files, manage Docker, configure Nginx, and more on the connected VPS server.

## CURRENT SERVER CONTEXT
${serverInfo}

## GITHUB REPOSITORY
${githubInfo}

## RECENT COMMAND HISTORY
${commandHistory || "No recent commands."}

## OPERATING PRINCIPLES

### 1. BE PROACTIVE & AUTONOMOUS
- When given a task, break it down and execute the steps yourself
- Don't just tell the user what to do - DO IT for them
- Use tools iteratively until the task is complete
- Verify your work after making changes
- For deployments, use the connected GitHub repository automatically

### 2. SAFETY FIRST
- ALWAYS explain what you're about to do before executing
- For dangerous operations (delete, stop services, modify configs), the tool will ask for approval
- Never execute commands that could lock users out (disable SSH, firewall mistakes)
- Create backups before modifying critical files

### 3. BEST PRACTICES
- Check current state before making changes
- Use appropriate tools (e.g., docker_manage for Docker, not raw commands)
- Verify changes worked after execution
- Clean up temporary files
- For git operations, use the connected GitHub repo URL and credentials

### 4. COMMUNICATION
- Keep the user informed of progress
- Explain errors clearly and suggest fixes
- Summarize what was accomplished at the end

## TOOL USAGE FLOW
1. Analyze the request
2. Plan the steps needed
3. Execute tools one by one
4. Verify results
5. Report success or handle errors

When you need to execute commands or make changes, USE YOUR TOOLS. Don't just describe what to do.`;
}

// Process a single tool call
async function processToolCall(
  executor: ToolExecutor,
  toolName: string,
  toolInput: Record<string, any>,
  res: Response
): Promise<{ success: boolean; content: string; requiresApproval?: boolean; pendingCommand?: string }> {
  // Stream tool execution start
  res.write(`data: ${JSON.stringify({ 
    toolCall: { name: toolName, input: toolInput, status: "executing" } 
  })}\n\n`);

  const startTime = Date.now();
  const result = await executor.execute(toolName, toolInput);
  const duration = Date.now() - startTime;

  if (result.requires_approval) {
    // Tool requires user approval
    res.write(`data: ${JSON.stringify({ 
      toolCall: { 
        name: toolName, 
        status: "requires_approval",
        pendingCommand: result.pending_command,
        message: result.error
      } 
    })}\n\n`);

    return {
      success: false,
      content: result.error || "This action requires your approval.",
      requiresApproval: true,
      pendingCommand: result.pending_command
    };
  }

  // Stream tool result
  res.write(`data: ${JSON.stringify({ 
    toolCall: { 
      name: toolName, 
      status: result.success ? "success" : "error",
      duration,
      outputPreview: result.output.slice(0, 500)
    } 
  })}\n\n`);

  return {
    success: result.success,
    content: result.success 
      ? result.output 
      : `Error: ${result.error || "Tool execution failed"}\n${result.output || ""}`
  };
}

// Main agentic chat handler
export async function handleAgenticChat(
  params: AgenticChatParams,
  res: Response
): Promise<void> {
  const {
    userId,
    content,
    conversationId,
    serverId,
    serverConnection,
    model = "claude-sonnet-4-20250514",
    enableThinking = false,
    enableResearch = false,
    attachments = [],
  } = params;

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    // Get user's API keys (from DB or env fallback)
    const apiKeys = await getApiKeys(userId);
    if (!apiKeys.anthropicApiKey) {
      res.write(`data: ${JSON.stringify({ error: "No Claude API key configured. Please add one in Settings." })}\n\n`);
      res.end();
      return;
    }

    // Create Anthropic client with user's API key
    const anthropic = new Anthropic({
      apiKey: apiKeys.anthropicApiKey,
    });

    // Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = await storage.getConversation(conversationId);
    }
    if (!conversation) {
      conversation = await storage.createConversation({
        userId,
        title: content.slice(0, 50),
        mode: "agent",
        vpsServerId: serverId,
      });
    }

    // Send conversation ID to frontend
    res.write(`data: ${JSON.stringify({ conversationId: conversation.id })}\n\n`);

    // Build user message with attachments
    let userMessageContent = content;
    if (attachments.length > 0) {
      const attachmentDescriptions = attachments.map(a => {
        if (a.content) {
          return `

--- Attached File: ${a.name} ---
${a.content}
--- End of ${a.name} ---`;
        }
        return `\n[Attached: ${a.name}]`;
      }).join("");
      userMessageContent += attachmentDescriptions;
    }

    // Save user message
    await storage.createMessage({
      conversationId: conversation.id,
      role: "user",
      content: userMessageContent,
    });

    // Perform research if enabled
    let researchContext = "";
    if (enableResearch) {
      res.write(`data: ${JSON.stringify({ status: "researching" })}\n\n`);
      const research = await performWebResearch(content, apiKeys.perplexityApiKey, userId, conversation.id);
      if (research.answer) {
        researchContext = "\n\n## Web Research Results\n" + research.answer;
        if (research.citations.length > 0) {
          researchContext += "\n\nSources:\n" + research.citations.map((c, i) => `${i + 1}. ${c}`).join("\n");
        }
        res.write(`data: ${JSON.stringify({ research: { found: true, citations: research.citations.length } })}\n\n`);
      }
    }

    // Build context
    const server = await storage.getVpsServer(serverId);
    const serverInfo = server 
      ? `Server: ${server.name} (${server.host}:${server.port ?? 22}, user: ${server.username})`
      : "No server connected";

    // Get GitHub integration
    const githubIntegration = await storage.getGithubIntegration(userId);
    const githubInfo = githubIntegration
      ? `Connected: ${githubIntegration.repositoryUrl} (branch: ${githubIntegration.branch || "main"})
You can clone/pull this repo using: git clone ${githubIntegration.repositoryUrl}
For private repos, use: git clone https://<token>@github.com/... (token available in integration)`
      : "No GitHub repository connected. User can connect one in the GitHub Integration page.";

    const cmdHistory = await storage.getCommandHistory(userId);
    const recentCmds = cmdHistory.slice(0, 10);
    const commandHistoryStr = recentCmds
      .map(c => `[${c.exitCode === 0 ? '✓' : '✗'}] ${c.command}`)
      .join("\n");

    let systemPrompt = buildAgenticSystemPrompt(serverInfo, commandHistoryStr, githubInfo);
    if (researchContext) {
      systemPrompt += researchContext;
    }

    // Initialize tool executor
    const executor = new ToolExecutor(serverConnection, userId, serverId);

    // Get conversation history
    const history = await storage.getMessages(conversation.id);
    const messages: Anthropic.Messages.MessageParam[] = history.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Ensure last message is the current user message
    if (messages.length === 0 || messages[messages.length - 1].content !== content) {
      messages.push({ role: "user", content });
    }

    // Agentic loop - continue until Claude stops using tools
    let iterations = 0;
    let fullResponse = "";
    let toolsUsed: string[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++;

      res.write(`data: ${JSON.stringify({ iteration: iterations })}\n\n`);

      // Call Claude with tools
      const response = await anthropic.messages.create({
        model,
        max_tokens: 8192,
        system: systemPrompt,
        tools: VPS_TOOLS,
        messages,
      });

      // Track token usage from response
      if (response.usage) {
        totalInputTokens += response.usage.input_tokens;
        totalOutputTokens += response.usage.output_tokens;
      }

      // Process the response
      let hasToolUse = false;
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      let textContent = "";

      for (const block of response.content) {
        if (block.type === "text") {
          textContent += block.text;
          // Stream text content
          res.write(`data: ${JSON.stringify({ content: block.text })}\n\n`);
        } else if (block.type === "tool_use") {
          hasToolUse = true;
          toolsUsed.push(block.name);

          // Execute the tool
          const toolResult = await processToolCall(
            executor,
            block.name,
            block.input as Record<string, any>,
            res
          );

          if (toolResult.requiresApproval) {
            // Stop and wait for approval
            fullResponse += textContent + `\n\n⚠️ **Approval Required**\n${toolResult.content}`;
            
            // Save the pending approval
            // (In a real implementation, you'd save this to the database)
            
            await storage.createMessage({
              conversationId: conversation.id,
              role: "assistant",
              content: fullResponse,
              metadata: JSON.stringify({
                mode: "agent",
                toolsUsed,
                pendingApproval: true,
                pendingCommand: toolResult.pendingCommand
              }),
            });

            res.write(`data: ${JSON.stringify({ 
              done: true, 
              mode: "agent",
              pendingApproval: true,
              toolsUsed 
            })}\n\n`);
            res.end();
            return;
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: toolResult.content.slice(0, 50000), // Limit output size
          });
        }
      }

      fullResponse += textContent;

      // If no tool use, we're done
      if (!hasToolUse) {
        break;
      }

      // Add assistant message and tool results to messages for next iteration
      messages.push({
        role: "assistant",
        content: response.content,
      });

      messages.push({
        role: "user",
        content: toolResults,
      });

    }

    // Track API usage
    try {
      const totalTokens = totalInputTokens + totalOutputTokens;
      // Pricing: Sonnet $3/1M input, $15/1M output; Opus $15/1M input, $75/1M output
      const isOpus = model.includes("opus");
      const inputRate = isOpus ? 0.000015 : 0.000003;
      const outputRate = isOpus ? 0.000075 : 0.000015;
      const estimatedCost = (totalInputTokens * inputRate) + (totalOutputTokens * outputRate);
      
      await storage.createApiUsage({
        userId,
        conversationId: conversation.id,
        model,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens,
        estimatedCost: estimatedCost.toFixed(6),
      });
    } catch (usageError) {
      console.error("Failed to track usage:", usageError);
    }

    // Save final assistant message
    await storage.createMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: fullResponse,
      metadata: JSON.stringify({
        mode: "agent",
        toolsUsed,
        iterations,
      }),
    });

    // Send completion with conversation ID
    res.write(`data: ${JSON.stringify({ 
      done: true, 
      conversationId: conversation.id,
      mode: "agent",
      toolsUsed,
      iterations
    })}\n\n`);
    res.end();

  } catch (error: any) {
    console.error("Agentic chat error:", error);
    res.write(`data: ${JSON.stringify({ error: error.message || "Agentic chat failed" })}\n\n`);
    res.end();
  }
}

// Handle approval of pending commands
export async function handleApproval(
  userId: string,
  approvalId: string,
  approved: boolean,
  serverConnection: {
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string;
  },
  serverId: string
): Promise<{ success: boolean; output?: string; error?: string }> {
  // In a full implementation, you'd fetch the pending approval from the database
  // and execute or reject it
  
  if (!approved) {
    return { success: true, output: "Command rejected by user." };
  }

  // Execute the approved command
  const executor = new ToolExecutor(serverConnection, userId, serverId);
  
  // The approval would contain the tool name and input
  // For now, this is a placeholder
  return { success: true, output: "Approval handled." };
}
