import React, { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ChatWidget } from "@/components/chat/ChatWidget";

// Page imports
import { Home } from "@/pages/Home";
import { About } from "@/pages/About";
import { Portfolio } from "@/pages/Portfolio";
import { ProjectDetail } from "@/pages/ProjectDetail";
import { Capabilities } from "@/pages/Capabilities";
import { Contact } from "@/pages/Contact";
import { Match } from "@/pages/Match";
import { AdminUsage } from "@/pages/AdminUsage";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

// Auto dark mode
function ThemeSetup() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);
  return null;
}

function Router() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/about" component={About} />
          <Route path="/portfolio" component={Portfolio} />
          <Route path="/portfolio/:id" component={ProjectDetail} />
          <Route path="/capabilities" component={Capabilities} />
          <Route path="/contact" component={Contact} />
          <Route path="/match" component={Match} />
          <Route path="/match/:id" component={Match} />
          <Route path="/admin/usage" component={AdminUsage} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
      <ChatWidget />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSetup />
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
