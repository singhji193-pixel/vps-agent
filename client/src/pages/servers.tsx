import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Server,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  Loader2,
  Key,
  Lock,
  Plug,
  PlugZap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { VpsServer } from "@shared/schema";

const serverFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  host: z.string().min(1, "Host is required"),
  port: z.coerce.number().min(1).max(65535).default(22),
  username: z.string().min(1, "Username is required"),
  authMethod: z.enum(["password", "key"]),
  credential: z.string().min(1, "Password or SSH key is required"),
});

type ServerFormData = z.infer<typeof serverFormSchema>;

export default function ServersPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<VpsServer | null>(null);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: servers, isLoading } = useQuery<VpsServer[]>({
    queryKey: ["/api/vps-servers"],
  });

  const form = useForm<ServerFormData>({
    resolver: zodResolver(serverFormSchema),
    defaultValues: {
      name: "",
      host: "",
      port: 22,
      username: "",
      authMethod: "password",
      credential: "",
    },
  });

  const createServerMutation = useMutation({
    mutationFn: async (data: ServerFormData) => {
      return apiRequest("POST", "/api/vps-servers", data);
    },
    onSuccess: () => {
      toast({
        title: "Server added",
        description: "Your VPS server has been added successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vps-servers"] });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateServerMutation = useMutation({
    mutationFn: async (data: ServerFormData & { id: string }) => {
      return apiRequest("PATCH", `/api/vps-servers/${data.id}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Server updated",
        description: "Your VPS server has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vps-servers"] });
      setIsDialogOpen(false);
      setEditingServer(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteServerMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/vps-servers/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Server deleted",
        description: "Your VPS server has been removed.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vps-servers"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async (id: string) => {
      setTestingConnection(id);
      return apiRequest("POST", `/api/vps-servers/${id}/test`);
    },
    onSuccess: () => {
      toast({
        title: "Connection successful",
        description: "Successfully connected to your VPS server.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Connection failed",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setTestingConnection(null);
    },
  });

  const onSubmit = (data: ServerFormData) => {
    if (editingServer) {
      updateServerMutation.mutate({ ...data, id: editingServer.id });
    } else {
      createServerMutation.mutate(data);
    }
  };

  const openEditDialog = (server: VpsServer) => {
    setEditingServer(server);
    form.reset({
      name: server.name,
      host: server.host,
      port: server.port || 22,
      username: server.username,
      authMethod: server.authMethod as "password" | "key",
      credential: "",
    });
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingServer(null);
    form.reset();
  };

  const authMethod = form.watch("authMethod");

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">VPS Servers</h1>
          <p className="text-muted-foreground mt-1">
            Manage your SSH connections and server credentials
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-server">
              <Plus className="h-4 w-4 mr-2" />
              Add Server
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingServer ? "Edit Server" : "Add New Server"}</DialogTitle>
              <DialogDescription>
                {editingServer
                  ? "Update your VPS server connection details"
                  : "Enter your VPS server credentials to connect"}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Server Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="My Production Server"
                          data-testid="input-server-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="host"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Host / IP Address</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="192.168.1.1 or example.com"
                            data-testid="input-server-host"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="port"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Port</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            placeholder="22"
                            data-testid="input-server-port"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="root"
                          data-testid="input-server-username"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="authMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Authentication Method</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-auth-method">
                            <SelectValue placeholder="Select authentication method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="password">
                            <div className="flex items-center gap-2">
                              <Lock className="h-4 w-4" />
                              Password
                            </div>
                          </SelectItem>
                          <SelectItem value="key">
                            <div className="flex items-center gap-2">
                              <Key className="h-4 w-4" />
                              SSH Private Key
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="credential"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {authMethod === "password" ? "Password" : "Private Key"}
                      </FormLabel>
                      <FormControl>
                        {authMethod === "password" ? (
                          <Input
                            {...field}
                            type="password"
                            placeholder="Enter your password"
                            data-testid="input-server-credential"
                          />
                        ) : (
                          <Textarea
                            {...field}
                            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                            className="font-mono text-sm min-h-[120px]"
                            data-testid="input-server-credential"
                          />
                        )}
                      </FormControl>
                      <FormDescription>
                        {authMethod === "password"
                          ? "Your SSH password will be encrypted and stored securely"
                          : "Paste your SSH private key. It will be encrypted and stored securely."}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={closeDialog}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createServerMutation.isPending || updateServerMutation.isPending}
                    data-testid="button-save-server"
                  >
                    {(createServerMutation.isPending || updateServerMutation.isPending) && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {editingServer ? "Update Server" : "Add Server"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32 mt-2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : servers?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted mb-4">
              <Server className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No servers added</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-4">
              Add your first VPS server to start managing it with AI-powered commands.
            </p>
            <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-first-server">
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Server
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {servers?.map((server) => (
            <Card key={server.id} data-testid={`card-server-${server.id}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                    <Server className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {server.name}
                      {server.isActive && (
                        <Badge variant="secondary" className="text-xs">
                          <div className="h-1.5 w-1.5 rounded-full bg-status-online mr-1" />
                          Active
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1 font-mono text-sm">
                      {server.username}@{server.host}:{server.port}
                    </CardDescription>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-xs">
                        {server.authMethod === "password" ? (
                          <>
                            <Lock className="h-3 w-3 mr-1" />
                            Password
                          </>
                        ) : (
                          <>
                            <Key className="h-3 w-3 mr-1" />
                            SSH Key
                          </>
                        )}
                      </Badge>
                      {server.lastConnected && (
                        <span className="text-xs text-muted-foreground">
                          Last connected: {new Date(server.lastConnected).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testConnectionMutation.mutate(server.id)}
                    disabled={testingConnection === server.id}
                    data-testid={`button-test-connection-${server.id}`}
                  >
                    {testingConnection === server.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PlugZap className="h-4 w-4" />
                    )}
                    <span className="ml-2 hidden sm:inline">Test</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditDialog(server)}
                    data-testid={`button-edit-server-${server.id}`}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteServerMutation.mutate(server.id)}
                    disabled={deleteServerMutation.isPending}
                    data-testid={`button-delete-server-${server.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
