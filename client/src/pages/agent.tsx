/**
 * Live Agent Page - Emergent.sh/Cursor-level VPS Agent
 * 
 * Real-time AI agent that autonomously executes tools with:
 * - Live tool execution visualization
 * - Command approval workflow
 * - Thinking process display
 * - Streaming responses
 * - Research mode (Perplexity)
 * - Model selection (Sonnet/Opus)
 * - File attachments
 * - Conversation persistence
 */

import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Send,
  Loader2,
  Sparkles,
  Bot,
  User,
  ChevronDown,
  ChevronRight,
  Play,
  Square,
  Eye,
  EyeOff,
  Server,
  Search,
  Brain,
  Cpu,
  Paperclip,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { VpsServer } from "@shared/schema";
import { AgentMessageComponent } from "@/components/agent/AgentMessage";
import { ApprovalDialog } from "@/components/agent/ApprovalDialog";

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
  status: "running" | "completed" | "failed" | "pending_approval";
  output?: string;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  thinking?: string;
  isStreaming?: boolean;
  timestamp: Date;
}

interface PendingApproval {
  command: string;
  explanation: string;
  toolCallId: string;
}


export default function AgentPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState<string>("");
  const [showThinking, setShowThinking] = useState(true);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [currentThinking, setCurrentThinking] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  
  // Enhanced features from Unified Agent
  const [enableResearch, setEnableResearch] = useState(false);
  const [selectedModel, setSelectedModel] = useState<"sonnet" | "opus">("sonnet");
  const [attachments, setAttachments] = useState<Array<{
    name: string;
    type: string;
    size: number;
    content?: string;
    base64?: string;
    mediaType?: string;
    preview?: string;
  }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: servers, isLoading: serversLoading } = useQuery<VpsServer[]>({
    queryKey: ["/api/vps-servers"],
  });

  const { data: toolsData } = useQuery<{ tools: { name: string; description: string }[] }>({
    queryKey: ["/api/agent/tools"],
  });

  useEffect(() => {
    if (servers?.length && !selectedServerId) {
      setSelectedServerId(servers[0].id);
    }
  }, [servers, selectedServerId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentThinking]);

  const toggleToolExpanded = (toolId: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  };

  const handleApproval = async (approved: boolean) => {
    if (!pendingApproval) return;

    try {
      await apiRequest("POST", "/api/agent/approve", {
        serverId: selectedServerId,
        pendingCommand: pendingApproval.command,
        approved,
      });

      if (approved) {
        toast({ title: "Command approved and executed" });
      } else {
        toast({ title: "Command rejected" });
      }
    } catch (error: any) {
      toast({ title: "Approval failed", description: error.message, variant: "destructive" });
    }

    setPendingApproval(null);
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  };

  // File upload handler
  const handleFileUpload = async (files: FileList) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach(file => formData.append("files", file));
      
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      
      const data = await response.json();
      const newAttachments = data.files.map((f: any) => ({
        ...f,
        preview: f.base64 && f.mediaType ? `data:${f.mediaType};base64,${f.base64}` : undefined,
      }));
      
      setAttachments(prev => [...prev, ...newAttachments]);
      toast({ title: `${files.length} file(s) attached` });
    } catch (error) {
      toast({ title: "Failed to upload file", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const sendMessage = async () => {
    if (!input.trim() || isStreaming || !selectedServerId) return;

    const savedAttachments = [...attachments];
    const attachmentInfo = savedAttachments.length > 0 
      ? ` [${savedAttachments.length} file(s) attached: ${savedAttachments.map(a => a.name).join(", ")}]`
      : "";

    const userMessage: AgentMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input + attachmentInfo,
      timestamp: new Date(),
    };

    const assistantMessage: AgentMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      toolCalls: [],
      isStreaming: true,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setAttachments([]);
    setIsStreaming(true);
    setCurrentThinking("");

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          content: input,
          conversationId,
          serverId: selectedServerId,
          model: selectedModel === "opus" ? "claude-opus-4-20250514" : "claude-sonnet-4-20250514",
          enableThinking: true,
          enableResearch,
          attachments: savedAttachments,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let fullContent = "";
        let thinkingContent = "";
        const toolCalls: ToolCall[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                // Handle conversation ID (store for persistence)
                if (data.conversationId) {
                  setConversationId(data.conversationId);
                }

                // Handle research status
                if (data.status === "researching") {
                  toast({ title: "Researching...", description: "Searching the web for relevant information" });
                }

                // Handle research results
                if (data.research) {
                  toast({ title: "Research complete", description: `Found ${data.research.citations} sources` });
                }

                // Handle thinking
                if (data.thinking) {
                  thinkingContent += data.thinking;
                  setCurrentThinking(thinkingContent);
                }

                // Handle content
                if (data.content) {
                  fullContent += data.content;
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastMsg = updated[updated.length - 1];
                    if (lastMsg.role === "assistant") {
                      lastMsg.content = fullContent;
                      lastMsg.thinking = thinkingContent;
                    }
                    return updated;
                  });
                }

                // Handle tool calls (backend sends toolCall object)
                if (data.toolCall) {
                  const tc = data.toolCall;
                  
                  if (tc.status === "executing") {
                    // New tool started
                    const toolCall: ToolCall = {
                      id: `tool-${Date.now()}-${tc.name}`,
                      name: tc.name,
                      input: tc.input || {},
                      status: "running",
                      startedAt: new Date(),
                    };
                    toolCalls.push(toolCall);
                  } else if (tc.status === "success" || tc.status === "error") {
                    // Tool completed
                    const lastTool = toolCalls[toolCalls.length - 1];
                    if (lastTool && lastTool.name === tc.name) {
                      lastTool.status = tc.status === "success" ? "completed" : "failed";
                      lastTool.output = tc.outputPreview;
                      lastTool.completedAt = new Date();
                    }
                  } else if (tc.status === "requires_approval") {
                    // Tool needs approval
                    const lastTool = toolCalls[toolCalls.length - 1];
                    if (lastTool) {
                      lastTool.status = "pending_approval";
                    }
                    setPendingApproval({
                      command: tc.pendingCommand || "",
                      explanation: tc.message || "This action requires approval",
                      toolCallId: lastTool?.id || "",
                    });
                  }
                  
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastMsg = updated[updated.length - 1];
                    if (lastMsg.role === "assistant") {
                      lastMsg.toolCalls = [...toolCalls];
                    }
                    return updated;
                  });
                }

                // Handle iteration updates
                if (data.iteration) {
                  // Could display iteration count
                }

                // Handle legacy tool_use format (just in case)
                if (data.tool_use) {
                  const toolCall: ToolCall = {
                    id: data.tool_use.id || `tool-${Date.now()}`,
                    name: data.tool_use.name,
                    input: data.tool_use.input || {},
                    status: "running",
                    startedAt: new Date(),
                  };
                  toolCalls.push(toolCall);
                  
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastMsg = updated[updated.length - 1];
                    if (lastMsg.role === "assistant") {
                      lastMsg.toolCalls = [...toolCalls];
                    }
                    return updated;
                  });
                }

                // Handle tool result
                if (data.tool_result) {
                  const toolIndex = toolCalls.findIndex(t => t.id === data.tool_result.id);
                  if (toolIndex >= 0) {
                    toolCalls[toolIndex].status = data.tool_result.success ? "completed" : "failed";
                    toolCalls[toolIndex].output = data.tool_result.output;
                    toolCalls[toolIndex].error = data.tool_result.error;
                    toolCalls[toolIndex].completedAt = new Date();

                    setMessages((prev) => {
                      const updated = [...prev];
                      const lastMsg = updated[updated.length - 1];
                      if (lastMsg.role === "assistant") {
                        lastMsg.toolCalls = [...toolCalls];
                      }
                      return updated;
                    });
                  }
                }

                // Handle approval request
                if (data.requires_approval) {
                  setPendingApproval({
                    command: data.pending_command,
                    explanation: data.error || "This command requires approval",
                    toolCallId: data.tool_id || "",
                  });
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }

        // Finalize
        setMessages((prev) => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg.role === "assistant") {
            lastMsg.isStreaming = false;
            lastMsg.thinking = thinkingContent;
          }
          return updated;
        });
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        toast({ title: "Generation stopped" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    } finally {
      setIsStreaming(false);
      setCurrentThinking("");
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendMessage();
    }
  };

  const selectedServer = servers?.find((s) => s.id === selectedServerId);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 border-b bg-background/95">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
            <Bot className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold flex items-center gap-2 flex-wrap">
              Live Agent
              <Badge variant="outline" className="text-xs hidden sm:inline-flex">
                <Sparkles className="h-3 w-3 mr-1" />
                Emergent-level
              </Badge>
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {toolsData?.tools.length || 0} tools
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Research Toggle */}
          <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded-md border bg-muted/30">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <Label htmlFor="research-toggle" className="text-xs cursor-pointer">Research</Label>
            <Switch
              id="research-toggle"
              checked={enableResearch}
              onCheckedChange={setEnableResearch}
              className="scale-75"
            />
          </div>

          {/* Model Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1 h-8 px-2 sm:px-3">
                <Cpu className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs">{selectedModel === "opus" ? "Opus" : "Sonnet"}</span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSelectedModel("sonnet")}>
                <Cpu className="h-4 w-4 mr-2" />
                <div className="flex flex-col">
                  <span>Sonnet</span>
                  <span className="text-xs text-muted-foreground">Faster, $3/$15 per 1M</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedModel("opus")}>
                <Cpu className="h-4 w-4 mr-2" />
                <div className="flex flex-col">
                  <span>Opus</span>
                  <span className="text-xs text-muted-foreground">Smarter, $15/$75 per 1M</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowThinking(!showThinking)}
            className="h-8 px-2 sm:px-3"
          >
            {showThinking ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            <span className="hidden sm:inline ml-1">Thinking</span>
          </Button>

          <Select value={selectedServerId} onValueChange={setSelectedServerId}>
            <SelectTrigger className="w-[160px] sm:w-[220px] h-8 sm:h-9 border-primary/30">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <Server className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="Select server" />
              </div>
            </SelectTrigger>
            <SelectContent className="z-50">
              {serversLoading ? (
                <SelectItem value="loading" disabled>
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading servers...</span>
                  </div>
                </SelectItem>
              ) : servers?.length === 0 ? (
                <SelectItem value="none" disabled>
                  No servers - add one first
                </SelectItem>
              ) : (
                servers?.map((server) => (
                  <SelectItem key={server.id} value={server.id}>
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full shrink-0 ${server.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                      <Server className="h-4 w-4 shrink-0" />
                      <span>{server.name}</span>
                      <span className="text-xs text-muted-foreground">({server.host})</span>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-3 sm:p-4">
        <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-8 sm:py-16 px-4">
              <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-gradient-to-br from-violet-500/20 to-purple-600/20 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="h-6 w-6 sm:h-8 sm:w-8 text-violet-500" />
              </div>
              <h2 className="text-lg sm:text-xl font-semibold mb-2">VPS Agent Ready</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Execute commands, manage files, Docker, Nginx, SSL and more—autonomously.
              </p>
              <div className="flex flex-wrap gap-2 justify-center mt-4 sm:mt-6">
                {["Check disk usage", "List containers", "System metrics"].map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    className="text-xs sm:text-sm"
                    onClick={() => setInput(suggestion)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <AgentMessageComponent
              key={message.id}
              message={message}
              showThinking={showThinking}
              expandedTools={expandedTools}
              onToggleToolExpanded={toggleToolExpanded}
            />
          ))}

          {/* Live Thinking */}
          {isStreaming && currentThinking && showThinking && (
            <div className="flex items-start gap-2 sm:gap-3 opacity-70">
              <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
                <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="text-xs text-muted-foreground">Thinking...</span>
                </div>
                <div className="bg-muted/30 rounded-lg p-2 sm:p-3 text-xs sm:text-sm text-muted-foreground italic overflow-hidden">
                  {currentThinking.slice(-300)}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-3 sm:p-4 border-t bg-background/95">
        <div className="max-w-4xl mx-auto">
          {/* Attachments Preview */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attachments.map((attachment, index) => (
                <div
                  key={index}
                  className="flex items-center gap-1.5 bg-muted px-2 py-1 rounded-md text-xs"
                >
                  {attachment.mediaType?.startsWith("image/") ? (
                    <ImageIcon className="h-3 w-3" />
                  ) : (
                    <Paperclip className="h-3 w-3" />
                  )}
                  <span className="max-w-[100px] truncate">{attachment.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 hover:bg-destructive/20"
                    onClick={() => removeAttachment(index)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            {/* File Upload */}
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              accept="image/*,.txt,.md,.json,.yml,.yaml,.xml,.csv,.log,.sh,.py,.js,.ts,.html,.css"
              onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
            />
            <Button
              variant="outline"
              size="icon"
              className="h-[50px] w-[50px] sm:h-[60px] sm:w-[60px] shrink-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isStreaming}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="h-4 w-4 sm:h-5 sm:w-5" />
              )}
            </Button>

            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  selectedServer
                    ? `Ask about ${selectedServer.name}...`
                    : "Select a server..."
                }
                className="min-h-[50px] sm:min-h-[60px] resize-none text-sm sm:text-base"
                disabled={!selectedServerId || isStreaming}
              />
            </div>
            {isStreaming ? (
              <Button onClick={stopGeneration} variant="destructive" size="icon" className="h-[50px] w-[50px] sm:h-[60px] sm:w-[60px] shrink-0">
                <Square className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            ) : (
              <Button
                onClick={sendMessage}
                disabled={!input.trim() || !selectedServerId}
                className="h-[50px] w-[50px] sm:h-[60px] sm:w-[60px] shrink-0 bg-gradient-to-br from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
              >
                <Send className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center hidden sm:block">
            Ctrl+Enter to send {enableResearch && "• Research enabled"} • Agent executes tools autonomously
          </p>
        </div>
      </div>

      <ApprovalDialog
        open={!!pendingApproval}
        pendingApproval={pendingApproval}
        onApprove={handleApproval}
      />
    </div>
  );
}
