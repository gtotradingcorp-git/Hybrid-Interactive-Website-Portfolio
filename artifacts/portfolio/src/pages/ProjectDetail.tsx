import React, { useEffect } from "react";
import { Link, useParams } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Calendar, Tag, Building2, Briefcase, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { capabilityAreas, capabilitySlug, getProjectById, projects } from "@workspace/site-data";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.1, ease: "easeOut" as const },
  }),
};

export function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const project = getProjectById(params.id);

  useEffect(() => {
    if (project) {
      document.title = `${project.title} — John Michael L. Libao Portfolio`;
    } else {
      document.title = "Project Not Found — John Michael L. Libao";
    }
  }, [project]);

  if (!project) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-3xl font-bold text-foreground mb-4">Project Not Found</h1>
        <p className="text-muted-foreground mb-8">The project you're looking for doesn't exist.</p>
        <Link href="/portfolio">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Portfolio
          </Button>
        </Link>
      </div>
    );
  }

  const relatedCapabilities = capabilityAreas.filter((cap) =>
    cap.relatedProjectIds.includes(project.id),
  );

  const currentIndex = projects.findIndex((p) => p.id === project.id);
  const prevProject = currentIndex > 0 ? projects[currentIndex - 1] : null;
  const nextProject = currentIndex < projects.length - 1 ? projects[currentIndex + 1] : null;

  return (
    <div>
      {/* Header */}
      <section className="py-16 bg-card border-b border-border/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div custom={0} initial="hidden" animate="visible" variants={fadeUp}>
            <Link href="/portfolio" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-accent transition-colors mb-8 group">
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
              Back to Portfolio
            </Link>
          </motion.div>

          <div className="flex flex-wrap items-center gap-3 mb-4">
            {project.categories.map((cat, i) => (
              <motion.div key={cat} custom={1 + i * 0.1} initial="hidden" animate="visible" variants={fadeUp}>
                <Badge variant="secondary" className="bg-accent/10 text-accent border-accent/20 font-mono text-xs uppercase tracking-wider">
                  <Tag className="h-3 w-3 mr-1.5" />
                  {cat}
                </Badge>
              </motion.div>
            ))}
            <motion.div custom={2} initial="hidden" animate="visible" variants={fadeUp}>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                <Calendar className="h-3 w-3" />
                {project.year}
              </span>
            </motion.div>
          </div>

          <motion.h1
            custom={3}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="text-4xl sm:text-5xl font-bold text-foreground leading-tight max-w-3xl"
          >
            {project.title}
          </motion.h1>

          <motion.div
            custom={4}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="flex flex-wrap items-center gap-4 mt-4 text-sm text-muted-foreground"
          >
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              {project.company}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5" />
              {project.role}
            </span>
          </motion.div>

          <motion.p
            custom={5}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="text-lg text-muted-foreground mt-4 max-w-2xl leading-relaxed"
          >
            {project.shortDescription}
          </motion.p>
        </div>
      </section>

      {/* Impact Metrics Bar */}
      <section className="py-10 bg-accent/5 border-b border-border/40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 divide-y sm:divide-y-0 sm:divide-x divide-border/30">
            {project.metrics.map((metric, i) => (
              <motion.div
                key={metric.label}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="text-center py-2 sm:py-0"
              >
                <div className="text-3xl font-bold text-accent tracking-tighter mb-1">{metric.value}</div>
                <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{metric.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
              <div className="lg:col-span-2 space-y-12">
                <motion.div
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                >
                  <h2 className="text-xs font-mono uppercase tracking-[0.3em] text-accent mb-4">The Challenge</h2>
                  <h3 className="text-2xl font-bold text-foreground mb-4">Problem Statement</h3>
                  <div className="prose prose-sm max-w-none">
                    <p className="text-muted-foreground leading-relaxed text-base">{project.problem}</p>
                  </div>
                </motion.div>

                <motion.div
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                >
                  <h2 className="text-xs font-mono uppercase tracking-[0.3em] text-accent mb-4">The Approach</h2>
                  <h3 className="text-2xl font-bold text-foreground mb-4">Solution &amp; Execution</h3>
                  <div className="prose prose-sm max-w-none">
                    <p className="text-muted-foreground leading-relaxed text-base">{project.solution}</p>
                  </div>
                </motion.div>
              </div>

              {/* Sidebar */}
              <div className="space-y-8">
                <motion.div
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  className="p-6 rounded-lg border border-border/50 bg-card"
                >
                  <h3 className="text-xs font-mono uppercase tracking-[0.3em] text-accent mb-4">Technology Stack</h3>
                  <div className="flex flex-wrap gap-2">
                    {project.techStack.map((tech) => (
                      <span
                        key={tech}
                        className="inline-flex items-center rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border/50"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </motion.div>

                <motion.div
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  className="p-6 rounded-lg border border-border/50 bg-card"
                >
                  <h3 className="text-xs font-mono uppercase tracking-[0.3em] text-accent mb-4">Project Details</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Company</span>
                      <span className="text-foreground font-medium text-right max-w-[60%]">{project.company}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Role</span>
                      <span className="text-foreground font-medium text-right max-w-[60%]">{project.role}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Category</span>
                      <span className="text-foreground font-medium text-right max-w-[60%]">{project.categories.join(" / ")}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Year</span>
                      <span className="text-foreground font-medium">{project.year}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Technologies</span>
                      <span className="text-foreground font-medium">{project.techStack.length} platforms</span>
                    </div>
                  </div>
                </motion.div>

                {relatedCapabilities.length > 0 && (
                  <motion.div
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    variants={fadeUp}
                    className="p-6 rounded-lg border border-border/50 bg-card"
                  >
                    <h3 className="text-xs font-mono uppercase tracking-[0.3em] text-accent mb-4 flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5" />
                      Demonstrates Capabilities
                    </h3>
                    <ul className="space-y-2">
                      {relatedCapabilities.map((cap) => (
                        <li key={cap.title}>
                          <Link
                            href={`/capabilities#${capabilitySlug(cap.title)}`}
                            className="group flex items-start gap-2 rounded-md px-2 -mx-2 py-1.5 hover:bg-accent/5 transition-colors"
                          >
                            <ArrowRight className="h-3.5 w-3.5 text-accent shrink-0 mt-1 transition-transform group-hover:translate-x-0.5" />
                            <span className="text-sm text-foreground group-hover:text-accent">
                              {cap.title}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}

                <motion.div
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                >
                  <Link href="/contact">
                    <Button className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-semibold group">
                      Discuss a Similar Program
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </Button>
                  </Link>
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Project Navigation */}
      <section className="py-12 border-t border-border/50 bg-card/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center gap-4">
            {prevProject ? (
              <Link href={`/portfolio/${prevProject.id}`} className="group flex items-center gap-3 text-left hover:text-accent transition-colors">
                <ArrowLeft className="h-5 w-5 text-muted-foreground group-hover:text-accent transition-colors shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1">Previous</div>
                  <div className="text-sm font-semibold text-foreground group-hover:text-accent transition-colors line-clamp-1">{prevProject.title}</div>
                </div>
              </Link>
            ) : <div />}

            {nextProject ? (
              <Link href={`/portfolio/${nextProject.id}`} className="group flex items-center gap-3 text-right hover:text-accent transition-colors ml-auto">
                <div>
                  <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1">Next</div>
                  <div className="text-sm font-semibold text-foreground group-hover:text-accent transition-colors line-clamp-1">{nextProject.title}</div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-accent transition-colors shrink-0" />
              </Link>
            ) : <div />}
          </div>
        </div>
      </section>
    </div>
  );
}
