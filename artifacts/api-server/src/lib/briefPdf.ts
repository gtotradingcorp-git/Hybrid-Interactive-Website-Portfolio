import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { profileMeta, projects, capabilityAreas, type Project } from "@workspace/site-data";

// Branded one-page PDF brief tailored to a recruiter's role focus and
// hiring timeline. Generated server-side from the same site data the chat
// assistant uses, so the brief stays in sync with the portfolio.
//
// We keep this in its own module rather than reusing matchPdf because the
// inputs are very different (no JD scoring; just a role-focus prompt and
// timeline) and a single file is easier to evolve without breaking the
// existing Recruiter-Mode brief.

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;
const ACCENT = rgb(0.83, 0.69, 0.22);
const INK = rgb(0.07, 0.07, 0.07);
const MUTED = rgb(0.4, 0.4, 0.4);
const SOFT = rgb(0.78, 0.78, 0.78);

interface DrawContext {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = "";
        for (const ch of word) {
          if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawWrapped(
  ctx: DrawContext,
  text: string,
  size: number,
  font: PDFFont,
  color = INK,
  maxLines = Infinity,
): void {
  const maxWidth = PAGE_W - 2 * MARGIN;
  const lines = wrap(text, font, size, maxWidth);
  const truncated = lines.length > maxLines ? lines.slice(0, maxLines) : lines;
  if (lines.length > maxLines && truncated.length > 0) {
    truncated[truncated.length - 1] = truncated[truncated.length - 1].replace(/\s+\S+$/, "") + "…";
  }
  for (const line of truncated) {
    ctx.page.drawText(line, { x: MARGIN, y: ctx.y, size, font, color });
    ctx.y -= size * 1.25;
  }
}

function divider(ctx: DrawContext): void {
  ctx.y -= 4;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_W - MARGIN, y: ctx.y },
    thickness: 0.5,
    color: SOFT,
  });
  ctx.y -= 12;
}

export interface BriefMeta {
  roleFocus: string;
  timeline: string;
  recruiterName?: string | null;
  recruiterCompany?: string | null;
  siteUrl?: string | null;
}

