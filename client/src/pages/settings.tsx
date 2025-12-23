import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  User,
  Mail,
  Shield,
  Bell,
  LogOut,
  Loader2,
  Check,
  Moon,
  Sun,
  Monitor,
  Key,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/lib/theme-provider";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { User as UserType } from "@shared/schema";

interface ApiKeyStatus {
  anthropic: { configured: boolean; source: "user" | "env" | "none"; masked: string };
  perplexity: { configured: boolean; source: "user" | "env" | "none"; masked: string };
}

export default function SettingsPage() {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [perplexityKey, setPerplexityKey] = useState("");
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showPerplexityKey, setShowPerplexityKey] = useState(false);
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();

  const { data: user } = useQuery<UserType>({
    queryKey: ["/api/auth/me"],
  });

  const { data: apiKeyStatus, refetch: refetchApiKeys } = useQuery<ApiKeyStatus>({
    queryKey: ["/api/settings/api-keys"],
  });

  const { data: webhookData } = useQuery<{ webhookUrl: string }>({
    queryKey: ["/api/settings/webhook"],
  });

  // Load saved webhook URL when data arrives
  useEffect(() => {
    if (webhookData?.webhookUrl) {
      setWebhookUrl(webhookData.webhookUrl);
    }
  }, [webhookData]);

  const updateWebhookMutation = useMutation({
    mutationFn: async (url: string) => {
      return apiRequest("PATCH", "/api/settings/webhook", { webhookUrl: url });
    },
    onSuccess: () => {
      toast({
        title: "Settings updated",
        description: "Your n8n webhook URL has been saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.clear();
      window.location.href = "/";
    },
  });

  const saveApiKeysMutation = useMutation({
    mutationFn: async (keys: { anthropicApiKey?: string; perplexityApiKey?: string }) => {
      return apiRequest("POST", "/api/settings/api-keys", keys);
    },
    onSuccess: () => {
      toast({ title: "API keys saved", description: "Your API keys have been securely stored." });
      setAnthropicKey("");
      setPerplexityKey("");
      refetchApiKeys();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account and application preferences
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Account
            </CardTitle>
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Mail className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{user?.email || "Not logged in"}</p>
                  <p className="text-xs text-muted-foreground">Email address</p>
                </div>
              </div>
              {user?.isVerified && (
                <Badge variant="secondary" className="text-xs">
                  <Check className="h-3 w-3 mr-1" />
                  Verified
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              Appearance
            </CardTitle>
            <CardDescription>Customize the look and feel</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Theme</p>
                <p className="text-xs text-muted-foreground">Select your preferred theme</p>
              </div>
              <Select value={theme} onValueChange={(value: "light" | "dark") => setTheme(value)}>
                <SelectTrigger className="w-32" data-testid="select-theme">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">
                    <div className="flex items-center gap-2">
                      <Sun className="h-4 w-4" />
                      Light
                    </div>
                  </SelectItem>
                  <SelectItem value="dark">
                    <div className="flex items-center gap-2">
                      <Moon className="h-4 w-4" />
                      Dark
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4" />
              API Keys
            </CardTitle>
            <CardDescription>
              Configure your AI provider API keys (stored encrypted)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Claude API Key */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="anthropic-key">Claude (Anthropic) API Key</Label>
                {apiKeyStatus?.anthropic && (
                  <Badge variant={apiKeyStatus.anthropic.configured ? "secondary" : "outline"} className="text-xs">
                    {apiKeyStatus.anthropic.source === "user" ? "Custom" : 
                     apiKeyStatus.anthropic.source === "env" ? "Environment" : "Not set"}
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="anthropic-key"
                    type={showAnthropicKey ? "text" : "password"}
                    value={anthropicKey}
                    onChange={(e) => setAnthropicKey(e.target.value)}
                    placeholder={apiKeyStatus?.anthropic?.masked || "sk-ant-api..."}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1 h-7 w-7 p-0"
                    onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                  >
                    {showAnthropicKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button
                  onClick={() => saveApiKeysMutation.mutate({ anthropicApiKey: anthropicKey })}
                  disabled={!anthropicKey || saveApiKeysMutation.isPending}
                >
                  {saveApiKeysMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Required for AI agent. Get your key from{" "}
                <a href="https://console.anthropic.com/" target="_blank" rel="noopener" className="underline">console.anthropic.com</a>
              </p>
            </div>

            <Separator />

            {/* Perplexity API Key */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="perplexity-key">Perplexity API Key (Optional)</Label>
                {apiKeyStatus?.perplexity && (
                  <Badge variant={apiKeyStatus.perplexity.configured ? "secondary" : "outline"} className="text-xs">
                    {apiKeyStatus.perplexity.source === "user" ? "Custom" : 
                     apiKeyStatus.perplexity.source === "env" ? "Environment" : "Not set"}
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="perplexity-key"
                    type={showPerplexityKey ? "text" : "password"}
                    value={perplexityKey}
                    onChange={(e) => setPerplexityKey(e.target.value)}
                    placeholder={apiKeyStatus?.perplexity?.masked || "pplx-..."}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1 h-7 w-7 p-0"
                    onClick={() => setShowPerplexityKey(!showPerplexityKey)}
                  >
                    {showPerplexityKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button
                  onClick={() => saveApiKeysMutation.mutate({ perplexityApiKey: perplexityKey })}
                  disabled={!perplexityKey || saveApiKeysMutation.isPending}
                >
                  {saveApiKeysMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enables Research mode for real-time web search. Get your key from{" "}
                <a href="https://www.perplexity.ai/settings/api" target="_blank" rel="noopener" className="underline">perplexity.ai</a>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4" />
              n8n Webhook Integration
            </CardTitle>
            <CardDescription>
              Configure your n8n webhook URL for OTP email notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="webhook">Webhook URL</Label>
              <div className="flex gap-2">
                <Input
                  id="webhook"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://your-n8n-instance.com/webhook/..."
                  data-testid="input-webhook-url"
                />
                <Button
                  onClick={() => updateWebhookMutation.mutate(webhookUrl)}
                  disabled={updateWebhookMutation.isPending}
                  data-testid="button-save-webhook"
                >
                  {updateWebhookMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This webhook will receive OTP codes to send via your SMTP configuration in n8n
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Security
            </CardTitle>
            <CardDescription>Security settings and preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Command confirmation</p>
                <p className="text-xs text-muted-foreground">
                  Require confirmation before executing destructive commands
                </p>
              </div>
              <Switch defaultChecked data-testid="switch-command-confirmation" />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Audit logging</p>
                <p className="text-xs text-muted-foreground">
                  Keep detailed logs of all executed commands
                </p>
              </div>
              <Switch defaultChecked data-testid="switch-audit-logging" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base text-destructive flex items-center gap-2">
              <LogOut className="h-4 w-4" />
              Sign Out
            </CardTitle>
            <CardDescription>
              Sign out of your account on this device
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              data-testid="button-logout"
            >
              {logoutMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4 mr-2" />
              )}
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
