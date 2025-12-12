import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Circle,
  Loader2,
  Clock,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { TestRun, TestStep, VpsServer } from "@shared/schema";

interface TestRunWithSteps extends TestRun {
  testSteps: TestStep[];
}

export default function TestingPage() {
  const [testDescription, setTestDescription] = useState("");
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const { data: servers } = useQuery<VpsServer[]>({
    queryKey: ["/api/vps-servers"],
  });

  const { data: testRuns, isLoading } = useQuery<TestRunWithSteps[]>({
    queryKey: ["/api/test-runs"],
  });

  const createTestRunMutation = useMutation({
    mutationFn: async (description: string) => {
      return apiRequest("POST", "/api/test-runs", { description });
    },
    onSuccess: () => {
      toast({
        title: "Test started",
        description: "Your test run has been initiated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/test-runs"] });
      setTestDescription("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleStep = (stepId: string) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId);
    } else {
      newExpanded.add(stepId);
    }
    setExpandedSteps(newExpanded);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-chart-2" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "running":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case "skipped":
        return <AlertTriangle className="h-4 w-4 text-chart-4" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge className="bg-chart-2/10 text-chart-2 border-chart-2/20">Passed</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "running":
        return <Badge className="bg-primary/10 text-primary border-primary/20">Running</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  const activeServer = servers?.[0];
  const activeTestRun = testRuns?.find((run) => run.status === "running");

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col border-r">
        <div className="p-4 border-b">
          <h1 className="text-lg font-semibold">Testing Agent</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Run automated tests on your VPS configuration
          </p>
        </div>

        <div className="p-4 border-b">
          <Textarea
            value={testDescription}
            onChange={(e) => setTestDescription(e.target.value)}
            placeholder="Describe what you want to test... e.g., 'Check if Docker is installed and running, verify nginx is serving on port 80, check disk space'"
            className="min-h-[100px] resize-none"
            data-testid="input-test-description"
          />
          <div className="flex justify-between items-center mt-3">
            <div className="flex items-center gap-2">
              {activeServer ? (
                <Badge variant="secondary" className="gap-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-status-online" />
                  {activeServer.name}
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  No server selected
                </Badge>
              )}
            </div>
            <Button
              onClick={() => createTestRunMutation.mutate(testDescription)}
              disabled={!testDescription.trim() || !activeServer || createTestRunMutation.isPending}
              data-testid="button-start-test"
            >
              {createTestRunMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Run Tests
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {isLoading ? (
              <>
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-4 w-32 mt-2" />
                    </CardHeader>
                  </Card>
                ))}
              </>
            ) : testRuns?.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted mb-4">
                    <Play className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No test runs yet</h3>
                  <p className="text-muted-foreground text-center max-w-sm">
                    Describe what you want to test and the AI will create and execute test cases
                    automatically.
                  </p>
                </CardContent>
              </Card>
            ) : (
              testRuns?.map((run) => (
                <Card key={run.id} data-testid={`card-test-run-${run.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          {run.name}
                          {getStatusBadge(run.status || "pending")}
                        </CardTitle>
                        <CardDescription className="mt-1 flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          {run.createdAt
                            ? new Date(run.createdAt).toLocaleString()
                            : "Unknown date"}
                        </CardDescription>
                      </div>
                      {run.status === "running" && (
                        <Button variant="outline" size="sm">
                          <Pause className="h-4 w-4 mr-1" />
                          Stop
                        </Button>
                      )}
                    </div>
                    {run.status === "running" && (
                      <div className="mt-3">
                        <Progress
                          value={
                            run.totalSteps
                              ? ((run.completedSteps || 0) / run.totalSteps) * 100
                              : 0
                          }
                          className="h-2"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {run.completedSteps || 0} of {run.totalSteps || 0} steps completed
                        </p>
                      </div>
                    )}
                  </CardHeader>
                  {run.testSteps && run.testSteps.length > 0 && (
                    <CardContent className="pt-0">
                      <div className="space-y-1">
                        {run.testSteps.map((step) => (
                          <Collapsible
                            key={step.id}
                            open={expandedSteps.has(step.id)}
                            onOpenChange={() => toggleStep(step.id)}
                          >
                            <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-md hover-elevate text-left">
                              {expandedSteps.has(step.id) ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                              {getStatusIcon(step.status || "pending")}
                              <span className="flex-1 text-sm">{step.name}</span>
                              {step.duration && (
                                <span className="text-xs text-muted-foreground">
                                  {step.duration}ms
                                </span>
                              )}
                            </CollapsibleTrigger>
                            <CollapsibleContent className="pl-10 pr-2 pb-2">
                              {step.description && (
                                <p className="text-sm text-muted-foreground mb-2">
                                  {step.description}
                                </p>
                              )}
                              {step.command && (
                                <div className="bg-muted rounded-md p-2 mb-2">
                                  <code className="text-xs font-mono">{step.command}</code>
                                </div>
                              )}
                              {step.actualOutput && (
                                <div className="bg-background border rounded-md p-2">
                                  <pre className="text-xs font-mono whitespace-pre-wrap">
                                    {step.actualOutput}
                                  </pre>
                                </div>
                              )}
                              {step.errorMessage && (
                                <div className="bg-destructive/10 text-destructive rounded-md p-2 mt-2">
                                  <p className="text-xs">{step.errorMessage}</p>
                                </div>
                              )}
                            </CollapsibleContent>
                          </Collapsible>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="w-96 flex flex-col bg-muted/30">
        <div className="p-4 border-b">
          <h2 className="text-sm font-semibold">Live Progress</h2>
          <p className="text-xs text-muted-foreground mt-1">Real-time test execution view</p>
        </div>

        <ScrollArea className="flex-1 p-4">
          {activeTestRun ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-lg border border-primary/20">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div>
                  <p className="text-sm font-medium">Running: {activeTestRun.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Step {activeTestRun.completedSteps || 0} of {activeTestRun.totalSteps || 0}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {activeTestRun.testSteps?.map((step, index) => (
                  <div
                    key={step.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      step.status === "running"
                        ? "bg-primary/5 border-primary/20"
                        : step.status === "success"
                        ? "bg-chart-2/5 border-chart-2/20"
                        : step.status === "failed"
                        ? "bg-destructive/5 border-destructive/20"
                        : "bg-card border-border"
                    }`}
                  >
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-background text-xs font-medium">
                      {index + 1}
                    </div>
                    {getStatusIcon(step.status || "pending")}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{step.name}</p>
                      {step.status === "running" && (
                        <p className="text-xs text-muted-foreground">Executing...</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted mb-3">
                <Play className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                No active test running
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Start a test to see live progress
              </p>
            </div>
          )}
        </ScrollArea>

        {activeTestRun && (
          <div className="p-4 border-t">
            <div className="grid grid-cols-3 gap-3">
              <Card className="p-3 text-center">
                <p className="text-2xl font-semibold text-chart-2">
                  {activeTestRun.testSteps?.filter((s) => s.status === "success").length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Passed</p>
              </Card>
              <Card className="p-3 text-center">
                <p className="text-2xl font-semibold text-destructive">
                  {activeTestRun.testSteps?.filter((s) => s.status === "failed").length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </Card>
              <Card className="p-3 text-center">
                <p className="text-2xl font-semibold">
                  {activeTestRun.testSteps?.filter((s) => s.status === "pending").length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
