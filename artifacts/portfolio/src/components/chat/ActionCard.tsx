import React, { useState } from "react";
import { CheckCircle2, XCircle, Calendar, FileText, Bell, Users, Download } from "lucide-react";

export type ChatToolName =
  | "book_meeting"
  | "send_brief"
  | "alert_john"
  | "share_with_panel";

export interface ActionRequest {
  tool: ChatToolName;
  arguments: Record<string, unknown>;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  downloadUrl?: string;
}

const META: Record<
  ChatToolName,
  { label: string; icon: React.ComponentType<{ className?: string }>; verb: string }
> = {
  book_meeting: { label: "Book a meeting with John", icon: Calendar, verb: "Book meeting" },
  send_brief: { label: "Send a tailored brief", icon: FileText, verb: "Send brief" },
  alert_john: { label: "Alert John directly", icon: Bell, verb: "Alert John" },
  share_with_panel: {
    label: "Share with hiring panel",
    icon: Users,
    verb: "Send to panel",
  },
};

interface FieldDef {
  key: string;
  label: string;
  type?: "text" | "email" | "textarea" | "emails";
  required?: boolean;
  placeholder?: string;
}

const FIELDS: Record<ChatToolName, FieldDef[]> = {
  book_meeting: [
    { key: "name", label: "Your name", required: true },
    { key: "email", label: "Your email", type: "email", required: true },
    { key: "company", label: "Company", required: true },
    { key: "proposedTime", label: "Proposed time", required: true, placeholder: "Tue May 5, 2026, 2pm UTC" },
    { key: "topic", label: "Topic", required: true },
  ],
  send_brief: [
    { key: "email", label: "Your email", type: "email", required: true },
    { key: "name", label: "Your name (optional)" },
    { key: "company", label: "Company (optional)" },
    { key: "roleFocus", label: "Role focus", required: true },
    { key: "timeline", label: "Hiring timeline", required: true },
  ],
  alert_john: [
    { key: "email", label: "Your email", type: "email", required: true },
    { key: "company", label: "Company", required: true },
    { key: "role", label: "Role you're hiring for", required: true },
    { key: "note", label: "Note (optional)", type: "textarea" },
  ],
  share_with_panel: [
    {
      key: "panelEmails",
      label: "Panel emails (1–3, comma-separated)",
      type: "emails",
      required: true,
    },
    { key: "senderEmail", label: "Your email", type: "email", required: true },
    { key: "senderName", label: "Your name (optional)" },
    { key: "roleFocus", label: "Role focus", required: true },
    { key: "note", label: "Note (optional)", type: "textarea" },
  ],
};

function coerceInitial(tool: ChatToolName, args: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of FIELDS[tool]) {
    const v = args[f.key];
    if (f.type === "emails") {
      out[f.key] = Array.isArray(v) ? v.map((s) => String(s)).join(", ") : typeof v === "string" ? v : "";
    } else {
      out[f.key] = typeof v === "string" ? v : v == null ? "" : String(v);
    }
  }
  return out;
}

export interface ActionCardProps {
  request: ActionRequest;
  apiBase: string;
  transcriptSnippet: string;
  onResolved: (result: ActionResult & { confirmed: boolean }) => void;
}

export function ActionCard({ request, apiBase, transcriptSnippet, onResolved }: ActionCardProps) {
  const meta = META[request.tool];
  const fields = FIELDS[request.tool];
  const [values, setValues] = useState<Record<string, string>>(() =>
    coerceInitial(request.tool, request.arguments),
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<(ActionResult & { confirmed: boolean }) | null>(null);

  if (result) {
    return (
      <div
        className={`rounded-lg border px-3 py-2.5 text-xs space-y-2 max-w-[90%] ${
          result.ok
            ? "border-accent/40 bg-accent/5 text-foreground"
            : "border-destructive/40 bg-destructive/10 text-destructive"
        }`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-2">
          {result.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />
          ) : (
            <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          )}
          <div className="leading-relaxed">{result.message}</div>
        </div>
        {result.ok && result.downloadUrl && (
          <a
            href={result.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-accent/50 bg-background/60 px-2.5 py-1 font-mono uppercase tracking-wider text-[10px] text-accent hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Download className="h-3 w-3" />
            Download brief
          </a>
        )}
      </div>
    );
  }

  const handleConfirm = async () => {
    if (submitting) return;
    for (const f of fields) {
      if (f.required && !values[f.key]?.trim()) return;
    }
    setSubmitting(true);
    let body: Record<string, unknown>;
    if (request.tool === "share_with_panel") {
      const emails = (values["panelEmails"] ?? "")
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      body = {
        arguments: {
          panelEmails: emails,
          senderEmail: values["senderEmail"],
          senderName: values["senderName"] || undefined,
          note: values["note"] || undefined,
          roleFocus: values["roleFocus"],
        },
        transcript: transcriptSnippet,
      };
    } else {
      const args: Record<string, string | undefined> = {};
      for (const f of fields) {
        const v = values[f.key]?.trim();
        if (v) args[f.key] = v;
      }
      body = { arguments: args, transcript: transcriptSnippet };
    }
    try {
      const res = await fetch(`${apiBase}/../api/chat/actions/${request.tool}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as ActionResult | null;
      const finalResult: ActionResult & { confirmed: boolean } = {
        ok: Boolean(data?.ok),
        message:
          data?.message ||
          (res.status === 429
            ? (data as unknown as { error?: string })?.error ||
              "Too many actions — please wait a moment."
            : "Something went wrong sending that action."),
        downloadUrl: data?.downloadUrl,
        confirmed: true,
      };
      setResult(finalResult);
      onResolved(finalResult);
    } catch {
      const finalResult = {
        ok: false,
        message: "We couldn't reach the server. Please try again.",
        confirmed: true,
      };
      setResult(finalResult);
      onResolved(finalResult);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    const cancelResult = {
      ok: false,
      message: "Cancelled — nothing was sent.",
      confirmed: false,
    };
    setResult(cancelResult);
    onResolved(cancelResult);
  };

  const Icon = meta.icon;
  return (
    <div className="rounded-lg border border-accent/40 bg-accent/5 px-3 py-2.5 text-xs text-foreground space-y-3 max-w-[95%]">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-accent shrink-0" />
        <div className="font-mono uppercase tracking-wider text-[10px] text-accent">
          {meta.label}
        </div>
      </div>
      <div className="space-y-2">
        {fields.map((f) => (
          <label key={f.key} className="block space-y-1">
            <span className="block text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              {f.label}
              {f.required ? " *" : ""}
            </span>
            {f.type === "textarea" ? (
              <textarea
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                disabled={submitting}
                rows={2}
                className="w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60 disabled:opacity-60"
                placeholder={f.placeholder}
              />
            ) : (
              <input
                type={f.type === "email" ? "email" : "text"}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                disabled={submitting}
                className="w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60 disabled:opacity-60"
                placeholder={f.placeholder}
              />
            )}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-md border border-accent/60 bg-accent text-accent-foreground px-3 py-1 font-mono uppercase tracking-wider text-[10px] hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Sending…" : meta.verb}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/80 px-3 py-1 font-mono uppercase tracking-wider text-[10px] text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground/80 leading-snug">
        Nothing is sent until you confirm. John is CC'd on every email.
      </p>
    </div>
  );
}
