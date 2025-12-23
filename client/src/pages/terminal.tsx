import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Terminal as XTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import {
  Terminal,
  Loader2,
  Wifi,
  WifiOff,
  Maximize2,
  Minimize2,
  Lightbulb,
  Send,
  X,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Command,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import type { VpsServer } from "@shared/schema";

interface TerminalMessage {
  type: string;
  data?: string;
  message?: string;
  suggestions?: string[];
  source?: string;
  response?: string;
  sessionId?: string;
}

export default function TerminalPage() {
  const [selectedServerId, setSelectedServerId] = useState<string>("");
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionSource, setSuggestionSource] = useState<string>("");
  const [aiQuestion, setAiQuestion] = useState("");
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [commandBuffer, setCommandBuffer] = useState("");

  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string>("");
  const { toast } = useToast();

  const { data: servers, isLoading: serversLoading } = useQuery<VpsServer[]>({
    queryKey: ["/api/vps-servers"],
  });

  // Initialize xterm
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const term = new XTerminal({
      cursorBlink: true,
      cursorStyle: "bar",
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      theme: {
        background: "#0a0a0a",
        foreground: "#fafafa",
        cursor: "#fafafa",
        cursorAccent: "#0a0a0a",
        selectionBackground: "#3b82f6",
        black: "#171717",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#fafafa",
        brightBlack: "#404040",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#facc15",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#ffffff",
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Handle terminal input
    term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "input", data }));

        // Track command buffer for suggestions
        if (data === "\r") {
          setCommandBuffer("");
          setShowSuggestions(false);
        } else if (data === "\x7f" || data === "\b") {
          setCommandBuffer((prev) => prev.slice(0, -1));
        } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
          setCommandBuffer((prev) => prev + data);
        }
      }
    });

    // Handle resize
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
        if (wsRef.current?.readyState === WebSocket.OPEN && xtermRef.current) {
          wsRef.current.send(
            JSON.stringify({
              type: "resize",
              cols: xtermRef.current.cols,
              rows: xtermRef.current.rows,
            })
          );
        }
      }
    };

    window.addEventListener("resize", handleResize);

    term.writeln("\x1b[1;36m╔════════════════════════════════════════════════════╗\x1b[0m");
    term.writeln("\x1b[1;36m║\x1b[0m  \x1b[1;37mVPS Agent Terminal\x1b[0m                                 \x1b[1;36m║\x1b[0m");
    term.writeln("\x1b[1;36m║\x1b[0m  \x1b[90mReal-time SSH with AI Co-pilot\x1b[0m                     \x1b[1;36m║\x1b[0m");
    term.writeln("\x1b[1;36m╚════════════════════════════════════════════════════╝\x1b[0m");
    term.writeln("");
    term.writeln("\x1b[33m→ Select a server above to connect\x1b[0m");
    term.writeln("");

    return () => {
      window.removeEventListener("resize", handleResize);
      term.dispose();
      xtermRef.current = null;
    };
  }, []);

  // Request suggestions when command buffer changes
  useEffect(() => {
    if (commandBuffer.length >= 2 && wsRef.current?.readyState === WebSocket.OPEN) {
      const timer = setTimeout(() => {
        wsRef.current?.send(
          JSON.stringify({ type: "suggest", partial: commandBuffer })
        );
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setShowSuggestions(false);
    }
  }, [commandBuffer]);

  // Connect to WebSocket terminal
  const connectToServer = useCallback(async () => {
    if (!selectedServerId) {
      toast({ title: "Please select a server", variant: "destructive" });
      return;
    }

    setIsConnecting(true);

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/terminal`);

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "connect",
            serverId: selectedServerId,
            userId: "current-user", // Will be set by server from session
            cols: xtermRef.current?.cols || 80,
            rows: xtermRef.current?.rows || 24,
          })
        );
      };

      ws.onmessage = (event) => {
        const message: TerminalMessage = JSON.parse(event.data);

        switch (message.type) {
          case "connected":
            setIsConnected(true);
            setIsConnecting(false);
            sessionIdRef.current = message.sessionId || "";
            if (xtermRef.current) {
              xtermRef.current.clear();
              xtermRef.current.writeln(`\x1b[32m✓ ${message.message}\x1b[0m`);
              xtermRef.current.writeln("");
            }
            toast({ title: "Connected to server" });
            break;

          case "output":
            if (xtermRef.current && message.data) {
              xtermRef.current.write(message.data);
            }
            break;

          case "suggestions":
            if (message.suggestions && message.suggestions.length > 0) {
              setSuggestions(message.suggestions);
              setSuggestionSource(message.source || "local");
              setShowSuggestions(true);
            }
            break;

          case "ai-response":
            setAiResponse(message.response || "");
            setIsAiLoading(false);
            break;

          case "error":
            if (xtermRef.current) {
              xtermRef.current.writeln(`\x1b[31m✗ ${message.message}\x1b[0m`);
            }
            toast({ title: message.message, variant: "destructive" });
            setIsConnecting(false);
            break;

          case "disconnected":
            setIsConnected(false);
            if (xtermRef.current) {
              xtermRef.current.writeln("");
              xtermRef.current.writeln(`\x1b[33m${message.message}\x1b[0m`);
            }
            break;
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
        wsRef.current = null;
      };

      ws.onerror = () => {
        toast({ title: "WebSocket connection failed", variant: "destructive" });
        setIsConnecting(false);
      };

      wsRef.current = ws;
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
      setIsConnecting(false);
    }
  }, [selectedServerId, toast]);

  // Disconnect from server
  const disconnectFromServer = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: "disconnect" }));
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    if (xtermRef.current) {
      xtermRef.current.writeln("");
      xtermRef.current.writeln("\x1b[33m→ Disconnected. Select a server to reconnect.\x1b[0m");
    }
  }, []);

  // Apply suggestion
  const applySuggestion = (suggestion: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Clear current input and type the suggestion
      const backspaces = "\x7f".repeat(commandBuffer.length);
      wsRef.current.send(JSON.stringify({ type: "input", data: backspaces }));
      wsRef.current.send(JSON.stringify({ type: "input", data: suggestion }));
      setCommandBuffer(suggestion);
    }
    setShowSuggestions(false);
  };

  // Ask AI for help
  const askAiHelp = () => {
    if (!aiQuestion.trim() || !wsRef.current) return;

    setIsAiLoading(true);
    setAiResponse("");
    wsRef.current.send(
      JSON.stringify({ type: "ai-help", question: aiQuestion })
    );
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
    setTimeout(() => fitAddonRef.current?.fit(), 100);
  };

  const selectedServer = servers?.find((s) => s.id === selectedServerId);

  return (
    <div className={`flex flex-col h-full ${isFullscreen ? "fixed inset-0 z-50 bg-background" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 p-4 border-b bg-background">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Terminal</h1>
          </div>

          <Select
            value={selectedServerId}
            onValueChange={setSelectedServerId}
            disabled={isConnected}
          >
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Select server..." />
            </SelectTrigger>
            <SelectContent>
              {serversLoading ? (
                <SelectItem value="loading" disabled>
                  Loading...
                </SelectItem>
              ) : servers?.length === 0 ? (
                <SelectItem value="none" disabled>
                  No servers configured
                </SelectItem>
              ) : (
                servers?.map((server) => (
                  <SelectItem key={server.id} value={server.id}>
                    <div className="flex items-center gap-2">
                      <span>{server.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {server.host}
                      </span>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          {!isConnected ? (
            <Button
              onClick={connectToServer}
              disabled={!selectedServerId || isConnecting}
            >
              {isConnecting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Wifi className="h-4 w-4 mr-2" />
              )}
              Connect
            </Button>
          ) : (
            <Button variant="destructive" onClick={disconnectFromServer}>
              <WifiOff className="h-4 w-4 mr-2" />
              Disconnect
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isConnected && (
            <Badge variant="outline" className="text-green-500 border-green-500">
              <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" />
              Connected to {selectedServer?.name}
            </Badge>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowAiPanel((prev) => !prev)}
              >
                <Sparkles className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>AI Assistant</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Terminal */}
        <div className="flex-1 flex flex-col">
          <div
            ref={terminalRef}
            className="flex-1 bg-[#0a0a0a] p-2"
            style={{ minHeight: 0 }}
          />

          {/* Command suggestions */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="border-t bg-background p-2">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4 text-yellow-500" />
                <span className="text-xs text-muted-foreground">
                  Suggestions ({suggestionSource === "ai" ? "AI" : "Local"})
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 ml-auto"
                  onClick={() => setShowSuggestions(false)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    className="font-mono text-xs"
                    onClick={() => applySuggestion(suggestion)}
                  >
                    <Command className="h-3 w-3 mr-1" />
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* AI Panel */}
        {showAiPanel && (
          <div className="w-80 border-l flex flex-col bg-background">
            <div className="flex items-center justify-between p-3 border-b">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">AI Assistant</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setShowAiPanel(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1 p-3">
              {aiResponse ? (
                <Card className="p-3">
                  <p className="text-sm whitespace-pre-wrap">{aiResponse}</p>
                </Card>
              ) : (
                <div className="text-center text-muted-foreground text-sm py-8">
                  <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Ask for help with commands, troubleshooting, or explanations</p>
                </div>
              )}
            </ScrollArea>

            <div className="p-3 border-t">
              <div className="flex gap-2">
                <Input
                  placeholder="Ask anything..."
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      askAiHelp();
                    }
                  }}
                  disabled={!isConnected || isAiLoading}
                />
                <Button
                  size="icon"
                  onClick={askAiHelp}
                  disabled={!isConnected || isAiLoading || !aiQuestion.trim()}
                >
                  {isAiLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {isConnected
                  ? "Ask about commands, troubleshooting, or get explanations"
                  : "Connect to a server first"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
