import React, { useEffect } from "react";
import type { ElementType } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Server, Cloud, Code2, Network, Shield, Users, Database, Globe, GitBranch, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { capabilityAreas, capabilitySlug, coreCompetencies, getProjectById } from "@workspace/site-data";
import { LiveDemos } from "@/components/demos/LiveDemos";

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: i * 0.08, ease: "easeOut" as const },
  }),
};

const capabilityIcons: Record<string, ElementType> = {
  "ERP & Digital Transformation": Server,
  "DevOps & Release Engineering": GitBranch,
  "Software Engineering": Code2,
  "Data Management": Database,
  "Website & Application Development": Globe,
  "Cloud & Infrastructure": Cloud,
  "Systems Integration & Architecture": Network,
  "IT Governance, Security & Compliance": Shield,
  "Transformational Leadership": Users,
};

export function Capabilities() {
  useEffect(() => {
    document.title = "Capabilities — John Michael L. Libao | Digital Transformation, ERP, DevOps & IT Governance";
  }, []);

  return (
    <div>
      {/* Page Header */}
      <section className="py-20 bg-card border-b border-border/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div custom={0} initial="hidden" animate="visible" variants={fadeUp}>
            <span className="text-xs font-mono uppercase tracking-[0.3em] text-accent">Capabilities</span>
          </motion.div>
          <motion.h1
            custom={1}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="text-5xl sm:text-6xl font-bold text-foreground mt-3 mb-4 leading-tight"
          >
            What I Do &amp; How
            <br />
            <span className="text-muted-foreground font-light">I Deliver</span>
          </motion.h1>
          <motion.p
            custom={2}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="text-lg text-muted-foreground max-w-2xl leading-relaxed"
          >
            Deep expertise across interconnected domains of enterprise technology and people leadership — each informed by 10+ years of hands-on delivery across retail, fintech, BPO, enterprise security, and consulting.
          </motion.p>
        </div>
      </section>

      {/* Live Demos — sandboxed mini-apps proving capability claims */}
      <LiveDemos />

      {/* Capability Areas */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-20">
            {capabilityAreas.map((cap, i) => {
              const Icon = capabilityIcons[cap.title] ?? Server;
              return (
                <motion.div
                  key={cap.title}
                  id={capabilitySlug(cap.title)}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  custom={0}
                  className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start scroll-mt-24"
                >
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-md bg-accent/10 flex items-center justify-center">
                        <Icon className="h-5 w-5 text-accent" />
                      </div>
                      <span className="text-xs font-mono uppercase tracking-[0.2em] text-accent">{cap.title}</span>
                    </div>
                    <h2 className="text-3xl font-bold text-foreground mb-4 leading-tight">{cap.headline}</h2>
                    <p className="text-muted-foreground leading-relaxed mb-6">{cap.description}</p>

                    <div>
                      <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-3">Key Platforms</h4>
                      <div className="flex flex-wrap gap-2">
                        {cap.platforms.map((p) => (
                          <span
                            key={p}
                            className="inline-flex items-center rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border/50"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="lg:pl-8 space-y-6">
                    <div className="p-6 rounded-lg border border-border/40 bg-card">
                      <h4 className="text-xs font-mono uppercase tracking-[0.2em] text-accent mb-5">Core Skills</h4>
                      <ul className="space-y-3">
                        {cap.skills.map((skill) => (
                          <li key={skill} className="flex items-start gap-3">
                            <CheckCircle2 className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                            <span className="text-sm text-muted-foreground">{skill}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {(() => {
                      const related = (cap.relatedProjectIds ?? [])
                        .map((id) => getProjectById(id))
                        .filter((p): p is NonNullable<ReturnType<typeof getProjectById>> => Boolean(p));
                      if (related.length === 0) return null;
                      return (
                        <div className="p-6 rounded-lg border border-border/40 bg-card">
                          <h4 className="text-xs font-mono uppercase tracking-[0.2em] text-accent mb-5">Proof Points</h4>
                          <ul className="space-y-2">
                            {related.map((p) => (
                              <li key={p.id}>
                                <Link
                                  href={`/portfolio/${p.id}`}
                                  className="group flex items-start gap-3 rounded-md px-2 -mx-2 py-1.5 hover:bg-accent/5 transition-colors"
                                >
                                  <ArrowRight className="h-4 w-4 text-accent shrink-0 mt-1 transition-transform group-hover:translate-x-0.5" />
                                  <span className="text-sm text-foreground group-hover:text-accent">
                                    {p.title}
                                    <span className="text-muted-foreground"> — {p.company}, {p.year}</span>
                                  </span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })()}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Core Competencies */}
      <section className="py-16 bg-card/50 border-y border-border/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="mb-10"
          >
            <h2 className="text-sm font-mono uppercase tracking-[0.3em] text-accent mb-3">Core Competencies</h2>
            <p className="text-3xl font-bold text-foreground">Professional Expertise</p>
          </motion.div>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="flex flex-wrap gap-3"
          >
            {coreCompetencies.map((m) => (
              <span
                key={m}
                className="inline-flex items-center rounded-lg border border-accent/20 bg-accent/5 px-4 py-2 text-sm font-medium text-accent"
              >
                {m}
              </span>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
          >
            <h2 className="text-3xl font-bold text-foreground mb-4">Looking for a technology leader?</h2>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto leading-relaxed">
              Let's discuss how these capabilities apply to your organization's most important technology challenges.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/contact">
                <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold px-10 h-12 group">
                  Start a Conversation
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
              <Link href="/portfolio">
                <Button variant="outline" size="lg" className="border-border/60 hover:border-accent/50 hover:text-accent px-10 h-12">
                  View the Portfolio
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
