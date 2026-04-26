import React, { Suspense, useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  AlertTriangle,
  Loader2,
  Save,
  Share2,
  Check,
  Download,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getProjectById } from "@workspace/site-data";
import { trackDemoEvent, type DemoSlug } from "@/lib/demoTelemetry";
import {
  buildShareUrl,
  readShareFromUrl,
  clearShareParams,
  applySharedState,
  hasLocalDemoState,
  type DecodedShareLink,
} from "./demoShareLink";
import { useToast } from "@/hooks/use-toast";

interface DemoFrameProps {
  title: string;
  eyebrow?: string;
  proves: string;
  projectId: string;
  demoSlug?: DemoSlug;
  persisted?: boolean;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

class DemoErrorBoundary extends React.Component<
  { demoTitle: string; onReset: () => void; children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { demoTitle: string; onReset: () => void; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Something went wrong inside this demo.",
    };
  }

  componentDidCatch(error: unknown) {
    if (typeof console !== "undefined") {
      console.error(`[LiveDemo:${this.props.demoTitle}]`, error);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, message: undefined });
    this.props.onReset();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex flex-col items-start gap-4 rounded-lg border border-destructive/40 bg-destructive/5 p-6"
        >
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            <span className="font-semibold">This demo crashed.</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {this.state.message ?? "An unexpected error occurred. The rest of the page is unaffected."}
          </p>
          <Button size="sm" variant="outline" onClick={this.handleReset}>
            Reload demo
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

function DemoFallback({ title }: { title: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/50 p-8 text-sm text-muted-foreground"
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>Loading {title}…</span>
    </div>
  );
}

function ShareImportBanner({
  shared,
  hasLocal,
  onLoad,
  onDiscard,
}: {
  shared: DecodedShareLink;
  hasLocal: boolean;
  onLoad: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-lg border border-accent/30 bg-accent/5 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3 min-w-0">
        <Download className="h-5 w-5 mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            Shared session available
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hasLocal
              ? "Someone shared their demo progress with you. Loading it will replace your current saved session."
              : "Someone shared their demo progress with you."}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" onClick={onLoad}>
          <Check className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
          Load shared session
        </Button>
        <Button size="sm" variant="ghost" onClick={onDiscard}>
          <X className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
          {hasLocal ? "Keep mine" : "Dismiss"}
        </Button>
      </div>
    </div>
  );
}

export function DemoFrame({
  title,
  eyebrow,
  proves,
  projectId,
  demoSlug,
  persisted = true,
  children,
}: DemoFrameProps) {
  const project = getProjectById(projectId);
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [pendingShare, setPendingShare] = useState<DecodedShareLink | null>(null);
  const [hasLocal, setHasLocal] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!demoSlug) return;
    const shared = readShareFromUrl();
    if (shared && shared.slug === demoSlug) {
      const local = hasLocalDemoState(demoSlug);
      setHasLocal(local);
      if (local) {
        setPendingShare(shared);
      } else {
        applySharedState(shared.slug, shared.stateMap);
        clearShareParams();
        setReloadKey((k) => k + 1);
        toast({
          title: "Shared session loaded",
          description: "The demo has been restored from the shared link.",
        });
      }
    }
  }, [demoSlug]);

  const handleCopyShareLink = useCallback(() => {
    if (!demoSlug) return;
    const url = buildShareUrl(demoSlug);
    if (!url) {
      toast({
        title: "Session too large to share",
        description:
          "This demo session has too much data to fit in a URL. Try resetting and sharing a smaller session.",
        variant: "destructive",
      });
      return;
    }
    navigator.clipboard.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast({
          title: "Share link copied",
          description: "Paste the link to let someone else load your demo session.",
        });
      },
      () => {
        toast({
          title: "Could not copy link",
          description: "Your browser blocked clipboard access. Try copying the URL manually.",
          variant: "destructive",
        });
      },
    );
  }, [demoSlug, toast]);

  const handleLoadShared = useCallback(() => {
    if (!pendingShare) return;
    applySharedState(pendingShare.slug, pendingShare.stateMap);
    clearShareParams();
    setPendingShare(null);
    setReloadKey((k) => k + 1);
    toast({
      title: "Shared session loaded",
      description: "The demo has been restored from the shared link.",
    });
  }, [pendingShare, toast]);

  const handleDiscardShared = useCallback(() => {
    clearShareParams();
    setPendingShare(null);
  }, []);

  return (
    <article
      className="rounded-xl border border-border/50 bg-card overflow-hidden"
      aria-labelledby={`demo-${projectId}-title`}
    >
      <header className="flex flex-col gap-2 border-b border-border/40 p-5 sm:p-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {eyebrow && (
            <span className="text-xs font-mono uppercase tracking-[0.2em] text-accent">
              {eyebrow}
            </span>
          )}
          <h3
            id={`demo-${projectId}-title`}
            className="mt-1 text-xl font-semibold text-foreground"
          >
            {title}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {persisted && demoSlug && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 rounded-full border-border/50 px-3 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
              onClick={handleCopyShareLink}
              aria-label={`Copy share link for ${title}`}
            >
              {copied ? (
                <Check className="h-3 w-3" aria-hidden="true" />
              ) : (
                <Share2 className="h-3 w-3" aria-hidden="true" />
              )}
              {copied ? "Copied" : "Share link"}
            </Button>
          )}
          {persisted && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/40 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground"
              title="Your progress in this demo is saved to your browser only — nothing is sent to a server."
            >
              <Save className="h-3 w-3" aria-hidden="true" />
              Auto-saved locally
            </span>
          )}
          <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.2em] text-accent">
            Live · in-browser
          </span>
        </div>
      </header>

      <div className="p-5 sm:p-6 space-y-4">
        {pendingShare && (
          <ShareImportBanner
            shared={pendingShare}
            hasLocal={hasLocal}
            onLoad={handleLoadShared}
            onDiscard={handleDiscardShared}
          />
        )}
        <DemoErrorBoundary
          key={reloadKey}
          demoTitle={title}
          onReset={() => setReloadKey((k) => k + 1)}
        >
          <Suspense fallback={<DemoFallback title={title} />}>{children}</Suspense>
        </DemoErrorBoundary>
      </div>

      <footer className="flex flex-col gap-3 border-t border-border/40 bg-muted/30 p-5 sm:p-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-mono uppercase tracking-wider text-xs text-accent mr-2">
            What this proves
          </span>
          {proves}
        </p>
        {project && (
          <Link
            href={`/portfolio/${project.id}`}
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-accent transition-colors"
            aria-label={`Read more about ${project.title}`}
            onClick={() => {
              if (demoSlug) {
                trackDemoEvent(demoSlug, "project_link_clicked");
              }
            }}
          >
            <span>{project.title}</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </footer>
    </article>
  );
}