// Lightweight relevance scoring so the same word in the role focus surfaces
// the most relevant projects. Keyword-overlap is enough — we don't need a
// fresh LLM call here, the brief is meant to be branded and human-edited
// on receipt.
function pickTopProjects(roleFocus: string, n = 3): Project[] {
  const tokens = roleFocus
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((t) => t.length >= 3);
  const byYearDesc = (a: Project, b: Project): number =>
    String(b.year ?? "").localeCompare(String(a.year ?? ""));
  if (tokens.length === 0) {
    return [...projects].sort(byYearDesc).slice(0, n);
  }
  const scored = projects.map((p) => {
    const haystack = [
      p.title,
      p.shortDescription,
      p.role,
      ...(p.techStack ?? []),
      ...(p.categories ?? []),
    ]
      .join(" ")
      .toLowerCase();
    let score = 0;
    for (const t of tokens) if (haystack.includes(t)) score += 1;
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score || byYearDesc(a.p, b.p));
  if ((scored[0]?.score ?? 0) === 0) {
    return [...projects].sort(byYearDesc).slice(0, n);
  }
  return scored.slice(0, n).map((s) => s.p);
}

function pickCapability(roleFocus: string): string {
  const focus = roleFocus.toLowerCase();
  for (const cap of capabilityAreas) {
    const haystack = [cap.title, cap.headline, ...(cap.skills ?? [])].join(" ").toLowerCase();
    const overlap = focus
      .split(/[^a-z0-9+#.]+/)
      .filter((t) => t.length >= 3)
      .some((t) => haystack.includes(t));
    if (overlap) return cap.headline;
  }
  return capabilityAreas[0]?.headline ?? "";
}

export async function renderBriefPdf(meta: BriefMeta): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Brief — ${profileMeta.name} for ${meta.roleFocus.slice(0, 80)}`);
  doc.setAuthor(profileMeta.name);
  doc.setSubject(`One-pager prepared for ${meta.recruiterCompany ?? "the hiring team"}`);
  doc.setProducer("johnlibao.portfolio");
  doc.setCreator("johnlibao.portfolio");

  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: DrawContext = { page, font, bold, y: PAGE_H - MARGIN };

  // Accent header bar
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 6,
    width: PAGE_W,
    height: 6,
    color: ACCENT,
  });

  // Eyebrow
  page.drawText("TAILORED ONE-PAGER", {
    x: MARGIN,
    y: ctx.y,
    size: 9,
    font: bold,
    color: ACCENT,
  });
  ctx.y -= 18;

  // Name + headline
  page.drawText(profileMeta.name, {
    x: MARGIN,
    y: ctx.y,
    size: 22,
    font: bold,
    color: INK,
  });
  ctx.y -= 22;
  page.drawText(profileMeta.title, { x: MARGIN, y: ctx.y, size: 11, font, color: MUTED });
  ctx.y -= 22;

  // Audience line
  const audience = meta.recruiterCompany
    ? `Prepared for ${meta.recruiterCompany}${meta.recruiterName ? ` (${meta.recruiterName})` : ""}`
    : meta.recruiterName
      ? `Prepared for ${meta.recruiterName}`
      : "Prepared from a chat conversation on johnlibao.portfolio";
  drawWrapped(ctx, audience, 11, bold, INK, 2);
  ctx.y -= 4;
  drawWrapped(ctx, `Role focus: ${meta.roleFocus}`, 10, font, MUTED, 2);
  drawWrapped(ctx, `Hiring timeline: ${meta.timeline}`, 10, font, MUTED, 2);
  divider(ctx);

  // Why John
  page.drawText("WHY JOHN, FOR THIS ROLE", {
    x: MARGIN,
    y: ctx.y,
    size: 9,
    font: bold,
    color: ACCENT,
  });
  ctx.y -= 14;
  const whyLine = `${profileMeta.experienceYears} years across ${pickCapability(meta.roleFocus)}.`;
  drawWrapped(ctx, whyLine, 11, font, INK, 4);
  drawWrapped(
    ctx,
    `Open to: ${profileMeta.openTo}. Typical reply: ${profileMeta.responseTime}.`,
    10,
    font,
    MUTED,
    2,
  );
  divider(ctx);

  // Top proof points
  const proofs = pickTopProjects(meta.roleFocus, 3);
  page.drawText("TOP PROOF POINTS", {
    x: MARGIN,
    y: ctx.y,
    size: 9,
    font: bold,
    color: ACCENT,
  });
  ctx.y -= 14;
  for (const p of proofs) {
    const header = `• ${p.title}  ·  ${p.company} ${p.year}`;
    page.drawText(header, { x: MARGIN, y: ctx.y, size: 10, font: bold, color: INK });
    ctx.y -= 13;
    drawWrapped(ctx, p.role, 9, font, MUTED, 1);
    drawWrapped(ctx, p.shortDescription, 9, font, INK, 3);
    if (p.techStack && p.techStack.length > 0) {
      drawWrapped(ctx, `Stack: ${p.techStack.slice(0, 8).join(", ")}`, 8, font, MUTED, 1);
    }
    ctx.y -= 4;
  }
  divider(ctx);

  // Engagement next step
  page.drawText("NEXT STEP", { x: MARGIN, y: ctx.y, size: 9, font: bold, color: ACCENT });
  ctx.y -= 14;
  drawWrapped(
    ctx,
    `Reply to this email or reach John directly at ${profileMeta.email}. He typically responds within ${profileMeta.responseTime.toLowerCase()}. Mention the role and timeline (${meta.timeline}) for fastest scheduling.`,
    10,
    font,
    INK,
    5,
  );

  // Footer
  const footerY = MARGIN;
  page.drawLine({
    start: { x: MARGIN, y: footerY + 30 },
    end: { x: PAGE_W - MARGIN, y: footerY + 30 },
    thickness: 0.5,
    color: SOFT,
  });
  page.drawText(profileMeta.email, {
    x: MARGIN,
    y: footerY + 16,
    size: 9,
    font: bold,
    color: INK,
  });
  page.drawText(`linkedin: ${profileMeta.linkedin}  ·  ${profileMeta.location}`, {
    x: MARGIN,
    y: footerY + 4,
    size: 8,
    font,
    color: MUTED,
  });
  if (meta.siteUrl) {
    const live = `johnlibao.portfolio`;
    const w = font.widthOfTextAtSize(live, 8);
    page.drawText(live, {
      x: PAGE_W - MARGIN - w,
      y: footerY + 4,
      size: 8,
      font,
      color: MUTED,
    });
  }

  return doc.save();
}
