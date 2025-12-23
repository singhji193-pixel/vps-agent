import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import AuthPage from "@/pages/auth";
import ServersPage from "@/pages/servers";
import GithubPage from "@/pages/github";
import BackupsPage from "@/pages/backups";
import SettingsPage from "@/pages/settings";
import TerminalPage from "@/pages/terminal";
import MonitoringPage from "@/pages/monitoring";
import TasksPage from "@/pages/tasks";
import InfrastructurePage from "@/pages/infrastructure";
import AgentPage from "@/pages/agent";
import NotFound from "@/pages/not-found";

function AuthenticatedApp() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between gap-4 px-4 py-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-hidden">
            <Switch>
              <Route path="/" component={AgentPage} />
              <Route path="/servers" component={ServersPage} />
              <Route path="/terminal" component={TerminalPage} />
              <Route path="/monitoring" component={MonitoringPage} />
              <Route path="/tasks" component={TasksPage} />
              <Route path="/infrastructure" component={InfrastructurePage} />
              <Route path="/backups" component={BackupsPage} />
              <Route path="/github" component={GithubPage} />
              <Route path="/settings" component={SettingsPage} />
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const { data: authStatus, isLoading } = useQuery<{ authenticated: boolean }>({
    queryKey: ["/api/auth/status"],
    retry: false,
  });

  useEffect(() => {
    if (!isLoading) {
      setIsAuthenticated(!!authStatus?.authenticated);
    }
  }, [authStatus, isLoading]);

  if (isLoading || isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  return <AuthenticatedApp />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <AppContent />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
