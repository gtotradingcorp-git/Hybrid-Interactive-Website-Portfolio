import React from "react";
import { Link } from "wouter";
import { Linkedin, Mail, Twitter } from "lucide-react";
import {
  isDemoTrackingOptedOut,
  setDemoTrackingOptOut,
  onOptOutChange,
} from "@/lib/demoTelemetry";

function TrackingToggle() {
  const [optedOut, setOptedOut] = React.useState(isDemoTrackingOptedOut);

  React.useEffect(() => onOptOutChange(setOptedOut), []);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={!optedOut}
      onClick={() => setDemoTrackingOptOut(!optedOut)}
      className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <span
        className={
          "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors " +
          (optedOut ? "bg-muted-foreground/30" : "bg-accent")
        }
      >
        <span
          className={
            "inline-block h-3 w-3 rounded-full bg-white shadow transition-transform " +
            (optedOut ? "translate-x-0.5" : "translate-x-3.5")
          }
        />
      </span>
      {optedOut ? "Demo interaction tracking off" : "Demo interaction tracking on"}
    </button>
  );
}

export function Footer() {
  return (
    <footer className="border-t bg-card text-card-foreground">
      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="md:col-span-2">
            <span className="text-xl font-bold tracking-tight">John Michael L. Libao</span>
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              Head IT Digital Transformation & Program Director. 10+ years spearheading digital transformation, ERP programs, DevOps, and infrastructure initiatives across diverse industries.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">Navigation</h3>
            <ul className="mt-4 space-y-2">
              <li><Link href="/about" className="text-sm text-muted-foreground hover:text-accent transition-colors">About</Link></li>
              <li><Link href="/portfolio" className="text-sm text-muted-foreground hover:text-accent transition-colors">Portfolio</Link></li>
              <li><Link href="/capabilities" className="text-sm text-muted-foreground hover:text-accent transition-colors">Capabilities</Link></li>
              <li><Link href="/contact" className="text-sm text-muted-foreground hover:text-accent transition-colors">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">Connect</h3>
            <div className="mt-4 flex space-x-4">
              <a href="https://linkedin.com/in/jlibao14" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-accent transition-colors">
                <span className="sr-only">LinkedIn</span>
                <Linkedin className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-accent transition-colors">
                <span className="sr-only">Twitter</span>
                <Twitter className="h-5 w-5" />
              </a>
              <a href="mailto:cs_info@agentmail.to" className="text-muted-foreground hover:text-accent transition-colors">
                <span className="sr-only">Email</span>
                <Mail className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>
        <div className="mt-12 border-t pt-8 flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground text-center">
            &copy; {new Date().getFullYear()} John Michael L. Libao. All rights reserved.
          </p>
          <TrackingToggle />
        </div>
      </div>
    </footer>
  );
}
