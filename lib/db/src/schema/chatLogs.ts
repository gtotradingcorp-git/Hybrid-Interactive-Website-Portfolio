import { pgTable, serial, timestamp, varchar, integer, index, text } from "drizzle-orm/pg-core";

export const chatLogsTable = pgTable(
  "chat_logs",
  {
    id: serial("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    topic: varchar("topic", { length: 32 }).notNull(),
    model: varchar("model", { length: 64 }).notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    // Latest user question for this chat turn. Stored so John can spot-check
    // the topic classifier in the admin dashboard. Truncated server-side to
    // keep rows small. No visitor identity (IP, session) is stored alongside.
    question: text("question"),
  },
  (table) => ({
    createdAtIdx: index("chat_logs_created_at_idx").on(table.createdAt),
    topicIdx: index("chat_logs_topic_idx").on(table.topic),
  }),
);

export type ChatLog = typeof chatLogsTable.$inferSelect;
export type InsertChatLog = typeof chatLogsTable.$inferInsert;
