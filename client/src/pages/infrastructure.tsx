import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Container,
  Server,
  Globe,
  Shield,
  Play,
  Square,
  RotateCcw,
  Trash2,
  FileText,
  Plus,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Download,
  Settings,
  ExternalLink,
  Lock,
  Unlock,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { VpsServer } from "@shared/schema";

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
}

interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: string;
}

interface NginxSite {
  name: string;
  enabled: boolean;
  configPath: string;
}

interface SSLCertificate {
  domain: string;
  issuer: string;
  validTo: string;
  daysRemaining: number;
}

export default function InfrastructurePage() {
  const [selectedServerId, setSelectedServerId] = useState<string>("");
  const [activeTab, setActiveTab] = useState("docker");
  const [pullImageDialog, setPullImageDialog] = useState(false);
  const [pullImageName, setPullImageName] = useState("");
  const [newSiteDialog, setNewSiteDialog] = useState(false);
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteDomain, setNewSiteDomain] = useState("");
  const [newSitePort, setNewSitePort] = useState("");
  const [sslRequestDialog, setSslRequestDialog] = useState(false);
  const [sslDomain, setSslDomain] = useState("");
  const [sslEmail, setSslEmail] = useState("");
  const [logsDialog, setLogsDialog] = useState<{ open: boolean; logs: string; title: string }>({
    open: false,
    logs: "",
    title: "",
  });
  const { toast } = useToast();

  const { data: servers } = useQuery<VpsServer[]>({
    queryKey: ["/api/vps-servers"],
  });

  useEffect(() => {
    if (servers?.length && !selectedServerId) {
      setSelectedServerId(servers[0].id);
    }
  }, [servers, selectedServerId]);

  // Docker queries
  const { data: containersData, refetch: refetchContainers, isLoading: containersLoading } = useQuery<{ containers: DockerContainer[] }>({
    queryKey: ["/api/agent/docker", selectedServerId, "containers"],
    enabled: !!selectedServerId && activeTab === "docker",
  });

  const { data: imagesData, refetch: refetchImages } = useQuery<{ images: DockerImage[] }>({
    queryKey: ["/api/agent/docker", selectedServerId, "images"],
    enabled: !!selectedServerId && activeTab === "docker",
  });

  // Nginx queries
  const { data: nginxStatus, refetch: refetchNginx, isLoading: nginxLoading } = useQuery<{
    running: boolean;
    version: string;
    configTest: boolean;
  }>({
    queryKey: ["/api/agent/nginx", selectedServerId, "status"],
    enabled: !!selectedServerId && activeTab === "nginx",
  });

  const { data: sitesData } = useQuery<{ sites: NginxSite[] }>({
    queryKey: ["/api/agent/nginx", selectedServerId, "sites"],
    enabled: !!selectedServerId && activeTab === "nginx",
  });

  // SSL queries
  const { data: sslData, refetch: refetchSSL, isLoading: sslLoading } = useQuery<{
    installed: boolean;
    certificates: SSLCertificate[];
  }>({
    queryKey: ["/api/agent/ssl", selectedServerId, "status"],
    enabled: !!selectedServerId && activeTab === "ssl",
  });

  // Container action mutation
  const containerActionMutation = useMutation({
    mutationFn: async ({ containerId, action }: { containerId: string; action: string }) => {
      const res = await apiRequest("POST", `/api/agent/docker/${selectedServerId}/containers/${containerId}/${action}`, {});
      return res.json();
    },
    onSuccess: (data, { action }) => {
      refetchContainers();
      if (action === "logs") {
        setLogsDialog({ open: true, logs: data.output, title: "Container Logs" });
      } else {
        toast({ title: `Container ${action} successful` });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Action failed", description: error.message, variant: "destructive" });
    },
  });

  // Pull image mutation
  const pullImageMutation = useMutation({
    mutationFn: async (image: string) => {
      const res = await apiRequest("POST", `/api/agent/docker/${selectedServerId}/pull`, { image });
      return res.json();
    },
    onSuccess: () => {
      setPullImageDialog(false);
      setPullImageName("");
      refetchImages();
      toast({ title: "Image pulled successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Pull failed", description: error.message, variant: "destructive" });
    },
  });

  // Nginx toggle site mutation
  const toggleSiteMutation = useMutation({
    mutationFn: async ({ siteName, enable }: { siteName: string; enable: boolean }) => {
      const res = await apiRequest("POST", `/api/agent/nginx/${selectedServerId}/sites/${siteName}/toggle`, { enable });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/nginx", selectedServerId] });
      toast({ title: "Site updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update site", description: error.message, variant: "destructive" });
    },
  });

  // Create Nginx site mutation
  const createSiteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/agent/nginx/${selectedServerId}/sites`, {
        siteName: newSiteName,
        domain: newSiteDomain,
        proxyPort: newSitePort ? parseInt(newSitePort) : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      setNewSiteDialog(false);
      setNewSiteName("");
      setNewSiteDomain("");
      setNewSitePort("");
      queryClient.invalidateQueries({ queryKey: ["/api/agent/nginx", selectedServerId] });
      toast({ title: "Site created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create site", description: error.message, variant: "destructive" });
    },
  });

  // Reload Nginx mutation
  const reloadNginxMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/agent/nginx/${selectedServerId}/reload`, {});
      return res.json();
    },
    onSuccess: () => {
      refetchNginx();
      toast({ title: "Nginx reloaded" });
    },
    onError: (error: Error) => {
      toast({ title: "Reload failed", description: error.message, variant: "destructive" });
    },
  });

  // Install certbot mutation
  const installCertbotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/agent/ssl/${selectedServerId}/install`, {});
      return res.json();
    },
    onSuccess: () => {
      refetchSSL();
      toast({ title: "Certbot installed" });
    },
    onError: (error: Error) => {
      toast({ title: "Installation failed", description: error.message, variant: "destructive" });
    },
  });

  // Request SSL certificate mutation
  const requestSSLMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/agent/ssl/${selectedServerId}/request`, {
        domain: sslDomain,
        email: sslEmail,
      });
      return res.json();
    },
    onSuccess: () => {
      setSslRequestDialog(false);
      setSslDomain("");
      setSslEmail("");
      refetchSSL();
      toast({ title: "SSL certificate issued!" });
    },
    onError: (error: Error) => {
      toast({ title: "SSL request failed", description: error.message, variant: "destructive" });
    },
  });

  const containers = containersData?.containers || [];
  const images = imagesData?.images || [];
  const sites = sitesData?.sites || [];
  const certificates = sslData?.certificates || [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 p-4 border-b bg-background">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Infrastructure</h1>
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
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b px-4">
          <TabsList>
            <TabsTrigger value="docker" className="gap-2">
              <Container className="h-4 w-4" />
              Docker
            </TabsTrigger>
            <TabsTrigger value="nginx" className="gap-2">
              <Globe className="h-4 w-4" />
              Nginx
            </TabsTrigger>
            <TabsTrigger value="ssl" className="gap-2">
              <Shield className="h-4 w-4" />
              SSL
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Docker Tab */}
        <TabsContent value="docker" className="flex-1 overflow-auto p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Docker Containers</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetchContainers()}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
              <Button size="sm" onClick={() => setPullImageDialog(true)}>
                <Download className="h-4 w-4 mr-1" />
                Pull Image
              </Button>
            </div>
          </div>

          {containersLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Image</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ports</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {containers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No containers found
                      </TableCell>
                    </TableRow>
                  ) : (
                    containers.map((container) => (
                      <TableRow key={container.id}>
                        <TableCell className="font-medium">{container.name}</TableCell>
                        <TableCell className="text-muted-foreground">{container.image}</TableCell>
                        <TableCell>
                          <Badge variant={container.state === "running" ? "default" : "secondary"}>
                            {container.state}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{container.ports || "-"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {container.state === "running" ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => containerActionMutation.mutate({ containerId: container.id, action: "stop" })}
                              >
                                <Square className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => containerActionMutation.mutate({ containerId: container.id, action: "start" })}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => containerActionMutation.mutate({ containerId: container.id, action: "restart" })}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => containerActionMutation.mutate({ containerId: container.id, action: "logs" })}
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => containerActionMutation.mutate({ containerId: container.id, action: "remove" })}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          )}

          {/* Images */}
          <h2 className="text-lg font-medium mt-6">Docker Images</h2>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Repository</TableHead>
                  <TableHead>Tag</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {images.map((image) => (
                  <TableRow key={image.id}>
                    <TableCell className="font-medium">{image.repository}</TableCell>
                    <TableCell>{image.tag}</TableCell>
                    <TableCell>{image.size}</TableCell>
                    <TableCell className="font-mono text-xs">{image.id.slice(0, 12)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Nginx Tab */}
        <TabsContent value="nginx" className="flex-1 overflow-auto p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-medium">Nginx Configuration</h2>
              {nginxStatus && (
                <Badge variant={nginxStatus.running ? "default" : "destructive"}>
                  {nginxStatus.running ? "Running" : "Stopped"}
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => reloadNginxMutation.mutate()}>
                <RotateCcw className="h-4 w-4 mr-1" />
                Reload
              </Button>
              <Button size="sm" onClick={() => setNewSiteDialog(true)}>
                <Plus className="h-4 w-4 mr-1" />
                New Site
              </Button>
            </div>
          </div>

          {nginxStatus && (
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    {nginxStatus.running ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <span>Status: {nginxStatus.running ? "Active" : "Inactive"}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-muted-foreground" />
                    <span>Version: {nginxStatus.version || "Unknown"}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    {nginxStatus.configTest ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    )}
                    <span>Config: {nginxStatus.configTest ? "Valid" : "Error"}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Sites</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sites.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                        No sites configured
                      </TableCell>
                    </TableRow>
                  ) : (
                    sites.map((site) => (
                      <TableRow key={site.name}>
                        <TableCell className="font-medium">{site.name}</TableCell>
                        <TableCell>
                          <Badge variant={site.enabled ? "default" : "secondary"}>
                            {site.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleSiteMutation.mutate({ siteName: site.name, enable: !site.enabled })}
                          >
                            {site.enabled ? (
                              <>
                                <Unlock className="h-4 w-4 mr-1" />
                                Disable
                              </>
                            ) : (
                              <>
                                <Lock className="h-4 w-4 mr-1" />
                                Enable
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SSL Tab */}
        <TabsContent value="ssl" className="flex-1 overflow-auto p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">SSL Certificates</h2>
            <div className="flex gap-2">
              {sslData?.installed ? (
                <Button size="sm" onClick={() => setSslRequestDialog(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Request Certificate
                </Button>
              ) : (
                <Button size="sm" onClick={() => installCertbotMutation.mutate()}>
                  <Download className="h-4 w-4 mr-1" />
                  Install Certbot
                </Button>
              )}
            </div>
          </div>

          {!sslData?.installed ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Certbot Not Installed</h3>
                <p className="text-muted-foreground mb-4">
                  Install Certbot to manage Let's Encrypt SSL certificates
                </p>
                <Button onClick={() => installCertbotMutation.mutate()} disabled={installCertbotMutation.isPending}>
                  {installCertbotMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Install Certbot
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Issuer</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {certificates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No certificates found
                      </TableCell>
                    </TableRow>
                  ) : (
                    certificates.map((cert) => (
                      <TableRow key={cert.domain}>
                        <TableCell className="font-medium">{cert.domain}</TableCell>
                        <TableCell>{cert.issuer}</TableCell>
                        <TableCell>{cert.validTo}</TableCell>
                        <TableCell>
                          <Badge variant={cert.daysRemaining > 30 ? "default" : cert.daysRemaining > 7 ? "secondary" : "destructive"}>
                            {cert.daysRemaining} days left
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Pull Image Dialog */}
      <Dialog open={pullImageDialog} onOpenChange={setPullImageDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pull Docker Image</DialogTitle>
            <DialogDescription>Enter the image name to pull from Docker Hub</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Image Name</Label>
              <Input
                placeholder="e.g., nginx:latest, postgres:15"
                value={pullImageName}
                onChange={(e) => setPullImageName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPullImageDialog(false)}>Cancel</Button>
            <Button onClick={() => pullImageMutation.mutate(pullImageName)} disabled={!pullImageName || pullImageMutation.isPending}>
              {pullImageMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Pull
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Site Dialog */}
      <Dialog open={newSiteDialog} onOpenChange={setNewSiteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Nginx Site</DialogTitle>
            <DialogDescription>Configure a new Nginx site</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Site Name</Label>
              <Input placeholder="mysite" value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} />
            </div>
            <div>
              <Label>Domain</Label>
              <Input placeholder="example.com" value={newSiteDomain} onChange={(e) => setNewSiteDomain(e.target.value)} />
            </div>
            <div>
              <Label>Proxy Port (optional)</Label>
              <Input placeholder="3000" value={newSitePort} onChange={(e) => setNewSitePort(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewSiteDialog(false)}>Cancel</Button>
            <Button onClick={() => createSiteMutation.mutate()} disabled={!newSiteName || !newSiteDomain || createSiteMutation.isPending}>
              {createSiteMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SSL Request Dialog */}
      <Dialog open={sslRequestDialog} onOpenChange={setSslRequestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request SSL Certificate</DialogTitle>
            <DialogDescription>Get a free SSL certificate from Let's Encrypt</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Domain</Label>
              <Input placeholder="example.com" value={sslDomain} onChange={(e) => setSslDomain(e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input placeholder="admin@example.com" value={sslEmail} onChange={(e) => setSslEmail(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSslRequestDialog(false)}>Cancel</Button>
            <Button onClick={() => requestSSLMutation.mutate()} disabled={!sslDomain || !sslEmail || requestSSLMutation.isPending}>
              {requestSSLMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />}
              Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logs Dialog */}
      <Dialog open={logsDialog.open} onOpenChange={(open) => setLogsDialog({ ...logsDialog, open })}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{logsDialog.title}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh]">
            <pre className="text-xs font-mono bg-muted p-4 rounded-md whitespace-pre-wrap">{logsDialog.logs}</pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
