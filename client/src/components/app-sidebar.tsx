import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Server,
  TestTube2,
  Github,
  Settings,
  Plus,
  Terminal,
  Sparkles,
  Coins,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const mainNavItems = [
  {
    title: "Unified Agent",
    url: "/",
    icon: Sparkles,
    description: "AI-powered VPS management",
  },
  {
    title: "Testing Dashboard",
    url: "/testing",
    icon: TestTube2,
    description: "View test runs",
  },
];

const managementItems = [
  {
    title: "VPS Servers",
    url: "/servers",
    icon: Server,
    description: "Manage SSH connections",
  },
  {
    title: "GitHub",
    url: "/github",
    icon: Github,
    description: "Sync configurations",
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
    description: "Account settings",
  },
];

interface UsageStats {
  stats: { totalTokens: number; totalCost: number; requestCount: number };
  recentUsage: any[];
}

export function AppSidebar() {
  const [location] = useLocation();
  
  const { data: usageData } = useQuery<UsageStats>({
    queryKey: ["/api/usage"],
    refetchInterval: 30000,
  });

  const formatCost = (cost: number) => {
    return cost < 0.01 ? "<$0.01" : `$${cost.toFixed(2)}`;
  };

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return tokens.toString();
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
            <Terminal className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-semibold">VPS Agent</span>
            <span className="text-xs text-muted-foreground">AI Server Management</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <div className="px-2 py-2">
          <Button className="w-full justify-start gap-2" size="sm" data-testid="button-new-conversation">
            <Plus className="h-4 w-4" />
            New Conversation
          </Button>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium uppercase tracking-wide text-muted-foreground px-2">
            Agents
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`nav-${item.title.toLowerCase()}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium uppercase tracking-wide text-muted-foreground px-2">
            Management
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {managementItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`nav-${item.title.toLowerCase().replace(' ', '-')}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 space-y-2">
        <div className="rounded-md bg-muted/50 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium">API Usage</span>
          </div>
          
          {usageData?.stats ? (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total Spent</span>
                <span className="font-medium">{formatCost(usageData.stats.totalCost)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Tokens Used</span>
                <span className="font-medium">{formatTokens(usageData.stats.totalTokens)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Requests</span>
                <span className="font-medium">{usageData.stats.requestCount}</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No usage yet</div>
          )}
        </div>
        
        <div className="flex items-center gap-2 rounded-md bg-muted/50 p-3">
          <div className="h-2 w-2 rounded-full bg-status-online" />
          <span className="text-xs text-muted-foreground">Connected</span>
          <Badge variant="secondary" className="ml-auto text-xs">
            Pro
          </Badge>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
