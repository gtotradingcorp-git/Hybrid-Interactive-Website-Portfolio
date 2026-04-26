import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  Send,
  Sparkles,
  ExternalLink,
  RotateCcw,
  Globe,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RequirementMatch {
  requirement: string;
  status: "strength" | "partial" | "gap";
  evidence: string;
  projectIds: string[];
  capabilityAreas: string[];
}

interface MatchResult {
  fitScore: number;
  summary: string;
  roleTitle: string;
  recruiterCompany: string | null;
  requirements: RequirementMatch[];
  topProofPoints: Array<{ projectId: string; title: string; reason: string }>;
}

const MIN_JD = 80;
const MAX_JD = 20_000;

function statusMeta(status: RequirementMatch["status"]) {
  if (status === "strength") {
    return {
      label: "Strength",
      icon: CheckCircle2,
      ring: "border-emerald-500/40",
      pill: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
      iconColor: "text-emerald-500",
    };
  }
  if (status === "partial") {
    return {
      label: "Partial",
      icon: AlertTriangle,
      ring: "border-amber-500/40",
      pill: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
      iconColor: "text-amber-500",
    };
  }
  return {
    label: "Gap",
    icon: XCircle,
    ring: "border-red-500/40",
    pill: "bg-red-500/15 text-red-700 dark:text-red-400",
    iconColor: "text-red-500",
  };
}

function scoreColor(score: number): string {
  if (score >= 85) return "text-emerald-500";
  if (score >= 70) return "text-emerald-400";
  if (score >= 50) return "text-amber-500";
  return "text-red-500";
}

const apiBase = (() => {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return `${base}/../api`;
})();

