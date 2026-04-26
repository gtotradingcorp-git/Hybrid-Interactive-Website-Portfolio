import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import type { MatchResult } from "./matchEngine";
import { profileMeta } from "@workspace/site-data";

// Branded one-page PDF brief generated entirely server-side. Uses pdf-lib
// (pure JS, esbuild-friendly) with the standard Helvetica family — no font
// binaries to bundle. Layout is constrained to a single Letter page so the
// recruiter can email it as-is to a hiring panel.

const PAGE_W = 612; // Letter, points
const PAGE_H = 792;
const MARGIN = 48;
const ACCENT = rgb(0.83, 0.69, 0.22); // #d4af37 (the site's accent gold)
const INK = rgb(0.07, 0.07, 0.07);
const MUTED = rgb(0.4, 0.4, 0.4);
const SOFT = rgb(0.78, 0.78, 0.78);
const STRENGTH = rgb(0.13, 0.55, 0.34);
const PARTIAL = rgb(0.7, 0.5, 0.05);
const GAP = rgb(0.7, 0.18, 0.18);

interface DrawContext {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      // Hard-break very long single words so we never blow out the page width.
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
  const lines = wrapText(text, font, size, maxWidth);
  const truncated = lines.length > maxLines ? lines.slice(0, maxLines) : lines;
  if (lines.length > maxLines && truncated.length > 0) {
    truncated[truncated.length - 1] = truncated[truncated.length - 1].replace(/\s+\S+$/, "") + "…";
  }
  for (const line of truncated) {
    ctx.page.drawText(line, { x: MARGIN, y: ctx.y, size, font, color });
    ctx.y -= size * 1.25;
  }
}

function drawDivider(ctx: DrawContext): void {
  ctx.y -= 4;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_W - MARGIN, y: ctx.y },
    thickness: 0.5,
    color: SOFT,
  });
  ctx.y -= 12;
}

function statusColor(status: "strength" | "partial" | "gap") {
  if (status === "strength") return STRENGTH;
  if (status === "partial") return PARTIAL;
  return GAP;
}

export async function renderMatchPdf(
  result: MatchResult,
  meta: { matchId: number; siteUrl: string | null },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Hiring Brief — ${result.roleTitle}`);
  doc.setAuthor(profileMeta.name);
  doc.setSubject(`Match brief for ${result.recruiterCompany ?? "the hiring panel"}`);
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
  page.drawText("HIRING-FIT BRIEF", {
    x: MARGIN,
    y: ctx.y,
    size: 9,
    font: bold,
    color: ACCENT,
  });
  ctx.y -= 18;

  // Candidate name
  page.drawText(profileMeta.name, {
    x: MARGIN,
    y: ctx.y,
    size: 22,
    font: bold,
    color: INK,
  });
  ctx.y -= 22;
  page.drawText(profileMeta.title, {
    x: MARGIN,
    y: ctx.y,
    size: 11,
    font,
    color: MUTED,
  });
  ctx.y -= 22;

  // Role + company
  const audience = result.recruiterCompany
    ? `For ${result.recruiterCompany} — ${result.roleTitle}`
    : `Role: ${result.roleTitle}`;
  drawWrapped(ctx, audience, 12, bold, INK, 2);

  // Score badge
  ctx.y -= 6;
  const badgeW = 130;
  const badgeH = 44;
  const badgeX = PAGE_W - MARGIN - badgeW;
  const badgeY = ctx.y - badgeH + 12;
  page.drawRectangle({
    x: badgeX,
    y: badgeY,
    width: badgeW,
    height: badgeH,
    color: rgb(0.96, 0.96, 0.94),
    borderColor: ACCENT,
    borderWidth: 1,
  });
  page.drawText("FIT SCORE", {
    x: badgeX + 12,
    y: badgeY + badgeH - 14,
    size: 8,
    font: bold,
    color: MUTED,
  });
  page.drawText(`${result.fitScore}/100`, {
    x: badgeX + 12,
    y: badgeY + 8,
    size: 22,
    font: bold,
    color: INK,
  });

  drawDivider(ctx);

  // Executive summary
  page.drawText("EXECUTIVE SUMMARY", {
    x: MARGIN,
    y: ctx.y,
    size: 9,
    font: bold,
    color: ACCENT,
  });
  ctx.y -= 14;
  drawWrapped(ctx, result.summary, 10, font, INK, 6);
  drawDivider(ctx);

  // Top proof points
  page.drawText("TOP PROOF POINTS", {
    x: MARGIN,
    y: ctx.y,
    size: 9,
    font: bold,
    color: ACCENT,
  });
  ctx.y -= 14;
  for (const proof of result.topProofPoints.slice(0, 3)) {
    page.drawText(`• ${proof.title}`, {
      x: MARGIN,
      y: ctx.y,
      size: 10,
      font: bold,
      color: INK,
    });
    ctx.y -= 13;
    drawWrapped(ctx, proof.reason, 9, font, MUTED, 2);
    ctx.y -= 4;
  }
  drawDivider(ctx);

  // Requirements matrix
  page.drawText("REQUIREMENTS MATRIX", {
    x: MARGIN,
    y: ctx.y,
    size: 9,
    font: bold,
    color: ACCENT,
  });
  ctx.y -= 14;

  // Show as many requirements as fit on the page (footer reserved at 70pt).
  const footerReserved = MARGIN + 56;
  for (const req of result.requirements) {
    if (ctx.y < footerReserved + 40) break;
    const label = req.status.toUpperCase();
    const labelWidth = bold.widthOfTextAtSize(label, 8) + 12;
    page.drawRectangle({
      x: MARGIN,
      y: ctx.y - 2,
      width: labelWidth,
      height: 11,
      color: statusColor(req.status),
      opacity: 0.15,
      borderOpacity: 0,
    });
    page.drawText(label, {
      x: MARGIN + 6,
      y: ctx.y,
      size: 8,
      font: bold,
      color: statusColor(req.status),
    });
    page.drawText(req.requirement, {
      x: MARGIN + labelWidth + 8,
      y: ctx.y,
      size: 9.5,
      font: bold,
      color: INK,
      maxWidth: PAGE_W - 2 * MARGIN - labelWidth - 8,
    });
    ctx.y -= 13;
    drawWrapped(ctx, req.evidence, 9, font, MUTED, 2);
    ctx.y -= 6;
  }

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
    const live = `Live brief: ${meta.siteUrl}/match/${meta.matchId}`;
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
