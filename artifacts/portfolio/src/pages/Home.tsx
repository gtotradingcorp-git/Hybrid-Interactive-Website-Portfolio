import React, { useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, ChevronDown, Server, Cloud, Shield, Layers, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/MetricCard";
import { ProjectCard } from "@/components/ui/ProjectCard";
import { getFeaturedProjects } from "@workspace/site-data";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.1, ease: "easeOut" as const },
  }),
};

const metrics = [
  { value: "10+", label: "Years of Experience" },
  { value: "17+", label: "Team Members Led" },
  { value: "20+", label: "Programs & Apps Delivered" },
  { value: "Sodexo, LLC. Emerson Electric Asia Ltd. & JP Morgan & Chase Co.", label: "Enterprise Clients" },
  { value: "On-premises & Cloud", label: "Platform Expertise" },
  { value: "End-to-End", label: "Engineering to C-Suite" },
];

const expertiseAreas = [
  {
    icon: Server,
    title: "ERP & Digital Transformation",
    description: "End-to-end ERP implementation and optimization (Odoo, SAP). Translating business goals into scalable IT roadmaps for digital transformation.",
  },
  {
    icon: Code2,
    title: "DevOps & Technical Engineering",
    description: "Infrastructure buildout, containerization (Docker), CI/CD pipelines (Jenkins, GitLab), and software development governance.",
  },
  {
    icon: Cloud,
    title: "Cloud & Infrastructure",
    description: "Cloud migration (AWS, Digital Ocean), Active Directory & domain server setup, desktop workstation provisioning, network configurations, and database architecture.",
  },
  {
    icon: Layers,
    title: "Systems Integration & Architecture",
    description: "Solution architecture, database and DR frameworks, VLAN/firewall configurations, and enterprise-scale security system integrations.",
  },
  {
    icon: Shield,
    title: "IT Governance & Compliance",
    description: "IT/Security compliance standards, Data Privacy Act, policy development, vendor management, and executive-level reporting to C-suite stakeholders.",
  },
];

export function Home() {
  useEffect(() => {
    document.title = "John Michael L. Libao — Head IT Digital Transformation & Program Director";
  }, []);

  const featuredProjects = getFeaturedProjects();

  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative min-h-[92vh] flex items-center overflow-hidden bg-background">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-accent/5 pointer-events-none" />
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-5 pointer-events-none">
          <div className="absolute top-16 right-24 w-72 h-72 border border-accent/40 rotate-12 rounded-sm" />
          <div className="absolute top-32 right-12 w-48 h-48 border border-primary/30 -rotate-6 rounded-sm" />
          <div className="absolute bottom-24 right-32 w-96 h-96 border border-accent/20 rotate-3 rounded-sm" />
        </div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-24 relative z-10">
          <div className="max-w-4xl">
            <motion.div
              custom={0}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
            >
              <span className="inline-block text-xs font-mono uppercase tracking-[0.3em] text-accent mb-6 border border-accent/30 px-3 py-1.5 rounded-sm">
                Head IT Digital Transformation &amp; Program Director
              </span>
            </motion.div>

            <motion.h1
              custom={1}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-foreground leading-[1.05] mb-6"
            >
              John Michael L. Libao
            </motion.h1>

            <motion.p
              custom={2}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="text-xl sm:text-2xl text-muted-foreground leading-relaxed max-w-2xl mb-4"
            >
              Digital Transformation. ERP Programs. DevOps Engineering. Solution Architecture.
            </motion.p>

            <motion.p
              custom={3}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="text-base text-muted-foreground/80 leading-relaxed max-w-xl mb-10"
            >
              10+ years spearheading large-scale digital transformation and infrastructure initiatives across retail, fintech, BPO, enterprise security, and consulting. From ERP programs and cloud infrastructure to CI/CD pipelines and security operations centers for BSP and JP Morgan. Strategy that ships. Transformation that sticks.
            </motion.p>

            <motion.div
              custom={4}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="flex flex-col sm:flex-row gap-4"
            >
              <Link href="/match">
                <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold px-8 h-12 group">
                  Score a Role Against My Profile
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
              <Link href="/portfolio">
                <Button variant="outline" size="lg" className="border-border/60 hover:border-accent/50 hover:text-accent px-8 h-12">
                  View Portfolio
                </Button>
              </Link>
              <Link href="/contact">
                <Button variant="ghost" size="lg" className="hover:text-accent px-6 h-12">
                  Get in Touch
                </Button>
              </Link>
            </motion.div>
          </div>
        </div>

        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" as const }}
        >
          <ChevronDown className="h-5 w-5 text-muted-foreground/40" />
        </motion.div>
      </section>

      {/* Impact Metrics */}
      <section className="py-20 bg-card border-y border-border/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="text-center mb-14"
          >
            <h2 className="text-sm font-mono uppercase tracking-[0.3em] text-accent mb-3">Career at a Glance</h2>
            <p className="text-3xl font-bold text-foreground">Proven Track Record</p>
          </motion.div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {metrics.map((m, i) => (
              <MetricCard key={m.label} value={m.value} label={m.label} delay={i * 0.08} />
            ))}
          </div>
        </div>
      </section>

      {/* Expertise Areas */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="max-w-2xl mb-16"
          >
            <h2 className="text-sm font-mono uppercase tracking-[0.3em] text-accent mb-3">Core Capabilities</h2>
            <p className="text-4xl font-bold text-foreground leading-tight">
              Where Technology Meets Strategic Execution
            </p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {expertiseAreas.map((area, i) => (
              <motion.div
                key={area.title}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="group p-6 rounded-lg border border-border/40 bg-card hover:border-accent/40 hover:bg-card/80 transition-all duration-300"
              >
                <div className="w-10 h-10 rounded-md bg-accent/10 flex items-center justify-center mb-4 group-hover:bg-accent/20 transition-colors">
                  <area.icon className="h-5 w-5 text-accent" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">{area.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{area.description}</p>
              </motion.div>
            ))}
          </div>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="mt-10 text-center"
          >
            <Link href="/capabilities">
              <Button variant="outline" className="border-border/50 hover:border-accent/50 hover:text-accent">
                Explore All Capabilities
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Featured Projects */}
      <section className="py-24 bg-card/50 border-y border-border/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="flex flex-col sm:flex-row sm:items-end justify-between mb-14 gap-6"
          >
            <div>
              <h2 className="text-sm font-mono uppercase tracking-[0.3em] text-accent mb-3">Featured Work</h2>
              <p className="text-4xl font-bold text-foreground">Key Programs</p>
              <p className="text-muted-foreground mt-2">Selected high-impact transformation initiatives across industries.</p>
            </div>
            <Link href="/portfolio">
              <Button variant="ghost" className="text-accent hover:text-accent/80 -mr-2 shrink-0">
                All Projects
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredProjects.map((project, i) => (
              <motion.div
                key={project.id}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
              >
                <ProjectCard project={project} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="max-w-3xl mx-auto text-center"
          >
            <h2 className="text-sm font-mono uppercase tracking-[0.3em] text-accent mb-4">Ready to Transform</h2>
            <p className="text-4xl sm:text-5xl font-bold text-foreground leading-tight mb-6">
              Let's Build Something That Lasts
            </p>
            <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto leading-relaxed">
              Whether you need a digital transformation leader, an ERP program director, a DevOps partner, or a strategic IT advisor — let's talk.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/contact">
                <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold px-10 h-12 group">
                  Start a Conversation
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
              <Link href="/about">
                <Button variant="outline" size="lg" className="border-border/60 hover:border-accent/50 hover:text-accent px-10 h-12">
                  Read the Story
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
