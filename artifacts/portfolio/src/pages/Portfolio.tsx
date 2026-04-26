import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ProjectCard } from "@/components/ui/ProjectCard";
import { projects, categories } from "@workspace/site-data";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: "easeOut" as const },
  }),
};

export function Portfolio() {
  const [activeCategory, setActiveCategory] = useState("All");

  useEffect(() => {
    document.title = "Portfolio — John Michael L. Libao | Project Portfolio";
  }, []);

  const filtered = activeCategory === "All"
    ? projects
    : projects.filter((p) => p.categories.includes(activeCategory));

  return (
    <div>
      {/* Page Header */}
      <section className="py-20 bg-card border-b border-border/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div custom={0} initial="hidden" animate="visible" variants={fadeUp}>
            <span className="text-xs font-mono uppercase tracking-[0.3em] text-accent">Project Portfolio</span>
          </motion.div>
          <motion.h1
            custom={1}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="text-5xl sm:text-6xl font-bold text-foreground mt-3 mb-4 leading-tight"
          >
            Programs &amp; Projects
          </motion.h1>
          <motion.p
            custom={2}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="text-lg text-muted-foreground max-w-2xl leading-relaxed"
          >
            A comprehensive portfolio of in-house software development, ERP implementations, cloud infrastructure, systems integration, and IT governance initiatives across retail, fintech, BPO, and enterprise security.
          </motion.p>
        </div>
      </section>

      {/* Filter + Grid */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Filter Pills */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="flex flex-wrap gap-2 mb-12"
          >
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
                  activeCategory === cat
                    ? "bg-accent text-accent-foreground border-accent"
                    : "border-border/50 text-muted-foreground hover:border-accent/40 hover:text-accent"
                }`}
              >
                {cat}
              </button>
            ))}
          </motion.div>

          {/* Grid */}
          <AnimatePresence mode="popLayout">
            <motion.div
              layout
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {filtered.map((project, i) => (
                <motion.div
                  key={project.id}
                  layout
                  custom={i}
                  initial="hidden"
                  animate="visible"
                  exit={{ opacity: 0, scale: 0.95 }}
                  variants={fadeUp}
                >
                  <ProjectCard project={project} />
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>

          {filtered.length === 0 && (
            <div className="text-center py-24 text-muted-foreground">
              No projects in this category yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
