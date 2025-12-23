import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  HardDrive,
  Plus,
  RefreshCw,
  Download,
  RotateCcw,
  Shield,
  Clock,
  Trash2,
  Settings,
  Calendar,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Cloud,
  Server,
  FolderArchive,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { VpsServer } from "@shared/schema";

interface BackupConfig {
  id: string;
  name: string;
  vpsServerId: string;
  repositoryType: string;
  repositoryPath: string;
  isInitialized: boolean;
  includePaths: string[];
  excludePatterns: string[];
  retentionDaily: number;
  retentionWeekly: number;
  retentionMonthly: number;
  retentionYearly: number;
  createdAt: string;
}

interface BackupSnapshot {
  id: string;
  snapshotId: string;
  status: string;
  snapshotType: string;
  sizeBytes: number | null;
  filesNew: number | null;
  filesChanged: number | null;
  duration: number | null;
  hostname: string | null;
  paths: string[] | null;
  createdAt: string;
}

interface BackupOverview {
  id: string;
  name: string;
  vpsServerId: string;
  repositoryType: string;
  isInitialized: boolean;
  snapshotCount: number;
  latestSnapshot: {
    id: string;
    time: string;
    status: string;
    sizeBytes: number | null;
  } | null;
  schedule: {
    cronExpression: string;
    lastRun: string | null;
    nextRun: string | null;
  } | null;
  recentOperations: any[];
}

