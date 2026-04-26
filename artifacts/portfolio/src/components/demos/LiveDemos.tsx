import React, { lazy } from "react";
import { motion } from "framer-motion";
import { DemoFrame } from "./DemoFrame";

const TicketingDemo = lazy(() => import("./TicketingDemo"));
const ErpDemo = lazy(() => import("./ErpDemo"));
const BiDashboardDemo = lazy(() => import("./BiDashboardDemo"));

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: i * 0.08, ease: "easeOut" as const },
  }),
};

export function LiveDemos() {
  return (
    <section
      id="live-demos"
      className="py-16 bg-background border-b border-border/50"
      aria-labelledby="live-demos-heading"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          custom={0}
          className="mb-10"
        >
          <span className="text-xs font-mono uppercase tracking-[0.3em] text-accent">
            Live Demos
          </span>
          <h2
            id="live-demos-heading"
            className="text-3xl sm:text-4xl font-bold text-foreground mt-3 leading-tight"
          >
            Try the work, not just the words
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl leading-relaxed">
            Three sandboxed mini-apps based on systems I built in production. Everything runs in your browser on local seed data — no accounts, no backend, no risk.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            custom={1}
          >
            <DemoFrame
              eyebrow="Demo 01"
              title="Mini Ticketing System"
              proves="Centralized service-desk workflow with SLA timers, prioritization, and CSV export — the same shape as the in-house IT ticketing app I built at GTO."
              projectId="ticketing-system"
              demoSlug="ticketing"
            >
              <TicketingDemo />
            </DemoFrame>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            custom={2}
          >
            <DemoFrame
              eyebrow="Demo 02"
              title="Mini ERP — Inventory & Invoicing"
              proves="Inventory management, stock adjustments, and invoice generation with VAT and PDF export — the core pattern behind the Juan-ERP and Odoo migration work."
              projectId="in-house-erp-system"
              demoSlug="erp"
            >
              <ErpDemo />
            </DemoFrame>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            custom={3}
          >
            <DemoFrame
              eyebrow="Demo 03"
              title="Live BI Dashboard"
              proves="Multi-chart operations dashboard with KPIs, trend, ageing, top categories, and CSV export — the executive reporting pattern I deliver in Power BI and the in-house Stafftime Report for leadership teams."
              projectId="stafftime-report"
              demoSlug="bi"
            >
              <BiDashboardDemo />
            </DemoFrame>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
