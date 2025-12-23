import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Server,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Sparkles,
  Container,
  Gauge,
  TrendingUp,
  Clock,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

interface CpuMetrics {
  cores: number;
  loadAverage: [number, number, number];
  usagePercent: number;
  idle: number;
}

interface MemoryMetrics {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  availableBytes: number;
  usagePercent: number;
  swapTotal: number;
  swapUsed: number;
  swapPercent: number;
}

interface DiskMetrics {
  mountPoint: string;
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usagePercent: number;
  filesystem: string;
}

interface ProcessInfo {
  pid: number;
  user: string;
  cpu: number;
  memory: number;
  command: string;
}

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  cpuPercent: number;
  memoryUsage: string;
  memoryPercent: number;
}

interface Alert {
  id: string;
  severity: "info" | "warning" | "critical";
  type: string;
  message: string;
  timestamp: string;
}

interface ServerMetrics {
  serverId: string;
  serverName: string;
  timestamp: string;
  online: boolean;
  uptime: string;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disks: DiskMetrics[];
  topProcesses: ProcessInfo[];
  dockerContainers: DockerContainer[];
  alerts: Alert[];
}

interface MonitoringSummary {
  totalServers: number;
  onlineServers: number;
  criticalAlerts: number;
  warningAlerts: number;
}

