import React from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Project } from "@workspace/site-data";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Card className="flex flex-col h-full overflow-hidden transition-all duration-300 hover:shadow-lg hover:border-accent/50 bg-card group">
      <CardHeader className="pb-4">
        <div className="flex justify-between items-start mb-2 gap-4">
          <div className="flex flex-wrap gap-1.5">
            {project.categories.map((cat) => (
              <Badge key={cat} variant="secondary" className="bg-secondary/50 text-accent hover:bg-secondary/80 font-mono text-xs">
                {cat}
              </Badge>
            ))}
          </div>
          <span className="text-xs text-muted-foreground font-mono shrink-0">{project.year}</span>
        </div>
        <CardTitle className="text-xl font-bold leading-tight group-hover:text-accent transition-colors">
          {project.title}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">{project.company} — {project.role}</p>
      </CardHeader>
      <CardContent className="flex-1 pb-4">
        <CardDescription className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
          {project.shortDescription}
        </CardDescription>
        
        <div className="mt-6 flex flex-wrap gap-2">
          {project.techStack.slice(0, 3).map((tech) => (
            <span key={tech} className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-muted-foreground/10">
              {tech}
            </span>
          ))}
          {project.techStack.length > 3 && (
            <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-muted-foreground/10">
              +{project.techStack.length - 3}
            </span>
          )}
        </div>
      </CardContent>
      <CardFooter className="pt-0 border-t border-border/50 bg-muted/20">
        <Link href={`/portfolio/${project.id}`} className="w-full pt-4 flex items-center justify-between text-sm font-semibold text-foreground group-hover:text-accent transition-colors">
          View Project Details
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </CardFooter>
    </Card>
  );
}
