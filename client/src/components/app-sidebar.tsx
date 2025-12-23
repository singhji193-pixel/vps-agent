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
  Github,
  Settings,
  Plus,
  Terminal,
  Sparkles,
  Coins,
  LogOut,
  Activity,
  ListTodo,
  Container,
  FolderArchive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const mainNavItems = [
  {
    title: "Agent",
    url: "/",
    icon: Sparkles,
    description: "AI-powered VPS management",
  },
  {
    title: "Terminal",
    url: "/terminal",
    icon: Terminal,
    description: "Real-time SSH with AI",
  },
  {
    title: "Monitoring",
    url: "/monitoring",
    icon: Activity,
    description: "Server metrics & alerts",
  },
  {
    title: "Tasks",
    url: "/tasks",
    icon: ListTodo,
    description: "Multi-step orchestration",
  },
  {
    title: "Infrastructure",
    url: "/infrastructure",
    icon: Container,
    description: "Docker, Nginx & SSL",
  },
  {
    title: "Backups",
    url: "/backups",
    icon: FolderArchive,
    description: "Backup & restore with restic",
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
  const [location, setLocation] = useLocation();
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();
  
  const { data: usageData } = useQuery<UsageStats>({
    queryKey: ["/api/usage"],
    refetchInterval: 30000,
  });

  // Handle New Conversation button click
  const handleNewConversation = async () => {
    try {
      setIsCreating(true);
      
      // Get first server
      const serversRes = await fetch('/api/vps-servers');
      if (!serversRes.ok) throw new Error('Failed to fetch servers');
      
      const servers = await serversRes.json();
      
      if (servers.length === 0) {
        toast({
          title: "No VPS Server",
          description: "Please add a VPS server first before creating a conversation.",
          variant: "destructive",
        });
        setLocation('/servers');
        return;
      }
      
      // Create new conversation
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vpsServerId: servers[0].id,
          title: 'New Chat',
          mode: 'chat',
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create conversation');
      }
      
      const newConversation = await response.json();
      
      // Navigate to new conversation
      setLocation('/');
      
      toast({
        title: "New Chat Created",
        description: "Ready to start chatting!",
      });
      
    } catch (error) {
      console.error('Error creating conversation:', error);
      toast({
        title: "Error",
        description: "Failed to create new conversation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  // Handle Logout button click
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      
      toast({
        title: "Logged out",
        description: "You have been logged out successfully.",
      });
      
      // Redirect to login page
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout error:', error);
      toast({
        title: "Error",
        description: "Failed to logout. Please try again.",
        variant: "destructive",
      });
    }
  };

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
          <Button 
            className="w-full justify-start gap-2" 
            size="sm" 
            data-testid="button-new-conversation"
            onClick={handleNewConversation}
            disabled={isCreating}
          >
            <Plus className="h-4 w-4" />
            {isCreating ? 'Creating...' : 'New Conversation'}
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
        
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={handleLogout}
          data-testid="button-logout"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