interface AIAnalysis {
  analysis: string;
  recommendations: string[];
  severity: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function getStatusColor(percent: number): string {
  if (percent >= 90) return "text-red-500";
  if (percent >= 70) return "text-yellow-500";
  return "text-green-500";
}

function getProgressColor(percent: number): string {
  if (percent >= 90) return "bg-red-500";
  if (percent >= 70) return "bg-yellow-500";
  return "bg-green-500";
}

export default function MonitoringPage() {
  const [selectedServerId, setSelectedServerId] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { toast } = useToast();

  const { data: servers, isLoading: serversLoading } = useQuery<VpsServer[]>({
    queryKey: ["/api/vps-servers"],
  });

  // Auto-select first server
  useEffect(() => {
    if (servers?.length && !selectedServerId) {
      setSelectedServerId(servers[0].id);
    }
  }, [servers, selectedServerId]);

  // Fetch all servers summary
  const { data: monitoringData, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<{
    summary: MonitoringSummary;
    servers: ServerMetrics[];
  }>({
    queryKey: ["/api/agent/monitor"],
    refetchInterval: autoRefresh ? 30000 : false,
  });

  // Fetch selected server details
  const { data: serverMetrics, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery<ServerMetrics>({
    queryKey: ["/api/agent/monitor", selectedServerId],
    enabled: !!selectedServerId,
    refetchInterval: autoRefresh ? 15000 : false,
  });

  // Fetch AI analysis
  const { data: aiAnalysisData, isLoading: analysisLoading, refetch: refetchAnalysis } = useQuery<{
    metrics: ServerMetrics;
    analysis: AIAnalysis;
  }>({
    queryKey: ["/api/agent/monitor", selectedServerId, "analyze"],
    enabled: false, // Manual trigger only
  });

  const handleRefresh = () => {
    refetchSummary();
    refetchMetrics();
    toast({ title: "Refreshing metrics..." });
  };

  const handleAIAnalysis = () => {
    refetchAnalysis();
    toast({ title: "Running AI analysis..." });
  };

  const summary = monitoringData?.summary;
  const allServers = monitoringData?.servers || [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 p-4 border-b bg-background">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Server Monitoring</h1>
          </div>

          <Select value={selectedServerId} onValueChange={setSelectedServerId}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Select server..." />
            </SelectTrigger>
            <SelectContent>
              {servers?.map((server) => (
                <SelectItem key={server.id} value={server.id}>
                  <div className="flex items-center gap-2">
                    <span>{server.name}</span>
                    <span className="text-xs text-muted-foreground">{server.host}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {autoRefresh ? "Auto" : "Manual"}
          </Button>

          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>

          <Button size="sm" onClick={handleAIAnalysis} disabled={!selectedServerId}>
            <Sparkles className="h-4 w-4 mr-2" />
            AI Analysis
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Summary Cards */}
          {summary && (
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Servers</p>
                      <p className="text-2xl font-bold">{summary.totalServers}</p>
                    </div>
                    <Server className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Online</p>
                      <p className="text-2xl font-bold text-green-500">{summary.onlineServers}</p>
                    </div>
                    <Wifi className="h-8 w-8 text-green-500" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Critical Alerts</p>
                      <p className="text-2xl font-bold text-red-500">{summary.criticalAlerts}</p>
                    </div>
                    <AlertCircle className="h-8 w-8 text-red-500" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Warnings</p>
                      <p className="text-2xl font-bold text-yellow-500">{summary.warningAlerts}</p>
                    </div>
                    <AlertTriangle className="h-8 w-8 text-yellow-500" />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Server Details */}
          {metricsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : serverMetrics ? (
            <div className="space-y-6">
              {/* Server Status Header */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-3 w-3 rounded-full ${serverMetrics.online ? "bg-green-500" : "bg-red-500"}`} />
                      <CardTitle>{serverMetrics.serverName}</CardTitle>
                      <Badge variant={serverMetrics.online ? "default" : "destructive"}>
                        {serverMetrics.online ? "Online" : "Offline"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {serverMetrics.uptime}
                      </div>
                      <div>
                        Updated: {new Date(serverMetrics.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {/* AI Analysis */}
              {aiAnalysisData?.analysis && (
                <Card className="border-primary/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sparkles className="h-4 w-4 text-primary" />
                      AI Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm mb-3">{aiAnalysisData.analysis.analysis}</p>
                    {aiAnalysisData.analysis.recommendations.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2">Recommendations:</p>
                        <ul className="text-sm space-y-1">
                          {aiAnalysisData.analysis.recommendations.map((rec, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Alerts */}
              {serverMetrics.alerts.length > 0 && (
                <Card className="border-red-500/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base text-red-500">
                      <AlertTriangle className="h-4 w-4" />
                      Active Alerts ({serverMetrics.alerts.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {serverMetrics.alerts.map((alert) => (
                        <div
                          key={alert.id}
                          className={`flex items-center gap-3 p-2 rounded-md ${
                            alert.severity === "critical" ? "bg-red-500/10" : "bg-yellow-500/10"
                          }`}
                        >
                          {alert.severity === "critical" ? (
                            <AlertCircle className="h-4 w-4 text-red-500" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          )}
                          <span className="text-sm flex-1">{alert.message}</span>
                          <Badge variant={alert.severity === "critical" ? "destructive" : "outline"}>
                            {alert.severity}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Resource Metrics Grid */}
              <div className="grid grid-cols-2 gap-4">
                {/* CPU */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Cpu className="h-4 w-4" />
                      CPU
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Cores</span>
                        <span className="font-medium">{serverMetrics.cpu.cores}</span>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-muted-foreground">Load Average</span>
                          <span className={`font-medium ${getStatusColor(serverMetrics.cpu.usagePercent)}`}>
                            {serverMetrics.cpu.loadAverage.map(l => l.toFixed(2)).join(" / ")}
                          </span>
                        </div>
                        <Progress 
                          value={serverMetrics.cpu.usagePercent} 
                          className="h-2"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {serverMetrics.cpu.usagePercent.toFixed(1)}% utilized
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Memory */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MemoryStick className="h-4 w-4" />
                      Memory
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-muted-foreground">RAM</span>
                          <span className={`font-medium ${getStatusColor(serverMetrics.memory.usagePercent)}`}>
                            {formatBytes(serverMetrics.memory.usedBytes)} / {formatBytes(serverMetrics.memory.totalBytes)}
                          </span>
                        </div>
                        <Progress value={serverMetrics.memory.usagePercent} className="h-2" />
                        <p className="text-xs text-muted-foreground mt-1">
                          {serverMetrics.memory.usagePercent.toFixed(1)}% used
                        </p>
                      </div>
                      {serverMetrics.memory.swapTotal > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-muted-foreground">Swap</span>
                            <span className="font-medium">
                              {formatBytes(serverMetrics.memory.swapUsed)} / {formatBytes(serverMetrics.memory.swapTotal)}
                            </span>
                          </div>
                          <Progress value={serverMetrics.memory.swapPercent} className="h-2" />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Disks */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <HardDrive className="h-4 w-4" />
                    Disk Usage
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    {serverMetrics.disks.map((disk) => (
                      <div key={disk.mountPoint} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{disk.mountPoint}</span>
                          <span className={`text-sm ${getStatusColor(disk.usagePercent)}`}>
                            {disk.usagePercent}%
                          </span>
                        </div>
                        <Progress value={disk.usagePercent} className="h-2" />
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(disk.usedBytes)} / {formatBytes(disk.totalBytes)}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Tabs for Processes and Docker */}
              <Tabs defaultValue="processes">
                <TabsList>
                  <TabsTrigger value="processes">Top Processes</TabsTrigger>
                  <TabsTrigger value="docker">
                    Docker ({serverMetrics.dockerContainers.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="processes">
                  <Card>
                    <CardContent className="p-4">
                      <div className="space-y-2">
                        <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground pb-2 border-b">
                          <span className="col-span-1">PID</span>
                          <span className="col-span-2">User</span>
                          <span className="col-span-1">CPU%</span>
                          <span className="col-span-1">MEM%</span>
                          <span className="col-span-7">Command</span>
                        </div>
                        {serverMetrics.topProcesses.map((proc) => (
                          <div key={proc.pid} className="grid grid-cols-12 gap-2 text-sm py-1">
                            <span className="col-span-1 font-mono text-muted-foreground">{proc.pid}</span>
                            <span className="col-span-2 truncate">{proc.user}</span>
                            <span className={`col-span-1 ${proc.cpu > 50 ? "text-red-500" : ""}`}>
                              {proc.cpu.toFixed(1)}
                            </span>
                            <span className={`col-span-1 ${proc.memory > 50 ? "text-red-500" : ""}`}>
                              {proc.memory.toFixed(1)}
                            </span>
                            <span className="col-span-7 truncate font-mono text-xs">{proc.command}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="docker">
                  <Card>
                    <CardContent className="p-4">
                      {serverMetrics.dockerContainers.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No Docker containers running
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground pb-2 border-b">
                            <span className="col-span-3">Name</span>
                            <span className="col-span-3">Image</span>
                            <span className="col-span-2">Status</span>
                            <span className="col-span-2">CPU%</span>
                            <span className="col-span-2">Memory</span>
                          </div>
                          {serverMetrics.dockerContainers.map((container) => (
                            <div key={container.id} className="grid grid-cols-12 gap-2 text-sm py-1">
                              <span className="col-span-3 truncate font-medium">{container.name}</span>
                              <span className="col-span-3 truncate text-muted-foreground">{container.image}</span>
                              <span className="col-span-2">
                                <Badge variant={container.status.includes("Up") ? "default" : "secondary"} className="text-xs">
                                  {container.status.split(" ")[0]}
                                </Badge>
                              </span>
                              <span className="col-span-2">{container.cpuPercent.toFixed(1)}%</span>
                              <span className="col-span-2">{container.memoryUsage}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Activity className="h-12 w-12 text-muted-foreground mb-4" />
              <h2 className="text-lg font-medium mb-2">Select a Server</h2>
              <p className="text-muted-foreground">
                Choose a server from the dropdown to view real-time metrics
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
