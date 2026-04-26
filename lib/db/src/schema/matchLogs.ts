import {
  pgTable,
  serial,
  timestamp,
  varchar,
  integer,
  index,
  text,
  jsonb,
  real,
} from "drizzle-orm/pg-core";

// Recruiter Mode JD-match log. Stores the structured match result for
// re-rendering (PDF brief, share recipients) without persisting raw JD
// text. Only the JD's length and SHA-256 hash are kept for analytics and
// dedup; the full JD never lands on disk. Recruiter email is stored as a
// domain only (e.g. "gmail.com") for company-level analytics — the local
// part (which is PII) is dropped before insertion.
export const matchLogsTable = pgTable(
  "match_logs",
  {
    id: serial("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    roleTitle: varchar("role_title", { length: 200 }),
    recruiterCompany: varchar("recruiter_company", { length: 200 }),
    recruiterEmailDomain: varchar("recruiter_email_domain", { length: 120 }),
    fitScore: integer("fit_score").notNull().default(0),
    summary: text("summary"),
    requirementsJson: jsonb("requirements_json").notNull(),
    jdLength: integer("jd_length").notNull().default(0),
    jdHash: varchar("jd_hash", { length: 64 }),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    shareCount: integer("share_count").notNull().default(0),
    estimatedCostUsd: real("estimated_cost_usd").notNull().default(0),
  },
  (table) => ({
    createdAtIdx: index("match_logs_created_at_idx").on(table.createdAt),
  }),
);

export type MatchLog = typeof matchLogsTable.$inferSelect;
export type InsertMatchLog = typeof matchLogsTable.$inferInsert;