export default function BackupsPage() {
  const [expandedConfigs, setExpandedConfigs] = useState<Set<string>>(new Set());
  const [selectedConfig, setSelectedConfig] = useState<BackupConfig | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const { toast } = useToast();

  const { data: servers } = useQuery<VpsServer[]>({
    queryKey: ["/api/vps-servers"],
  });

  const { data: overview, isLoading, refetch } = useQuery<BackupOverview[]>({
    queryKey: ["/api/backups/overview"],
  });

  const createConfigMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/backup-configs", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Backup configuration created" });
      queryClient.invalidateQueries({ queryKey: ["/api/backups/overview"] });
      setIsCreateOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const triggerBackupMutation = useMutation({
    mutationFn: async (configId: string) => {
      return apiRequest("POST", `/api/backup-configs/${configId}/backup`, {});
    },
    onSuccess: () => {
      toast({ title: "Backup Started", description: "Use the Agent to monitor progress" });
      queryClient.invalidateQueries({ queryKey: ["/api/backups/overview"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const triggerRestoreMutation = useMutation({
    mutationFn: async ({ configId, snapshotId }: { configId: string; snapshotId: string }) => {
      return apiRequest("POST", `/api/backup-configs/${configId}/restore`, { snapshotId });
    },
    onSuccess: () => {
      toast({ title: "Restore Queued", description: "Use the Agent to approve and execute" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (configId: string) => {
      return apiRequest("POST", `/api/backup-configs/${configId}/verify`, { readData: false });
    },
    onSuccess: () => {
      toast({ title: "Verification Started", description: "This may take a while" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteConfigMutation = useMutation({
    mutationFn: async (configId: string) => {
      return apiRequest("DELETE", `/api/backup-configs/${configId}`);
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Backup configuration removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/backups/overview"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleConfig = (id: string) => {
    const newExpanded = new Set(expandedConfigs);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedConfigs(newExpanded);
  };

  const formatBytes = (bytes: number | null) => {
    if (!bytes) return "N/A";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }
    return `${size.toFixed(1)} ${units[i]}`;
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "N/A";
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const getRepoTypeIcon = (type: string) => {
    switch (type) {
      case "s3":
      case "b2":
        return <Cloud className="h-4 w-4" />;
      case "sftp":
        return <Server className="h-4 w-4" />;
      default:
        return <HardDrive className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-chart-2/10 text-chart-2 border-chart-2/20">Completed</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "running":
        return <Badge className="bg-primary/10 text-primary border-primary/20">Running</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <FolderArchive className="h-5 w-5" />
              Backup Manager
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage VPS backups with restic - encrypted, deduplicated, and incremental
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  New Backup Config
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create Backup Configuration</DialogTitle>
                  <DialogDescription>
                    Configure a new restic backup repository
                  </DialogDescription>
                </DialogHeader>
                <CreateBackupForm
                  servers={servers || []}
                  onSubmit={(data) => createConfigMutation.mutate(data)}
                  isLoading={createConfigMutation.isPending}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !overview || overview.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted mb-4">
                  <FolderArchive className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Backup Configurations</h3>
                <p className="text-muted-foreground text-center max-w-sm mb-4">
                  Create a backup configuration to start protecting your VPS data with
                  encrypted, incremental backups.
                </p>
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Backup
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {overview.map((config) => (
                <Card key={config.id}>
                  <Collapsible
                    open={expandedConfigs.has(config.id)}
                    onOpenChange={() => toggleConfig(config.id)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-4">
                        <CollapsibleTrigger className="flex items-center gap-3 text-left hover:opacity-80">
                          {expandedConfigs.has(config.id) ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                            {getRepoTypeIcon(config.repositoryType)}
                          </div>
                          <div>
                            <CardTitle className="text-base flex items-center gap-2">
                              {config.name}
                              {config.isInitialized ? (
                                <CheckCircle2 className="h-4 w-4 text-chart-2" />
                              ) : (
                                <AlertTriangle className="h-4 w-4 text-chart-4" />
                              )}
                            </CardTitle>
                            <CardDescription className="flex items-center gap-2">
                              {config.repositoryType.toUpperCase()} •{" "}
                              {config.snapshotCount} snapshots
                            </CardDescription>
                          </div>
                        </CollapsibleTrigger>
                        <div className="flex items-center gap-2">
                          {config.schedule && (
                            <Badge variant="secondary" className="gap-1">
                              <Calendar className="h-3 w-3" />
                              {config.schedule.cronExpression}
                            </Badge>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => triggerBackupMutation.mutate(config.id)}
                            disabled={triggerBackupMutation.isPending}
                          >
                            {triggerBackupMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {config.latestSnapshot && (
                        <div className="mt-3 flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span>
                              Last backup:{" "}
                              {new Date(config.latestSnapshot.time).toLocaleString()}
                            </span>
                          </div>
                          {getStatusBadge(config.latestSnapshot.status)}
                          {config.latestSnapshot.sizeBytes && (
                            <span className="text-muted-foreground">
                              {formatBytes(config.latestSnapshot.sizeBytes)}
                            </span>
                          )}
                        </div>
                      )}
                    </CardHeader>

                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        <Separator className="mb-4" />
                        <SnapshotList
                          configId={config.id}
                          onRestore={(snapshotId) =>
                            triggerRestoreMutation.mutate({ configId: config.id, snapshotId })
                          }
                          onVerify={() => verifyMutation.mutate(config.id)}
                          onDelete={() => deleteConfigMutation.mutate(config.id)}
                          formatBytes={formatBytes}
                          formatDuration={formatDuration}
                        />
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Sidebar - Quick Actions */}
      <div className="w-80 border-l flex flex-col bg-muted/30">
        <div className="p-4 border-b">
          <h2 className="text-sm font-semibold">Quick Actions</h2>
          <p className="text-xs text-muted-foreground mt-1">Common backup operations</p>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-3">
            <Card className="p-3">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Restic Features
              </h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• AES-256 encryption</li>
                <li>• Deduplication</li>
                <li>• Incremental backups</li>
                <li>• Integrity verification</li>
                <li>• Multiple backends</li>
              </ul>
            </Card>

            <Card className="p-3">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Cloud className="h-4 w-4" />
                Supported Backends
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Badge variant="secondary">Local</Badge>
                <Badge variant="secondary">SFTP</Badge>
                <Badge variant="secondary">S3</Badge>
                <Badge variant="secondary">Backblaze B2</Badge>
              </div>
            </Card>

            <Card className="p-3">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Retention Policy
              </h4>
              <p className="text-xs text-muted-foreground">
                Default: 7 daily, 4 weekly, 12 monthly, 2 yearly snapshots
              </p>
            </Card>

            <Separator />

            <div className="text-xs text-muted-foreground">
              <p className="font-medium mb-1">Tip:</p>
              <p>
                Use the Agent chat to run backup operations. Say "backup my server" or
                "show backup snapshots" to get started.
              </p>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// Create Backup Form Component
function CreateBackupForm({
  servers,
  onSubmit,
  isLoading,
}: {
  servers: VpsServer[];
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    name: "",
    vpsServerId: "",
    repositoryType: "local",
    repositoryPath: "/backup/restic",
    password: "",
    includePaths: "/etc,/var/www,/home",
    excludePatterns: "*.log,*.tmp,node_modules,.git",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      includePaths: formData.includePaths.split(",").map((p) => p.trim()),
      excludePatterns: formData.excludePatterns.split(",").map((p) => p.trim()),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Configuration Name</Label>
        <Input
          id="name"
          placeholder="e.g., Daily Full Backup"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="server">VPS Server</Label>
        <Select
          value={formData.vpsServerId}
          onValueChange={(v) => setFormData({ ...formData, vpsServerId: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a server" />
          </SelectTrigger>
          <SelectContent>
            {servers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} ({s.host})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="repoType">Repository Type</Label>
        <Select
          value={formData.repositoryType}
          onValueChange={(v) => setFormData({ ...formData, repositoryType: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="local">Local Storage</SelectItem>
            <SelectItem value="s3">Amazon S3 / S3-Compatible</SelectItem>
            <SelectItem value="sftp">SFTP Remote Server</SelectItem>
            <SelectItem value="b2">Backblaze B2</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="repoPath">Repository Path</Label>
        <Input
          id="repoPath"
          placeholder={
            formData.repositoryType === "s3"
              ? "s3:bucket-name/path"
              : formData.repositoryType === "sftp"
              ? "user@host:/path"
              : "/backup/restic"
          }
          value={formData.repositoryPath}
          onChange={(e) => setFormData({ ...formData, repositoryPath: e.target.value })}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Repository Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="Strong encryption password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          required
        />
        <p className="text-xs text-muted-foreground">
          This password encrypts your backups. Store it safely - you can't recover data without it!
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="includePaths">Paths to Backup</Label>
        <Input
          id="includePaths"
          placeholder="/etc,/var/www,/home"
          value={formData.includePaths}
          onChange={(e) => setFormData({ ...formData, includePaths: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="excludePatterns">Exclude Patterns</Label>
        <Input
          id="excludePatterns"
          placeholder="*.log,*.tmp,node_modules"
          value={formData.excludePatterns}
          onChange={(e) => setFormData({ ...formData, excludePatterns: e.target.value })}
        />
      </div>

      <DialogFooter>
        <Button type="submit" disabled={isLoading || !formData.vpsServerId}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Create Configuration
        </Button>
      </DialogFooter>
    </form>
  );
}

// Snapshot List Component
function SnapshotList({
  configId,
  onRestore,
  onVerify,
  onDelete,
  formatBytes,
  formatDuration,
}: {
  configId: string;
  onRestore: (snapshotId: string) => void;
  onVerify: () => void;
  onDelete: () => void;
  formatBytes: (bytes: number | null) => string;
  formatDuration: (seconds: number | null) => string;
}) {
  const { data: snapshots, isLoading } = useQuery<BackupSnapshot[]>({
    queryKey: [`/api/backup-configs/${configId}/snapshots`],
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Snapshots</h4>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onVerify}>
            <Shield className="h-4 w-4 mr-1" />
            Verify
          </Button>
          <Button variant="outline" size="sm" className="text-destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4 mr-1" />
            Delete Config
          </Button>
        </div>
      </div>

      {!snapshots || snapshots.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No snapshots yet. Run a backup to create the first snapshot.
        </p>
      ) : (
        <div className="space-y-2">
          {snapshots.slice(0, 10).map((snapshot) => (
            <div
              key={snapshot.id}
              className="flex items-center justify-between p-3 rounded-lg border bg-card"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-muted text-xs font-mono">
                  {snapshot.snapshotId.substring(0, 6)}
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {new Date(snapshot.createdAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(snapshot.sizeBytes)} •{" "}
                    {snapshot.filesNew || 0} new files •{" "}
                    {formatDuration(snapshot.duration)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={snapshot.snapshotType === "scheduled" ? "secondary" : "outline"}>
                  {snapshot.snapshotType}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRestore(snapshot.snapshotId)}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
