import { useState } from "react";
import { History, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

function timeAgo(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

interface RestoredBannerProps {
  restoredAt: number | null;
  onStartFresh: () => void;
}

export function RestoredBanner({ restoredAt, onStartFresh }: RestoredBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (!restoredAt || dismissed) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-accent/20 bg-accent/5 px-3.5 py-2.5 text-sm text-muted-foreground"
    >
      <History className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
      <span>
        Restored from your last visit{" "}
        <span className="font-medium text-foreground/80">{timeAgo(restoredAt)}</span>
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 gap-1 px-2 text-xs text-accent hover:text-accent"
        onClick={() => {
          onStartFresh();
          setDismissed(true);
        }}
      >
        <RotateCcw className="h-3 w-3" aria-hidden="true" />
        Start fresh
      </Button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="ml-auto rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground"
        aria-label="Dismiss restored notice"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
