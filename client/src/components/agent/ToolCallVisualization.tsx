/**
 * Tool Call Visualization Component
 * Displays tool execution status, input, output, and errors in a collapsible card
 */

import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Wrench,
  FileText,
  FolderOpen,
  Database,
  Shield,
  Server,
  Zap,
  Clock,
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

interface ToolCallVisualizationProps {
  tool: ToolCall;
  expanded?: boolean;
  onToggle?: (id: string) => void;
}

// Tool icon mapping
const TOOL_ICONS: Record<string, typeof Wrench> = {
  execute_command: Server,
  read_file: FileText,
  write_file: FileText,
  edit_file: FileText,
  list_directory: FolderOpen,
  get_system_metrics: Server,
  check_service_status: Zap,
  get_logs: FileText,
  docker_list: Database,
  docker_manage: Database,
  docker_compose: Database,
  nginx_manage: Server,
  ssl_certificate: Shield,
  security_audit: Shield,
  database_query: Database,
  package_manage: Server,
  network_diagnose: Server,
  backup_create: Database,
  process_manage: Zap,
  cron_manage: Clock,
  // Restic backup tools
  restic_init: Database,
  restic_backup: Database,
  restic_list: Database,
  restic_restore: Database,
  restic_verify: Shield,
  restic_prune: Database,
  restic_stats: Database,
  restic_diff: Database,
  restic_mount: FolderOpen,
};

function getToolIcon(toolName: string) {
  const Icon = TOOL_ICONS[toolName] || Wrench;
  return <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />;
}

export function ToolCallVisualization({ 
  tool, 
  expanded = false, 
  onToggle 
}: ToolCallVisualizationProps) {
  const [isExpanded, setIsExpanded] = useState(expanded);

  const handleToggle = () => {
    if (onToggle) {
      onToggle(tool.id);
    } else {
      setIsExpanded(!isExpanded);
    }
  };

  const getStatusIcon = () => {
    switch (tool.status) {
      case "running":
        return <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin text-blue-500" />;
      case "completed":
        return <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-500" />;
      case "pending_approval":
        return <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-yellow-500" />;
      default:
        return <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-500" />;
    }
  };

  return (
    <Card className="overflow-hidden">
      <Collapsible open={isExpanded} onOpenChange={handleToggle}>
        <CollapsibleTrigger asChild>
          <CardHeader className="p-2 sm:p-3 cursor-pointer hover:bg-muted/50">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                {getStatusIcon()}
                {getToolIcon(tool.name)}
                <span className="font-mono text-xs sm:text-sm truncate">{tool.name}</span>
                <Badge variant="outline" className="text-xs ml-1">
                  {tool.status}
                </Badge>
              </div>
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-2 sm:p-3 pt-0 space-y-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Input:</p>
              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-w-full">
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            </div>
            {tool.output && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Output:</p>
                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-32 sm:max-h-40 max-w-full">
                  {tool.output.slice(0, 1500)}
                  {tool.output.length > 1500 && "..."}
                </pre>
              </div>
            )}
            {tool.error && (
              <div>
                <p className="text-xs text-red-500 mb-1">Error:</p>
                <pre className="text-xs bg-red-500/10 p-2 rounded text-red-500 overflow-x-auto max-w-full">
                  {tool.error}
                </pre>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
