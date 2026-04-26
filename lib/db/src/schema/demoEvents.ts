import { pgTable, serial, timestamp, varchar, index } from "drizzle-orm/pg-core";

// Privacy-respecting telemetry for the Live Capability Demos on the
// portfolio site. Each row is a single visitor interaction with one of the
// in-browser demos (ticketing / erp / bi). No visitor identity is stored:
// no IP, no session id, no user agent. Only the demo slug and the event
// name are kept so John can see which capability proofs visitors actually
// engage with.
export const demoEventsTable = pgTable(
  "demo_events",
  {
    id: serial("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Which demo emitted the event. Validated against an allow-list at the
    // route boundary so the column never holds free-form data.
    demo: varchar("demo", { length: 32 }).notNull(),
    // The interaction type (e.g. "first_interaction", "ticket_created",
    // "stock_adjusted", "range_changed", "export_clicked",
    // "project_link_clicked", "invoice_generated"). Also allow-listed.
    event: varchar("event", { length: 48 }).notNull(),
  },
  (table) => ({
    createdAtIdx: index("demo_events_created_at_idx").on(table.createdAt),
    demoIdx: index("demo_events_demo_idx").on(table.demo),
  }),
);

export type DemoEvent = typeof demoEventsTable.$inferSelect;
export type InsertDemoEvent = typeof demoEventsTable.$inferInsert;
