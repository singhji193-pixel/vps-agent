import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Send, Loader2, Terminal, CheckCircle2, XCircle, AlertCircle, Copy, Check,
  Bug, Cpu, ListChecks, TestTube2, HeadphonesIcon, MessageSquare, ChevronDown,
  Search, Brain, Bot, Settings2, Database, Archive, GitFork, Paperclip, X, FileText, Image as ImageIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Message, VpsServer, CustomAgent } from "@shared/schema";

type AgentMode = "chat" | "debug" | "architect" | "plan" | "test" | "support";

interface ChatMessage extends Message {
  isStreaming?: boolean;
  detectedMode?: AgentMode;
  thinkingContent?: string;
  isThinking?: boolean;
  isResearching?: boolean;
}

const modeConfig: Record<AgentMode, { icon: typeof MessageSquare; label: string; color: string; description: string }> = {
  chat: { icon: MessageSquare, label: "Chat", color: "text-foreground", description: "General commands" },
  debug: { icon: Bug, label: "Debug", color: "text-red-500", description: "Troubleshooting" },
  architect: { icon: Cpu, label: "Architect", color: "text-blue-500", description: "Infrastructure analysis" },
  plan: { icon: ListChecks, label: "Plan", color: "text-green-500", description: "Implementation planning" },
  test: { icon: TestTube2, label: "Test", color: "text-purple-500", description: "Testing & verification" },
  support: { icon: HeadphonesIcon, label: "Support", color: "text-yellow-500", description: "Help & guidance" },
};

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<AgentMode | null>(null);
  const [forceMode, setForceMode] = useState<AgentMode | null>(null);
  const [enableResearch, setEnableResearch] = useState(false);
  const [enableThinking, setEnableThinking] = useState(false);
  const [selectedModel, setSelectedModel] = useState<"sonnet" | "opus">("sonnet");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentPrompt, setNewAgentPrompt] = useState("");
  const [currentThinking, setCurrentThinking] = useState("");
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: servers, isLoading: serversLoading } = useQuery<VpsServer[]>({
    queryKey: ["/api/vps-servers"],
  });

  const { data: conversationData } = useQuery<{ id: string; title: string; mode: string }>({
    queryKey: ["/api/conversations/active"],
  });

  const { data: customAgents } = useQuery<CustomAgent[]>({
    queryKey: ["/api/custom-agents"],
  });

  const { data: memoryInfo } = useQuery<{ messageCount: number; summaryCount: number; memoryStatus: string }>({
    queryKey: ["/api/conversations", conversationData?.id, "memory"],
    enabled: !!conversationData?.id,
  });

  // Load existing messages when conversation is loaded
  const { data: existingMessages } = useQuery<Message[]>({
    queryKey: [`/api/conversations/${conversationData?.id}/messages`],
    enabled: !!conversationData?.id,
  });

  // Track if we've already hydrated for this conversation
  const hydratedConvoRef = useRef<string | null>(null);

  // Reset local messages when conversation changes
  useEffect(() => {
    const currentConvoId = conversationData?.id;
    if (currentConvoId && currentConvoId !== hydratedConvoRef.current) {
      // New conversation - clear local messages and wait for history to load
      setMessages([]);
      hydratedConvoRef.current = null;
    }
  }, [conversationData?.id]);

  // Hydrate messages from existing conversation history when loaded
  useEffect(() => {
    const currentConvoId = conversationData?.id;
    if (currentConvoId && existingMessages && hydratedConvoRef.current !== currentConvoId) {
      // History loaded for this conversation - hydrate it
      hydratedConvoRef.current = currentConvoId;
      if (existingMessages.length > 0) {
        setMessages(existingMessages.map(m => ({ ...m, isStreaming: false })));
      }
    }
  }, [existingMessages, conversationData?.id]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      setIsStreaming(true);
      const currentAttachments = [...attachments];
      setAttachments([]); // Clear attachments after sending
      
      const attachmentInfo = currentAttachments.length > 0 
        ? ` [${currentAttachments.length} file(s) attached: ${currentAttachments.map(a => a.name).join(", ")}]`
        : "";
      
      const userMessage: ChatMessage = {
        id: `temp-${Date.now()}`,
        conversationId: conversationData?.id || "",
        role: "user",
        content: content + attachmentInfo,
        commandOutput: null,
        commandStatus: null,
        metadata: null,
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        conversationId: conversationData?.id || "",
        role: "assistant",
        content: "",
        commandOutput: null,
        commandStatus: null,
        metadata: null,
        createdAt: new Date(),
        isStreaming: true,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          content, 
          conversationId: conversationData?.id,
          forceMode: forceMode || undefined,
          enableResearch,
          enableThinking,
          customAgentId: selectedAgentId || undefined,
          model: selectedModel === "opus" ? "claude-opus-4-20250514" : "claude-sonnet-4-20250514",
          attachments: currentAttachments,
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
        let detectedMode: AgentMode | undefined;
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");
          
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                
                // Capture the detected mode
                if (data.mode && !detectedMode) {
                  detectedMode = data.mode as AgentMode;
                  setCurrentMode(detectedMode);
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastMessage = updated[updated.length - 1];
                    if (lastMessage.role === "assistant") {
                      lastMessage.detectedMode = detectedMode;
                    }
                    return updated;
                  });
                }

                // Handle status updates (researching, thinking)
                if (data.status === "researching") {
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastMessage = updated[updated.length - 1];
                    if (lastMessage.role === "assistant") {
                      lastMessage.isResearching = true;
                    }
                    return updated;
                  });
                }

                if (data.status === "thinking") {
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastMessage = updated[updated.length - 1];
                    if (lastMessage.role === "assistant") {
                      lastMessage.isThinking = true;
                      lastMessage.isResearching = false;
                    }
                    return updated;
                  });
                }

                // Handle thinking content
                if (data.thinking) {
                  thinkingContent += data.thinking;
                  setCurrentThinking(thinkingContent);
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastMessage = updated[updated.length - 1];
                    if (lastMessage.role === "assistant") {
                      lastMessage.thinkingContent = thinkingContent;
                    }
                    return updated;
                  });
                }
                
                if (data.content) {
                  fullContent += data.content;
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastMessage = updated[updated.length - 1];
                    if (lastMessage.role === "assistant") {
                      lastMessage.content = fullContent;
                      lastMessage.isThinking = false;
                      lastMessage.isResearching = false;
                    }
                    return updated;
                  });
                }
                if (data.commandOutput) {
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastMessage = updated[updated.length - 1];
                    if (lastMessage.role === "assistant") {
                      lastMessage.commandOutput = data.commandOutput;
                      lastMessage.commandStatus = data.commandStatus;
                    }
                    return updated;
                  });
                }
              } catch {
                // Skip invalid JSON lines
              }
            }
          }
        }
        setCurrentThinking("");
      }

      setMessages((prev) => {
        const updated = [...prev];
        const lastMessage = updated[updated.length - 1];
        if (lastMessage.role === "assistant") {
          lastMessage.isStreaming = false;
        }
        return updated;
      });

      return response;
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setMessages((prev) => prev.slice(0, -2));
    },
    onSettled: () => {
      setIsStreaming(false);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    sendMessageMutation.mutate(input);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-chart-2" />;
      case "error":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "running":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const activeServer = servers?.[0];

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 border-b">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <h1 className="text-base sm:text-lg font-semibold">Unified Agent</h1>
          
          {currentMode && isStreaming && (
            <Badge 
              variant="secondary" 
              className={`gap-1.5 ${modeConfig[currentMode].color}`}
            >
              {(() => {
                const Icon = modeConfig[currentMode].icon;
                return <Icon className="h-3 w-3" />;
              })()}
              <span className="hidden xs:inline">{modeConfig[currentMode].label} Mode</span>
              <span className="xs:hidden">{modeConfig[currentMode].label}</span>
            </Badge>
          )}
          
          {activeServer ? (
            <Badge variant="secondary" className="gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-status-online" />
              <span className="max-w-[80px] sm:max-w-none truncate">{activeServer.name}</span>
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-status-offline" />
              <span className="hidden sm:inline">No server connected</span>
              <span className="sm:hidden">No server</span>
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          {memoryInfo && (
            <Badge variant="outline" className="gap-1.5 text-xs hidden sm:flex">
              <Database className="h-3 w-3" />
              {memoryInfo.messageCount} msgs
              {memoryInfo.memoryStatus === "compressed" && " (compressed)"}
            </Badge>
          )}
          
          <div className="hidden md:flex items-center gap-2 px-2 py-1 rounded-md border bg-muted/30">
            <div className="flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <Label htmlFor="research-toggle" className="text-xs cursor-pointer">Research</Label>
              <Switch
                id="research-toggle"
                checked={enableResearch}
                onCheckedChange={setEnableResearch}
                className="scale-75"
                data-testid="switch-research"
              />
            </div>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-1.5">
              <Brain className="h-3.5 w-3.5 text-muted-foreground" />
              <Label htmlFor="thinking-toggle" className="text-xs cursor-pointer">Thinking</Label>
              <Switch
                id="thinking-toggle"
                checked={enableThinking}
                onCheckedChange={setEnableThinking}
                className="scale-75"
                data-testid="switch-thinking"
              />
            </div>
          </div>
          
          <div className="flex md:hidden items-center gap-2 px-2 py-1 rounded-md border bg-muted/30">
            <div className="flex items-center gap-1.5">
              <Search className="h-3 w-3 text-muted-foreground" />
              <Label htmlFor="research-toggle-mobile" className="text-xs cursor-pointer sr-only sm:not-sr-only">Research</Label>
              <Switch
                id="research-toggle-mobile"
                checked={enableResearch}
                onCheckedChange={setEnableResearch}
                className="scale-75"
                aria-label="Enable research mode"
                data-testid="switch-research-mobile"
              />
            </div>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-1.5">
              <Brain className="h-3 w-3 text-muted-foreground" />
              <Label htmlFor="thinking-toggle-mobile" className="text-xs cursor-pointer sr-only sm:not-sr-only">Thinking</Label>
              <Switch
                id="thinking-toggle-mobile"
                checked={enableThinking}
                onCheckedChange={setEnableThinking}
                className="scale-75"
                aria-label="Enable thinking mode"
                data-testid="switch-thinking-mobile"
              />
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2" data-testid="button-model-select">
                <Cpu className="h-4 w-4" />
                <span className="hidden sm:inline">{selectedModel === "opus" ? "Opus" : "Sonnet"}</span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSelectedModel("sonnet")} data-testid="menu-item-sonnet">
                <Cpu className="h-4 w-4 mr-2" />
                <div className="flex flex-col">
                  <span>Sonnet</span>
                  <span className="text-xs text-muted-foreground">Faster, $3/$15 per 1M tokens</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedModel("opus")} data-testid="menu-item-opus">
                <Cpu className="h-4 w-4 mr-2" />
                <div className="flex flex-col">
                  <span>Opus</span>
                  <span className="text-xs text-muted-foreground">Smarter, $15/$75 per 1M tokens</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2" data-testid="button-agent-select">
                <Bot className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {selectedAgentId 
                    ? customAgents?.find(a => a.id === selectedAgentId)?.name || "Custom"
                    : "Default Agent"
                  }
                </span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSelectedAgentId(null)}>
                <Bot className="h-4 w-4 mr-2" />
                Default Agent
              </DropdownMenuItem>
              {customAgents && customAgents.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  {customAgents.map((agent) => (
                    <DropdownMenuItem 
                      key={agent.id}
                      onClick={() => setSelectedAgentId(agent.id)}
                    >
                      <Settings2 className="h-4 w-4 mr-2" />
                      {agent.name}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setAgentDialogOpen(true)}>
                <Settings2 className="h-4 w-4 mr-2" />
                Create Custom Agent
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2" data-testid="button-mode-override">
                {forceMode ? (
                  <>
                    {(() => {
                      const Icon = modeConfig[forceMode].icon;
                      return <Icon className={`h-4 w-4 ${modeConfig[forceMode].color}`} />;
                    })()}
                    {modeConfig[forceMode].label}
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-4 w-4" />
                    Auto
                  </>
                )}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={() => setForceMode(null)}
                data-testid="menu-item-auto"
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                <div>
                  <div className="font-medium">Auto Detect</div>
                  <div className="text-xs text-muted-foreground">AI picks the best mode</div>
                </div>
              </DropdownMenuItem>
              {(Object.keys(modeConfig) as AgentMode[]).map((mode) => {
                const config = modeConfig[mode];
                const Icon = config.icon;
                return (
                  <DropdownMenuItem 
                    key={mode} 
                    onClick={() => setForceMode(mode)}
                    data-testid={`menu-item-${mode}`}
                  >
                    <Icon className={`h-4 w-4 mr-2 ${config.color}`} />
                    <div>
                      <div className="font-medium">{config.label}</div>
                      <div className="text-xs text-muted-foreground">{config.description}</div>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={agentDialogOpen} onOpenChange={setAgentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Custom Agent</DialogTitle>
            <DialogDescription>
              Define a custom system prompt to personalize how the AI responds.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="agent-name">Agent Name</Label>
              <Input
                id="agent-name"
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                placeholder="e.g., Docker Expert"
                data-testid="input-agent-name"
              />
            </div>
            <div>
              <Label htmlFor="agent-prompt">System Prompt</Label>
              <Textarea
                id="agent-prompt"
                value={newAgentPrompt}
                onChange={(e) => setNewAgentPrompt(e.target.value)}
                placeholder="You are a Docker and containerization expert..."
                className="min-h-32"
                data-testid="input-agent-prompt"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAgentDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={async () => {
                try {
                  await apiRequest("POST", "/api/custom-agents", {
                    name: newAgentName,
                    systemPrompt: newAgentPrompt,
                  });
                  queryClient.invalidateQueries({ queryKey: ["/api/custom-agents"] });
                  setAgentDialogOpen(false);
                  setNewAgentName("");
                  setNewAgentPrompt("");
                  toast({ title: "Custom agent created" });
                } catch {
                  toast({ title: "Failed to create agent", variant: "destructive" });
                }
              }}
              disabled={!newAgentName || !newAgentPrompt}
              data-testid="button-create-agent"
            >
              Create Agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScrollArea className="flex-1 p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted mb-4">
                <Terminal className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Start a conversation</h2>
              <p className="text-muted-foreground max-w-md">
                Ask me to manage your VPS, install software, run commands, or troubleshoot issues. 
                I'll remember our conversation context.
              </p>
              <div className="grid gap-2 mt-6 w-full max-w-md">
                {[
                  "Install Docker on my VPS",
                  "Check disk space and memory usage",
                  "Set up erpNext in Docker",
                  "Show running processes",
                ].map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    className="justify-start text-left h-auto py-3 px-4"
                    onClick={() => {
                      setInput(suggestion);
                      textareaRef.current?.focus();
                    }}
                    data-testid={`suggestion-${suggestion.slice(0, 20)}`}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-3xl ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground rounded-lg px-4 py-3"
                      : "w-full"
                  }`}
                >
                  {message.role === "user" ? (
                    <p className="whitespace-pre-wrap" data-testid={`message-user-${message.id}`}>
                      {message.content}
                    </p>
                  ) : (
                    <div className="space-y-3" data-testid={`message-assistant-${message.id}`}>
                      {message.detectedMode && message.detectedMode !== "chat" && (
                        <Badge 
                          variant="outline" 
                          className={`gap-1 text-xs ${modeConfig[message.detectedMode].color}`}
                        >
                          {(() => {
                            const Icon = modeConfig[message.detectedMode!].icon;
                            return <Icon className="h-3 w-3" />;
                          })()}
                          {modeConfig[message.detectedMode].label} Mode
                        </Badge>
                      )}
                      
                      {message.isResearching && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Search className="h-4 w-4 animate-pulse" />
                          <span>Searching the web for relevant information...</span>
                        </div>
                      )}
                      
                      {message.isThinking && message.thinkingContent && (
                        <Card className="bg-muted/30 border-dashed">
                          <div className="flex items-center gap-2 px-3 py-2 border-b border-dashed">
                            <Brain className="h-4 w-4 text-purple-500 animate-pulse" />
                            <span className="text-xs font-medium">Thinking...</span>
                          </div>
                          <div className="p-3 text-xs text-muted-foreground font-mono max-h-32 overflow-y-auto">
                            {message.thinkingContent}
                          </div>
                        </Card>
                      )}
                      
                      {!message.isThinking && message.thinkingContent && (
                        <details className="group">
                          <summary className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                            <Brain className="h-3 w-3" />
                            <span>View thinking process</span>
                          </summary>
                          <Card className="mt-2 bg-muted/30 border-dashed">
                            <div className="p-3 text-xs text-muted-foreground font-mono max-h-48 overflow-y-auto">
                              {message.thinkingContent}
                            </div>
                          </Card>
                        </details>
                      )}
                      
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        {message.content || (message.isStreaming && !message.isThinking && !message.isResearching && (
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-muted-foreground">Analyzing your request...</span>
                          </div>
                        ))}
                        {message.isStreaming && message.content && (
                          <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
                        )}
                      </div>
                      
                      {message.commandOutput && (
                        <Card className="bg-card/50 overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(message.commandStatus)}
                              <span className="text-xs font-medium uppercase tracking-wide">
                                Command Output
                              </span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => copyToClipboard(message.commandOutput!, message.id)}
                              data-testid={`button-copy-${message.id}`}
                            >
                              {copiedId === message.id ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                          <pre className="p-3 text-sm font-mono overflow-x-auto whitespace-pre-wrap bg-background/50">
                            {message.commandOutput}
                          </pre>
                        </Card>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="p-3 sm:p-4 border-t bg-background">
        {messages.length > 0 && conversationData?.id && (
          <div className="flex items-center justify-center gap-2 mb-3 max-w-4xl mx-auto">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={async () => {
                try {
                  const response = await apiRequest("POST", `/api/conversations/${conversationData.id}/archive`);
                  const data = await response.json();
                  if (data.archiveUrl) {
                    toast({ 
                      title: "Conversation archived",
                      description: "Saved to GitHub."
                    });
                  }
                } catch {
                  toast({ title: "Archive failed", description: "Make sure GitHub is connected.", variant: "destructive" });
                }
              }}
              data-testid="button-archive-conversation"
            >
              <Archive className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Archive to GitHub</span>
              <span className="sm:hidden">Archive</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={async () => {
                try {
                  const response = await apiRequest("POST", `/api/conversations/${conversationData.id}/fork`);
                  const data = await response.json();
                  if (data.conversation) {
                    setMessages([]);
                    queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/conversations/active"] });
                    toast({ 
                      title: "Conversation forked",
                      description: "Started new chat with context."
                    });
                  }
                } catch {
                  toast({ title: "Fork failed", variant: "destructive" });
                }
              }}
              data-testid="button-fork-conversation"
            >
              <GitFork className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Fork & Continue</span>
              <span className="sm:hidden">Fork</span>
            </Button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2 p-2 bg-muted/50 rounded-lg">
              {attachments.map((attachment, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 bg-background rounded-md px-2 py-1.5 border text-sm"
                >
                  {attachment.preview ? (
                    <img 
                      src={attachment.preview} 
                      alt={attachment.name}
                      className="h-8 w-8 object-cover rounded"
                    />
                  ) : attachment.type.startsWith("image/") ? (
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="max-w-[100px] truncate">{attachment.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => removeAttachment(index)}
                    data-testid={`button-remove-attachment-${index}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="relative">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.md,.csv,.json"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileUpload(e.target.files);
                  e.target.value = "";
                }
              }}
              data-testid="input-file-upload"
            />
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me to manage your VPS... (attach files with the paperclip)"
              className="min-h-[50px] sm:min-h-[60px] max-h-48 resize-none pr-24 sm:pr-28 text-sm sm:text-base"
              disabled={isStreaming}
              data-testid="input-chat-message"
            />
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming || isUploading}
                data-testid="button-attach-file"
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </Button>
              <Button
                type="submit"
                size="icon"
                disabled={(!input.trim() && attachments.length === 0) || isStreaming}
                data-testid="button-send-message"
              >
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center hidden sm:block">
            {activeServer
              ? `Connected to ${activeServer.name} • Commands will execute on this server`
              : "Connect a VPS server to execute commands"}
            {attachments.length > 0 && ` • ${attachments.length} file(s) attached`}
          </p>
        </form>
      </div>
    </div>
  );
}
