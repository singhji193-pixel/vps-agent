import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Send,
  Loader2,
  HeadphonesIcon,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Message, VpsServer } from "@shared/schema";

interface SupportMessage extends Message {
  isStreaming?: boolean;
  suggestions?: string[];
  troubleshootingSteps?: {
    step: number;
    title: string;
    description: string;
    command?: string;
    status?: "pending" | "completed" | "failed";
  }[];
}

export default function SupportPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data: servers } = useQuery<VpsServer[]>({
    queryKey: ["/api/vps-servers"],
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      setIsStreaming(true);

      const userMessage: SupportMessage = {
        id: `temp-${Date.now()}`,
        conversationId: "",
        role: "user",
        content,
        commandOutput: null,
        commandStatus: null,
        metadata: null,
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);

      const assistantMessage: SupportMessage = {
        id: `assistant-${Date.now()}`,
        conversationId: "",
        role: "assistant",
        content: "",
        commandOutput: null,
        commandStatus: null,
        metadata: null,
        createdAt: new Date(),
        isStreaming: true,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, mode: "support" }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let fullContent = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content) {
                  fullContent += data.content;
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastMessage = updated[updated.length - 1];
                    if (lastMessage.role === "assistant") {
                      lastMessage.content = fullContent;
                    }
                    return updated;
                  });
                }
                if (data.troubleshootingSteps) {
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastMessage = updated[updated.length - 1];
                    if (lastMessage.role === "assistant") {
                      lastMessage.troubleshootingSteps = data.troubleshootingSteps;
                    }
                    return updated;
                  });
                }
                if (data.suggestions) {
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastMessage = updated[updated.length - 1];
                    if (lastMessage.role === "assistant") {
                      lastMessage.suggestions = data.suggestions;
                    }
                    return updated;
                  });
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
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

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    setCopiedCommand(command);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  const activeServer = servers?.[0];

  const commonIssues = [
    {
      icon: AlertTriangle,
      title: "Service not starting",
      description: "Help with services that fail to start or crash",
    },
    {
      icon: Wrench,
      title: "Configuration issues",
      description: "Debug configuration file problems",
    },
    {
      icon: Lightbulb,
      title: "Performance problems",
      description: "Identify and fix slow performance",
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 p-4 border-b">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Support Agent</h1>
          <Badge variant="outline" className="gap-1">
            <HeadphonesIcon className="h-3 w-3" />
            Troubleshooting Mode
          </Badge>
        </div>
        {activeServer && (
          <Badge variant="secondary" className="gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-status-online" />
            {activeServer.name}
          </Badge>
        )}
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length === 0 ? (
            <div className="space-y-6">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted mb-4">
                  <HeadphonesIcon className="h-8 w-8 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-semibold mb-2">How can I help you?</h2>
                <p className="text-muted-foreground max-w-md">
                  I'm your intelligent support assistant. Describe your issue and I'll provide
                  step-by-step troubleshooting guidance with executable commands.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {commonIssues.map((issue) => (
                  <Card
                    key={issue.title}
                    className="cursor-pointer hover-elevate"
                    onClick={() => {
                      setInput(`I'm having trouble with: ${issue.title.toLowerCase()}`);
                    }}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 mb-2">
                        <issue.icon className="h-5 w-5 text-primary" />
                      </div>
                      <CardTitle className="text-sm">{issue.title}</CardTitle>
                      <CardDescription className="text-xs">{issue.description}</CardDescription>
                    </CardHeader>
                  </Card>
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
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  ) : (
                    <div className="space-y-4">
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        {message.content || (message.isStreaming && (
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-muted-foreground">Analyzing...</span>
                          </div>
                        ))}
                        {message.isStreaming && message.content && (
                          <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
                        )}
                      </div>

                      {message.troubleshootingSteps && message.troubleshootingSteps.length > 0 && (
                        <Card className="bg-card/50">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Wrench className="h-4 w-4" />
                              Troubleshooting Steps
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <div className="space-y-3">
                              {message.troubleshootingSteps.map((step) => (
                                <div
                                  key={step.step}
                                  className="flex gap-3 p-3 rounded-md bg-muted/50"
                                >
                                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                                    {step.step}
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-sm font-medium">{step.title}</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {step.description}
                                    </p>
                                    {step.command && (
                                      <div className="flex items-center gap-2 mt-2 p-2 bg-background rounded-md">
                                        <code className="flex-1 text-xs font-mono">
                                          {step.command}
                                        </code>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6"
                                          onClick={() => copyCommand(step.command!)}
                                        >
                                          {copiedCommand === step.command ? (
                                            <Check className="h-3 w-3" />
                                          ) : (
                                            <Copy className="h-3 w-3" />
                                          )}
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                  {step.status === "completed" && (
                                    <CheckCircle2 className="h-5 w-5 text-chart-2 shrink-0" />
                                  )}
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {message.suggestions && message.suggestions.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {message.suggestions.map((suggestion, i) => (
                            <Button
                              key={i}
                              variant="outline"
                              size="sm"
                              onClick={() => setInput(suggestion)}
                            >
                              {suggestion}
                            </Button>
                          ))}
                        </div>
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

      <div className="p-4 border-t bg-background">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="relative">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your issue... (Cmd+Enter to send)"
              className="min-h-[60px] max-h-48 resize-none pr-14"
              disabled={isStreaming}
              data-testid="input-support-message"
            />
            <Button
              type="submit"
              size="icon"
              className="absolute right-2 bottom-2"
              disabled={!input.trim() || isStreaming}
              data-testid="button-send-support"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
