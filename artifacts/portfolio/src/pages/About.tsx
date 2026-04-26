import React, { useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Target, Users, Lightbulb, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { timeline } from "@workspace/site-data";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: i * 0.1, ease: "easeOut" as const },
  }),
};

const principles = [
  {
    icon: Target,
    title: "Business-Aligned Technology",
    description: "Every technology decision is anchored in business strategy. I translate executive goals into secure, efficient, and scalable IT roadmaps.",
  },
  {
    icon: Users,
    title: "People & Team Leadership",
    description: "From building departments from scratch to proposing C-level roles, I invest in organizational capability that sustains itself beyond any single project.",
  },
  {
    icon: Lightbulb,
    title: "Governance-First Approach",
    description: "Standard policies, compliance frameworks, and structured processes are not overhead — they are the foundation that makes velocity sustainable.",
  },
  {
    icon: TrendingUp,
    title: "Entrepreneurial Mindset",
    description: "Co-founding a business and running independent consulting sharpened my ability to make decisions under uncertainty and deliver value with limited resources.",
  },
];

export function About() {
  useEffect(() => {
    document.title = "About — John Michael L. Libao | Strategic Technology Leader";
  }, []);

  return (
    <div>
      <section className="py-20 bg-card border-b border-border/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div custom={0} initial="hidden" animate="visible" variants={fadeUp}>
            <span className="text-xs font-mono uppercase tracking-[0.3em] text-accent">About</span>
          </motion.div>
          <motion.h1
            custom={1}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="text-5xl sm:text-6xl font-bold text-foreground mt-3 mb-6 leading-tight"
          >
            The Technology Leader
            <br />
            <span className="text-muted-foreground font-light">Behind the Programs</span>
          </motion.h1>
          <motion.p
            custom={2}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="text-lg text-muted-foreground max-w-2xl leading-relaxed"
          >
            10+ years at the intersection of enterprise technology, program management, and organizational transformation across retail, fintech, BPO, enterprise security, consulting, and entrepreneurship.
          </motion.p>
        </div>
      </section>

      <section className="py-20 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
            >
              <h2 className="text-3xl font-bold text-foreground mb-6 leading-tight">
                From Engineering to Executive Leadership
              </h2>
              <div className="space-y-5 text-muted-foreground leading-relaxed">
                <p>
                  My career began in partnerships and community development at Gawad Kalinga, before moving into technical project management at Main Hardware — delivering security infrastructure for Banko Sentral ng Pilipinas, JP Morgan, and Emerson. Those early years taught me that the gap between a great technology plan and a successful program is about people, governance, and process.
                </p>
                <p>
                  I spent nearly nine years at VXI Global Solutions, progressing from MIS Analyst to Senior Software Engineer to Senior DevOps Engineer. I built enterprise tools used globally, pioneered their Manila DevOps team, and led cloud migrations to AWS. That progression gave me both the technical depth and the leadership experience to take on bigger challenges.
                </p>
                <p>
                  I then led the technical engineering department at Ventaja International (PAYREMIT) — managing a team of 17, proposing a CIO role, and building infrastructure from scratch. Alongside that, I co-founded a water distribution business and ran independent IT consulting, sharpening my entrepreneurial instincts.
                </p>
                <p>
                  Most recently, I served as IT Manager at Chris Sports driving ERP and digital transformation, consulted as Solutions Architect at Lee Designs, and now lead IT Digital Transformation and the ERP program at GTO Trading Corporation. Throughout this journey, I've built deep infrastructure competencies — Active Directory setup, domain server configuration, application integration, desktop workstation provisioning, network configurations, and database architecture and management. My experience spans enterprise technology, DevOps, ERP, security systems, and entrepreneurship — always with a focus on delivering measurable outcomes.
                </p>
              </div>
            </motion.div>

            <div className="space-y-6">
              {principles.map((p, i) => (
                <motion.div
                  key={p.title}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  className="flex gap-5 p-5 rounded-lg border border-border/40 bg-card hover:border-accent/30 transition-colors"
                >
                  <div className="w-10 h-10 rounded-md bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                    <p.icon className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground mb-1">{p.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{p.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-card/50 border-y border-border/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="mb-14"
          >
            <h2 className="text-sm font-mono uppercase tracking-[0.3em] text-accent mb-3">Professional Experience</h2>
            <p className="text-4xl font-bold text-foreground">The Journey</p>
          </motion.div>

          <div className="relative">
            <div className="absolute left-0 top-0 bottom-0 w-px bg-border/40 ml-[7px] hidden md:block" />
            <div className="space-y-10">
              {timeline.map((item, i) => (
                <motion.div
                  key={i}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  className="md:pl-10 relative"
                >
                  <div className="absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full bg-accent/80 hidden md:block ring-4 ring-background" />
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 md:gap-8">
                    <div className="md:col-span-1">
                      <span className="text-xs font-mono text-accent tracking-wider">{item.period}</span>
                    </div>
                    <div className="md:col-span-3">
                      <h3 className="text-lg font-bold text-foreground">{item.role}</h3>
                      <p className="text-sm text-accent/80 mb-2 font-medium">{item.context}</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
          >
            <h2 className="text-3xl font-bold text-foreground mb-4">Ready to see the work?</h2>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              Browse the full project portfolio or get in touch to discuss your next transformation initiative.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/portfolio">
                <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold px-8 h-12 group">
                  View Portfolio
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
              <Link href="/contact">
                <Button variant="outline" size="lg" className="border-border/60 hover:border-accent/50 hover:text-accent px-8 h-12">
                  Get in Touch
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
