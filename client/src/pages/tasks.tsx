import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ListTodo,
  Play,
  Pause,
  RotateCcw,
  X,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Send,
  SkipForward,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { VpsServer } from "@shared/schema";

interface TaskStep {
  id: string;
  name: string;
  description: string;
  command: string;
  rollbackCommand?: string;
  requiresApproval: boolean;
  timeout: number;
  status: "pending" | "running" | "completed" | "failed" | "skipped" | "rolled_back";
  output?: string;
  error?: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  steps: TaskStep[];
  currentStepIndex: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

interface TaskPlan {
  title: string;
  description: string;
  steps: any[];
  estimatedDuration: string;
  risks: string[];
  requiresApproval: boolean;
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed":
    case "rolled_back":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "running":
    case "rolling_back":
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case "paused":
      return <Pause className="h-4 w-4 text-yellow-500" />;
    case "skipped":
      return <SkipForward className="h-4 w-4 text-muted-foreground" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function getStatusBadge(status: string) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    completed: "default",
    running: "default",
    failed: "destructive",
    paused: "secondary",
    pending: "outline",
    cancelled: "secondary",
    rolling_back: "secondary",
    rolled_back: "secondary",
  };

  return (
    <Badge variant={variants[status] || "outline"}>
      {status.replace("_", " ")}
    </Badge>
  );
}

