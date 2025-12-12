import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Github,
  GitBranch,
  GitCommit,
  RefreshCw,
  Link2,
  Unlink,
  Loader2,
  Check,
  FolderGit2,
  Clock,
  Download,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { GithubIntegration } from "@shared/schema";

const githubFormSchema = z.object({
  accessToken: z.string().min(1, "Access token is required"),
  repositoryUrl: z.string().url("Please enter a valid repository URL"),
  branch: z.string().default("main"),
});

type GithubFormData = z.infer<typeof githubFormSchema>;

interface RecentCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export default function GithubPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: integration, isLoading } = useQuery<GithubIntegration | null>({
    queryKey: ["/api/github/integration"],
  });

  const { data: recentCommits } = useQuery<RecentCommit[]>({
    queryKey: ["/api/github/commits"],
    enabled: !!integration,
  });

  const form = useForm<GithubFormData>({
    resolver: zodResolver(githubFormSchema),
    defaultValues: {
      accessToken: "",
      repositoryUrl: "",
      branch: "main",
    },
  });

  const connectMutation = useMutation({
    mutationFn: async (data: GithubFormData) => {
      return apiRequest("POST", "/api/github/connect", data);
    },
    onSuccess: () => {
      toast({
        title: "Connected to GitHub",
        description: "Your repository has been linked successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/github"] });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Connection failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/github/disconnect");
    },
    onSuccess: () => {
      toast({
        title: "Disconnected",
        description: "Your GitHub connection has been removed.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/github"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/github/sync");
    },
    onSuccess: () => {
      toast({
        title: "Sync complete",
        description: "Your configurations have been synced with GitHub.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/github/commits"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const forkMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/github/fork");
    },
    onSuccess: () => {
      toast({
        title: "Fork created",
        description: "Your conversation context has been saved to a new branch.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/github/commits"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Fork failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: GithubFormData) => {
    connectMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-48 mb-6" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-48 mt-2" />
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">GitHub Integration</h1>
          <p className="text-muted-foreground mt-1">
            Version control your VPS configurations and command history
          </p>
        </div>
        {integration && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              data-testid="button-sync-github"
            >
              {syncMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync
            </Button>
            <Button
              onClick={() => forkMutation.mutate()}
              disabled={forkMutation.isPending}
              data-testid="button-fork-save"
            >
              {forkMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FolderGit2 className="h-4 w-4 mr-2" />
              )}
              Fork & Save
            </Button>
          </div>
        )}
      </div>

      {!integration ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted mb-4">
              <Github className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Connect to GitHub</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-6">
              Link your GitHub repository to automatically backup VPS configurations, 
              command history, and conversation context.
            </p>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-connect-github">
                  <Link2 className="h-4 w-4 mr-2" />
                  Connect Repository
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Connect GitHub Repository</DialogTitle>
                  <DialogDescription>
                    Enter your GitHub Personal Access Token and repository URL
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="accessToken"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Personal Access Token</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="password"
                              placeholder="ghp_xxxxxxxxxxxx"
                              data-testid="input-github-token"
                            />
                          </FormControl>
                          <FormDescription>
                            Generate a token with repo permissions at GitHub Settings
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="repositoryUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Repository URL</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="https://github.com/username/vps-configs"
                              data-testid="input-github-repo"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="branch"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Branch</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-github-branch">
                                <SelectValue placeholder="Select branch" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="main">main</SelectItem>
                              <SelectItem value="master">master</SelectItem>
                              <SelectItem value="develop">develop</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-end gap-3 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={connectMutation.isPending} data-testid="button-save-github">
                        {connectMutation.isPending && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        Connect
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted">
                    <Github className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      Connected Repository
                      <Badge variant="secondary" className="text-xs">
                        <Check className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    </CardTitle>
                    <CardDescription className="font-mono text-sm mt-1">
                      {integration.repositoryUrl}
                    </CardDescription>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                  data-testid="button-disconnect-github"
                >
                  <Unlink className="h-4 w-4 mr-2" />
                  Disconnect
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                  <span>{integration.branch || "main"}</span>
                </div>
                {integration.lastSync && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Last synced: {new Date(integration.lastSync).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Push to GitHub
                </CardTitle>
                <CardDescription>
                  Save current configurations and history to your repository
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                >
                  {syncMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Push Changes
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Pull from GitHub
                </CardTitle>
                <CardDescription>
                  Restore configurations from your repository
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  <Download className="h-4 w-4 mr-2" />
                  Pull Changes
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <GitCommit className="h-4 w-4" />
                Recent Commits
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentCommits && recentCommits.length > 0 ? (
                <ScrollArea className="h-64">
                  <div className="space-y-3">
                    {recentCommits.map((commit) => (
                      <div
                        key={commit.sha}
                        className="flex items-start gap-3 p-3 rounded-md bg-muted/50"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <GitCommit className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{commit.message}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>{commit.author}</span>
                            <span>•</span>
                            <span>{new Date(commit.date).toLocaleDateString()}</span>
                            <span className="font-mono">{commit.sha.slice(0, 7)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-sm text-muted-foreground">No commits yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Push your first changes to see them here
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
