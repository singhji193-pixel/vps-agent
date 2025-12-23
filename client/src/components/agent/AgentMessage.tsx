/**
 * Agent Message Component
 * Displays a message with role, content, tool calls, and thinking process
 */

import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ToolCallVisualization } from "./ToolCallVisualization";
import { 
  Bot, 
  User, 
  ChevronRight, 
  Loader2, 
  Sparkles, 
  Eye, 
  EyeOff 
} from "lucide-react";

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

interface AgentMessageProps {
  message: AgentMessage;
  showThinking: boolean;
  expandedTools: Set<string>;
  onToggleToolExpanded: (id: string) => void;
}

export function AgentMessageComponent({ 
  message, 
  showThinking, 
  expandedTools, 
  onToggleToolExpanded 
}: AgentMessageProps) {
  const [showThinkingLocal, setShowThinkingLocal] = useState(showThinking);

  return (
    <div className="space-y-2 sm:space-y-3">
      {/* Message Header */}
      <div className="flex items-start gap-2 sm:gap-3">
        <div className={`h-7 w-7 sm:h-8 sm:w-8 rounded-full flex items-center justify-center shrink-0 ${
          message.role === "user" 
            ? "bg-primary" 
            : "bg-gradient-to-br from-violet-500 to-purple-600"
        }`}>
          {message.role === "user" ? (
            <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary-foreground" />
          ) : (
            <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
          )}
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-medium text-sm sm:text-base">
              {message.role === "user" ? "You" : "Agent"}
            </span>
            <span className="text-xs text-muted-foreground">
              {message.timestamp.toLocaleTimeString()}
            </span>
            {message.isStreaming && (
              <Loader2 className="h-3 w-3 animate-spin text-violet-500" />
            )}
          </div>

          {/* Thinking (collapsible) */}
          {showThinkingLocal && message.thinking && (
            <Collapsible className="mb-3">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  View thinking process
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {message.thinking}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Tool Calls */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="space-y-2 mb-3">
              {message.toolCalls.map((tool) => (
                <ToolCallVisualization
                  key={tool.id}
                  tool={tool}
                  expanded={expandedTools.has(tool.id)}
                  onToggle={onToggleToolExpanded}
                />
              ))}
            </div>
          )}

          {/* Message Content */}
          {message.content && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