export default function TasksPage() {
  const [selectedServerId, setSelectedServerId] = useState<string>("");
  const [taskRequest, setTaskRequest] = useState("");
  const [currentPlan, setCurrentPlan] = useState<TaskPlan | null>(null);
  const [executingTaskId, setExecutingTaskId] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [approvalDialog, setApprovalDialog] = useState<{
    open: boolean;
    taskId: string;
    step: TaskStep | null;
  }>({ open: false, taskId: "", step: null });
  const { toast } = useToast();

  const { data: servers } = useQuery<VpsServer[]>({
    queryKey: ["/api/vps-servers"],
  });

  const { data: tasksData, refetch: refetchTasks } = useQuery<{ tasks: Task[] }>({
    queryKey: ["/api/agent/tasks"],
    refetchInterval: 5000,
  });

  // Auto-select first server
  useEffect(() => {
    if (servers?.length && !selectedServerId) {
      setSelectedServerId(servers[0].id);
    }
  }, [servers, selectedServerId]);

  // Plan task mutation
  const planMutation = useMutation({
    mutationFn: async (request: string) => {
      const res = await apiRequest("POST", "/api/agent/tasks/plan", {
        request,
        serverId: selectedServerId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setCurrentPlan(data.plan);
      toast({ title: "Task planned successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Planning failed", description: error.message, variant: "destructive" });
    },
  });

  // Create task mutation
  const createMutation = useMutation({
    mutationFn: async (plan: TaskPlan) => {
      const res = await apiRequest("POST", "/api/agent/tasks", {
        serverId: selectedServerId,
        plan,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setCurrentPlan(null);
      setTaskRequest("");
      refetchTasks();
      toast({ title: "Task created", description: data.task.title });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create task", description: error.message, variant: "destructive" });
    },
  });

  // Execute task with streaming
  const executeTask = async (taskId: string) => {
    setExecutingTaskId(taskId);
    
    try {
      const response = await fetch(`/api/agent/tasks/${taskId}/execute`, {
        method: "POST",
        credentials: "include",
      });

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              
              if (event.type === "needsApproval") {
                setApprovalDialog({
                  open: true,
                  taskId,
                  step: event.step,
                });
              } else if (event.type === "stepCompleted") {
                toast({ title: `Step completed: ${event.step.name}` });
              } else if (event.type === "stepFailed") {
                toast({ 
                  title: `Step failed: ${event.step.name}`, 
                  description: event.step.error,
                  variant: "destructive" 
                });
              } else if (event.type === "taskCompleted") {
                toast({ title: "Task completed successfully" });
              } else if (event.type === "taskFailed") {
                toast({ 
                  title: "Task failed", 
                  description: event.task.error,
                  variant: "destructive" 
                });
              }
              
              refetchTasks();
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error: any) {
      toast({ title: "Execution error", description: error.message, variant: "destructive" });
    } finally {
      setExecutingTaskId(null);
    }
  };

  // Approve step
  const approveMutation = useMutation({
    mutationFn: async ({ taskId, stepId }: { taskId: string; stepId: string }) => {
      const res = await apiRequest("POST", `/api/agent/tasks/${taskId}/steps/${stepId}/approve`, {});
      return res.json();
    },
    onSuccess: () => {
      setApprovalDialog({ open: false, taskId: "", step: null });
      refetchTasks();
      // Continue execution
      if (approvalDialog.taskId) {
        executeTask(approvalDialog.taskId);
      }
    },
  });

  // Cancel task
  const cancelMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await apiRequest("POST", `/api/agent/tasks/${taskId}/cancel`, {});
      return res.json();
    },
    onSuccess: () => {
      refetchTasks();
      toast({ title: "Task cancelled" });
    },
  });

  // Rollback task
  const rollbackMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await fetch(`/api/agent/tasks/${taskId}/rollback`, {
        method: "POST",
        credentials: "include",
      });
    },
    onSuccess: () => {
      refetchTasks();
      toast({ title: "Rollback initiated" });
    },
  });

  const toggleExpand = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const tasks = tasksData?.tasks || [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 p-4 border-b bg-background">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Task Orchestration</h1>
          </div>

          <Select value={selectedServerId} onValueChange={setSelectedServerId}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Select server..." />
            </SelectTrigger>
            <SelectContent>
              {servers?.map((server) => (
                <SelectItem key={server.id} value={server.id}>
                  {server.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Badge variant="outline">
          {tasks.filter((t) => t.status === "running").length} running
        </Badge>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Task Creator Panel */}
        <div className="w-96 border-r flex flex-col">
          <div className="p-4 border-b">
            <h2 className="font-medium mb-2">Create New Task</h2>
            <p className="text-sm text-muted-foreground">
              Describe what you want to accomplish and AI will create an execution plan
            </p>
          </div>

          <div className="flex-1 p-4 flex flex-col gap-4">
            <Textarea
              placeholder="e.g., Deploy a Node.js app with PM2 and set up Nginx reverse proxy"
              value={taskRequest}
              onChange={(e) => setTaskRequest(e.target.value)}
              className="min-h-[120px]"
            />

            <Button
              onClick={() => planMutation.mutate(taskRequest)}
              disabled={!taskRequest.trim() || !selectedServerId || planMutation.isPending}
            >
              {planMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Generate Plan
            </Button>

            {/* Plan Preview */}
            {currentPlan && (
              <Card className="border-primary/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{currentPlan.title}</CardTitle>
                  <CardDescription>{currentPlan.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Estimated: </span>
                    {currentPlan.estimatedDuration}
                  </div>

                  <div className="text-sm">
                    <span className="text-muted-foreground">Steps: </span>
                    {currentPlan.steps.length}
                  </div>

                  {currentPlan.risks.length > 0 && (
                    <div className="text-sm">
                      <div className="flex items-center gap-1 text-yellow-500 mb-1">
                        <AlertTriangle className="h-3 w-3" />
                        Risks:
                      </div>
                      <ul className="text-muted-foreground text-xs space-y-1">
                        {currentPlan.risks.map((risk, i) => (
                          <li key={i}>• {risk}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={() => createMutation.mutate(currentPlan)}
                      disabled={createMutation.isPending}
                    >
                      <Play className="h-4 w-4 mr-1" />
                      Create Task
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentPlan(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Tasks List */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ListTodo className="h-12 w-12 text-muted-foreground mb-4" />
                <h2 className="text-lg font-medium mb-2">No Tasks Yet</h2>
                <p className="text-muted-foreground">
                  Create a new task to get started with automated execution
                </p>
              </div>
            ) : (
              tasks.map((task) => (
                <Card key={task.id}>
                  <Collapsible
                    open={expandedTasks.has(task.id)}
                    onOpenChange={() => toggleExpand(task.id)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              {expandedTasks.has(task.id) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                          {getStatusIcon(task.status)}
                          <CardTitle className="text-base">{task.title}</CardTitle>
                          {getStatusBadge(task.status)}
                        </div>

                        <div className="flex items-center gap-2">
                          {task.status === "pending" && (
                            <Button
                              size="sm"
                              onClick={() => executeTask(task.id)}
                              disabled={executingTaskId === task.id}
                            >
                              {executingTaskId === task.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          {task.status === "failed" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => rollbackMutation.mutate(task.id)}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Rollback
                            </Button>
                          )}
                          {(task.status === "pending" || task.status === "paused") && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => cancelMutation.mutate(task.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Progress */}
                      {task.status === "running" && (
                        <div className="mt-2">
                          <Progress
                            value={(task.currentStepIndex / task.steps.length) * 100}
                            className="h-1"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Step {task.currentStepIndex + 1} of {task.steps.length}
                          </p>
                        </div>
                      )}
                    </CardHeader>

                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        <div className="space-y-2 mt-2">
                          {task.steps.map((step, index) => (
                            <div
                              key={step.id}
                              className={`flex items-start gap-3 p-2 rounded-md ${
                                step.status === "running" ? "bg-blue-500/10" :
                                step.status === "failed" ? "bg-red-500/10" :
                                step.status === "completed" ? "bg-green-500/10" :
                                "bg-muted/30"
                              }`}
                            >
                              <div className="mt-0.5">
                                {getStatusIcon(step.status)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">
                                    {index + 1}. {step.name}
                                  </span>
                                  {step.requiresApproval && (
                                    <Badge variant="outline" className="text-xs">
                                      Approval
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {step.description}
                                </p>
                                <code className="text-xs font-mono text-muted-foreground block mt-1 truncate">
                                  {step.command}
                                </code>
                                {step.output && (
                                  <pre className="text-xs bg-background p-2 rounded mt-2 overflow-x-auto max-h-32">
                                    {step.output.slice(0, 500)}
                                    {step.output.length > 500 && "..."}
                                  </pre>
                                )}
                                {step.error && (
                                  <p className="text-xs text-red-500 mt-1">{step.error}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {task.error && (
                          <div className="mt-4 p-2 bg-red-500/10 rounded-md">
                            <p className="text-sm text-red-500">{task.error}</p>
                          </div>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Approval Dialog */}
      <Dialog
        open={approvalDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setApprovalDialog({ open: false, taskId: "", step: null });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Approval Required
            </DialogTitle>
            <DialogDescription>
              This step requires your approval before execution
            </DialogDescription>
          </DialogHeader>

          {approvalDialog.step && (
            <div className="space-y-4">
              <div>
                <p className="font-medium">{approvalDialog.step.name}</p>
                <p className="text-sm text-muted-foreground">
                  {approvalDialog.step.description}
                </p>
              </div>

              <div className="bg-muted p-3 rounded-md">
                <p className="text-xs text-muted-foreground mb-1">Command:</p>
                <code className="text-sm font-mono">{approvalDialog.step.command}</code>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setApprovalDialog({ open: false, taskId: "", step: null })}
            >
              Cancel Task
            </Button>
            <Button
              onClick={() => {
                if (approvalDialog.step) {
                  approveMutation.mutate({
                    taskId: approvalDialog.taskId,
                    stepId: approvalDialog.step.id,
                  });
                }
              }}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Approve & Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