export function Match() {
  const params = useParams<{ id?: string }>();
  const presetId = params?.id ? Number(params.id) : null;

  const [jdText, setJdText] = useState<string>("");
  const [recruiterEmail, setRecruiterEmail] = useState<string>("");
  const [recruiterCompany, setRecruiterCompany] = useState<string>("");
  const [matchId, setMatchId] = useState<number | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jdUrl, setJdUrl] = useState<string>("");
  const [fetchingUrl, setFetchingUrl] = useState(false);

  // Share-to-panel state
  const [shareRecipients, setShareRecipients] = useState<string>("");
  const [shareNote, setShareNote] = useState<string>("");
  const [senderName, setSenderName] = useState<string>("");
  const [senderEmail, setSenderEmail] = useState<string>("");
  const [shareStatus, setShareStatus] = useState<
    | { kind: "idle" }
    | { kind: "sending" }
    | { kind: "sent"; recipients: string[] }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  useEffect(() => {
    document.title = "Recruiter Mode — John Michael L. Libao";
  }, []);

  // Pre-fill from query string (chat intent integration: ?jd=…&company=…)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const qJd = sp.get("jd");
    const qCompany = sp.get("company");
    if (qJd) setJdText(qJd.slice(0, MAX_JD));
    if (qCompany) setRecruiterCompany(qCompany.slice(0, 200));
  }, []);

  // If we landed on /match/:id, load the persisted result.
  useEffect(() => {
    if (!presetId || !Number.isFinite(presetId)) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${apiBase}/match/${presetId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `Could not load match (${res.status})`);
        }
        return res.json() as Promise<{ id: number; result: MatchResult }>;
      })
      .then((d) => {
        if (cancelled) return;
        setMatchId(d.id);
        setResult(d.result);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [presetId]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = jdText.trim();
      if (trimmed.length < MIN_JD) {
        setError(`Please paste a job description (at least ${MIN_JD} characters).`);
        return;
      }
      setLoading(true);
      setError(null);
      setResult(null);
      setMatchId(null);
      setShareStatus({ kind: "idle" });
      try {
        const res = await fetch(`${apiBase}/match`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jdText: trimmed,
            recruiterEmail: recruiterEmail.trim() || undefined,
            recruiterCompany: recruiterCompany.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `Request failed (${res.status})`);
        }
        const d = (await res.json()) as { id: number; result: MatchResult };
        setMatchId(d.id);
        setResult(d.result);
        // Pre-fill the sender block in the share panel from the recruiter form
        // so they only have to type the panel addresses.
        if (recruiterEmail) setSenderEmail(recruiterEmail);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [jdText, recruiterEmail, recruiterCompany],
  );

  const handleShare = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!matchId) return;
      const recipients = shareRecipients
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (recipients.length === 0) {
        setShareStatus({
          kind: "error",
          message: "Add at least one panel email (comma- or space-separated).",
        });
        return;
      }
      setShareStatus({ kind: "sending" });
      try {
        const res = await fetch(`${apiBase}/match/${matchId}/share`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipients,
            senderEmail: senderEmail.trim() || undefined,
            senderName: senderName.trim() || undefined,
            note: shareNote.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `Share failed (${res.status})`);
        }
        const d = (await res.json()) as { recipients: string[] };
        setShareStatus({ kind: "sent", recipients: d.recipients });
        setShareRecipients("");
        setShareNote("");
      } catch (err) {
        setShareStatus({ kind: "error", message: (err as Error).message });
      }
    },
    [matchId, shareRecipients, shareNote, senderEmail, senderName],
  );

  const reset = () => {
    setResult(null);
    setMatchId(null);
    setShareStatus({ kind: "idle" });
    setError(null);
  };

  const fetchFromUrl = useCallback(async () => {
    const url = jdUrl.trim();
    if (!url) return;
    setFetchingUrl(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/match/fetch-jd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Fetch failed (${res.status})`);
      }
      const d = (await res.json()) as { text: string };
      setJdText(d.text.slice(0, MAX_JD));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFetchingUrl(false);
    }
  }, [jdUrl]);

  const charsRemaining = MAX_JD - jdText.length;

  const groupedReqs = useMemo(() => {
    if (!result) return null;
    const strengths = result.requirements.filter((r) => r.status === "strength");
    const partial = result.requirements.filter((r) => r.status === "partial");
    const gaps = result.requirements.filter((r) => r.status === "gap");
    return { strengths, partial, gaps };
  }, [result]);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-10">
        <span className="inline-block text-xs font-mono uppercase tracking-[0.3em] text-accent mb-3 border border-accent/30 px-3 py-1.5 rounded-sm">
          Recruiter Mode
        </span>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-3">
          Paste a JD or drop in a URL. Fit brief in seconds.
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl">
          Drop in the role description (text or a link to the posting) and Recruiter Mode maps it against
          John's 21 projects and 5 executive engagements — fit score, evidence per requirement,
          downloadable one-pager, and a one-click share to your hiring panel.
        </p>
      </div>

      {!result && (
        <Card>
          <CardHeader>
            <CardTitle>Job description</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-5">
              <div className="flex items-end gap-2 mb-2">
                <div className="flex-1">
                  <Label htmlFor="jd-url">
                    <Globe className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                    Or fetch from a job-posting URL
                  </Label>
                  <Input
                    id="jd-url"
                    type="url"
                    value={jdUrl}
                    onChange={(e) => setJdUrl(e.target.value)}
                    placeholder="https://linkedin.com/jobs/view/…"
                    disabled={fetchingUrl || loading}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  disabled={!jdUrl.trim() || fetchingUrl || loading}
                  onClick={() => void fetchFromUrl()}
                  className="shrink-0 h-9"
                >
                  {fetchingUrl ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Fetching…
                    </>
                  ) : (
                    "Fetch"
                  )}
                </Button>
              </div>

              <div>
                <Label htmlFor="jd" className="sr-only">
                  Job description
                </Label>
                <textarea
                  id="jd"
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value.slice(0, MAX_JD))}
                  placeholder="Paste the full job description here, or use the URL field above to fetch it. Include role title, must-haves, and key responsibilities for the most accurate fit score."
                  rows={12}
                  className="w-full resize-y rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60"
                  required
                />
                <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                  <span>
                    {jdText.length < MIN_JD
                      ? `Need at least ${MIN_JD - jdText.length} more characters.`
                      : "Looks good. Add the recruiter details below if you'd like a personalised brief."}
                  </span>
                  <span>{charsRemaining.toLocaleString()} left</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="company">Hiring company (optional)</Label>
                  <Input
                    id="company"
                    value={recruiterCompany}
                    onChange={(e) => setRecruiterCompany(e.target.value)}
                    placeholder="e.g. Globe Telecom"
                    maxLength={200}
                  />
                </div>
                <div>
                  <Label htmlFor="recruiter-email">Your email (optional)</Label>
                  <Input
                    id="recruiter-email"
                    type="email"
                    value={recruiterEmail}
                    onChange={(e) => setRecruiterEmail(e.target.value)}
                    placeholder="recruiter@company.com"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Only the domain is logged for analytics. Used to pre-fill the share form.
                  </p>
                </div>
              </div>

              {error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  type="submit"
                  size="lg"
                  disabled={loading || jdText.trim().length < MIN_JD}
                  className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold px-8 h-12 group"
                >
                  {loading ? (
                    "Analysing…"
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate fit brief
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground self-center">
                  Typically takes 5–15 seconds. We never store the JD itself — only its length and
                  a one-way hash.
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {result && groupedReqs && (
        <ResultPanel
          result={result}
          groupedReqs={groupedReqs}
          matchId={matchId}
          onReset={reset}
          shareForm={{
            recipients: shareRecipients,
            setRecipients: setShareRecipients,
            note: shareNote,
            setNote: setShareNote,
            senderName,
            setSenderName,
            senderEmail,
            setSenderEmail,
            status: shareStatus,
            handle: handleShare,
          }}
        />
      )}
    </div>
  );
}

interface ShareFormProps {
  recipients: string;
  setRecipients: (s: string) => void;
  note: string;
  setNote: (s: string) => void;
  senderName: string;
  setSenderName: (s: string) => void;
  senderEmail: string;
  setSenderEmail: (s: string) => void;
  status:
    | { kind: "idle" }
    | { kind: "sending" }
    | { kind: "sent"; recipients: string[] }
    | { kind: "error"; message: string };
  handle: (e: React.FormEvent) => void;
}

function ResultPanel({
  result,
  groupedReqs,
  matchId,
  onReset,
  shareForm,
}: {
  result: MatchResult;
  groupedReqs: { strengths: RequirementMatch[]; partial: RequirementMatch[]; gaps: RequirementMatch[] };
  matchId: number | null;
  onReset: () => void;
  shareForm: ShareFormProps;
}) {
  const pdfHref = matchId ? `${apiBase}/match/${matchId}/pdf` : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Header card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono uppercase tracking-[0.3em] text-accent mb-2">
                Fit brief
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
                {result.roleTitle}
              </h2>
              {result.recruiterCompany && (
                <p className="text-sm text-muted-foreground mt-1">
                  for {result.recruiterCompany}
                </p>
              )}
              <p className="text-foreground/90 mt-4 leading-relaxed">{result.summary}</p>
            </div>
            <div className="shrink-0 self-stretch md:self-start">
              <div className="rounded-lg border border-accent/40 bg-accent/5 px-6 py-4 text-center min-w-[160px]">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                  Fit score
                </p>
                <p className={`text-5xl font-bold tabular-nums ${scoreColor(result.fitScore)}`}>
                  {result.fitScore}
                </p>
                <p className="text-xs text-muted-foreground">out of 100</p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {pdfHref && (
              <a href={pdfHref} target="_blank" rel="noopener noreferrer">
                <Button variant="default" className="bg-accent hover:bg-accent/90 text-accent-foreground">
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF brief
                </Button>
              </a>
            )}
            <Button variant="outline" onClick={onReset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Score another role
            </Button>
            <Link href="/contact">
              <Button variant="outline">
                Reach John directly
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Top proof points */}
      {result.topProofPoints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top proof points</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {result.topProofPoints.slice(0, 3).map((p) => (
                <Link
                  key={p.projectId}
                  href={`/portfolio/${p.projectId}`}
                  className="group rounded-md border border-border/50 hover:border-accent/50 p-4 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-foreground group-hover:text-accent transition-colors text-sm leading-snug">
                      {p.title}
                    </h3>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.reason}</p>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Requirements matrix */}
      <Card>
        <CardHeader>
          <CardTitle>Requirements matrix</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {groupedReqs.strengths.length} strength
            {groupedReqs.strengths.length === 1 ? "" : "s"}, {groupedReqs.partial.length} partial,{" "}
            {groupedReqs.gaps.length} gap{groupedReqs.gaps.length === 1 ? "" : "s"} across{" "}
            {result.requirements.length} extracted requirement
            {result.requirements.length === 1 ? "" : "s"}.
          </p>
          <RequirementGroup title="Strengths" items={groupedReqs.strengths} />
          <RequirementGroup title="Partial matches" items={groupedReqs.partial} />
          <RequirementGroup title="Gaps" items={groupedReqs.gaps} />
        </CardContent>
      </Card>

      {/* Share to panel */}
      <Card>
        <CardHeader>
          <CardTitle>Send this brief to your hiring panel</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Sends the brief plus a link to the live result. John is automatically CC'd so he knows
            the role is live with your panel.
          </p>
          <form onSubmit={shareForm.handle} className="space-y-4">
            <div>
              <Label htmlFor="recipients">Panel emails</Label>
              <Input
                id="recipients"
                value={shareForm.recipients}
                onChange={(e) => shareForm.setRecipients(e.target.value)}
                placeholder="hiring-manager@company.com, head-of-eng@company.com"
                disabled={shareForm.status.kind === "sending"}
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Up to 5 addresses, comma- or space-separated.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="sender-name">Your name (optional)</Label>
                <Input
                  id="sender-name"
                  value={shareForm.senderName}
                  onChange={(e) => shareForm.setSenderName(e.target.value)}
                  disabled={shareForm.status.kind === "sending"}
                />
              </div>
              <div>
                <Label htmlFor="sender-email">Your email (optional, used for replies)</Label>
                <Input
                  id="sender-email"
                  type="email"
                  value={shareForm.senderEmail}
                  onChange={(e) => shareForm.setSenderEmail(e.target.value)}
                  disabled={shareForm.status.kind === "sending"}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="note">Note for the panel (optional)</Label>
              <textarea
                id="note"
                value={shareForm.note}
                onChange={(e) => shareForm.setNote(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="Quick context — e.g. 'Strong fit for the Director role we discussed Tuesday.'"
                className="w-full resize-y rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60"
                disabled={shareForm.status.kind === "sending"}
                maxLength={500}
              />
            </div>

            {shareForm.status.kind === "error" && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {shareForm.status.message}
              </p>
            )}
            {shareForm.status.kind === "sent" && (
              <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
                Sent to {shareForm.status.recipients.join(", ")}. John has been CC'd.
              </p>
            )}

            <Button
              type="submit"
              disabled={shareForm.status.kind === "sending" || !matchId}
              className="bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              {shareForm.status.kind === "sending" ? (
                "Sending…"
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send to panel
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function RequirementGroup({ title, items }: { title: string; items: RequirementMatch[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">
        {title} ({items.length})
      </h3>
      <div className="space-y-3">
        {items.map((req, i) => {
          const meta = statusMeta(req.status);
          const Icon = meta.icon;
          return (
            <div
              key={`${req.requirement}-${i}`}
              className={`rounded-lg border ${meta.ring} bg-card/40 p-4`}
            >
              <div className="flex items-start gap-3">
                <Icon className={`h-5 w-5 ${meta.iconColor} shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <p className="font-semibold text-foreground leading-snug">{req.requirement}</p>
                    <span
                      className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${meta.pill}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{req.evidence}</p>
                  {(req.projectIds.length > 0 || req.capabilityAreas.length > 0) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      {req.projectIds.map((id) => (
                        <Link
                          key={id}
                          href={`/portfolio/${id}`}
                          className="inline-flex items-center gap-1 rounded border border-border/60 bg-background/60 px-2 py-0.5 text-muted-foreground hover:text-accent hover:border-accent/50 transition-colors"
                        >
                          {id}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ))}
                      {req.capabilityAreas.map((ca) => (
                        <span
                          key={ca}
                          className="inline-block rounded border border-border/40 px-2 py-0.5 text-muted-foreground"
                        >
                          {ca}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Match;
