import {
  pgTable,
  serial,
  timestamp,
  varchar,
  integer,
  index,
  text,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";

// One row per chat-initiated action (book_meeting, send_brief, alert_john,
// share_with_panel). Logged for the admin "Chat Actions" panel so John can
// see exactly what AI OPHNM has been doing on his behalf, and so failed
// sends are auditable without checking server logs.
//
// Privacy: senderEmail / recipients are stored because the recruiter
// explicitly typed them into a confirmation card and the action they
// triggered emails those addresses. No other PII is stored.
export const chatActionsTable = pgTable(
  "chat_actions",
  {
    id: serial("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // book_meeting | send_brief | alert_john | share_with_panel
    action: varchar("action", { length: 32 }).notNull(),
    // sent | failed | rate_limited | rejected
    status: varchar("status", { length: 16 }).notNull(),
    senderEmail: varchar("sender_email", { length: 200 }),
    senderName: varchar("sender_name", { length: 200 }),
    senderCompany: varchar("sender_company", { length: 200 }),
    // Comma-joined recipient list (e.g. panel members). Truncated for storage.
    recipients: varchar("recipients", { length: 1000 }),
    // Free-form summary of what was done (e.g. "Booked 2026-05-02 14:00 UTC").
    summary: text("summary"),
    // Snippet of recent chat for context (truncated, no PII besides what
    // was already in the conversation transcript).
    transcriptSnippet: text("transcript_snippet"),
    errorMessage: text("error_message"),
    // Hash of client IP — handy for rate-limit forensics without storing IPs.
    ipHash: varchar("ip_hash", { length: 64 }),
  },
  (table) => ({
    createdAtIdx: index("chat_actions_created_at_idx").on(table.createdAt),
    actionIdx: index("chat_actions_action_idx").on(table.action),
  }),
);

export type ChatAction = typeof chatActionsTable.$inferSelect;
export type InsertChatAction = typeof chatActionsTable.$inferInsert;

// Hot-lead record created when a recruiter triggers `alert_john`. Surfaced
// on the admin dashboard so John can prioritise replies.
export const hotLeadsTable = pgTable(
  "hot_leads",
  {
    id: serial("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    senderEmail: varchar("sender_email", { length: 200 }).notNull(),
    senderCompany: varchar("sender_company", { length: 200 }),
    role: varchar("role", { length: 200 }),
    note: text("note"),
    transcriptSnippet: text("transcript_snippet"),
    // Whether the email to John was delivered. False rows are still useful
    // because the lead's intent was captured even if the email failed.
    notified: boolean("notified").notNull().default(false),
    notifyError: text("notify_error"),
    // Linked chat_actions row for traceability.
    chatActionId: integer("chat_action_id"),
  },
  (table) => ({
    createdAtIdx: index("hot_leads_created_at_idx").on(table.createdAt),
  }),
);

export type HotLead = typeof hotLeadsTable.$inferSelect;
export type InsertHotLead = typeof hotLeadsTable.$inferInsert;
