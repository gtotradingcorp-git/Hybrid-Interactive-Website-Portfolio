import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Mail, Linkedin, MapPin, Clock, Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: i * 0.1, ease: "easeOut" as const },
  }),
};

interface FormState {
  name: string;
  email: string;
  company: string;
  message: string;
}

export function Contact() {
  const [form, setForm] = useState<FormState>({ name: "", email: "", company: "", message: "" });
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Contact — John Michael L. Libao | Get in Touch";
  }, []);

  const validate = (): boolean => {
    const newErrors: Partial<FormState> = {};
    if (!form.name.trim()) newErrors.name = "Name is required.";
    if (!form.email.trim()) {
      newErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "Enter a valid email address.";
    }
    if (!form.message.trim()) newErrors.message = "Message is required.";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const apiBase = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${apiBase}/../api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          company: form.company,
          message: form.message,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to send message.");
      }

      setSubmitted(true);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormState]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  return (
    <div>
      {/* Page Header */}
      <section className="py-20 bg-card border-b border-border/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div custom={0} initial="hidden" animate="visible" variants={fadeUp}>
            <span className="text-xs font-mono uppercase tracking-[0.3em] text-accent">Contact</span>
          </motion.div>
          <motion.h1
            custom={1}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="text-5xl sm:text-6xl font-bold text-foreground mt-3 mb-4 leading-tight"
          >
            Let's Talk
          </motion.h1>
          <motion.p
            custom={2}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="text-lg text-muted-foreground max-w-xl leading-relaxed"
          >
            Whether you're exploring ERP implementation, DevOps transformation, cloud migration, or a digital transformation initiative — I'm open to conversations that matter.
          </motion.p>
        </div>
      </section>

      <section className="py-20 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 max-w-5xl mx-auto">
            {/* Contact Info */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="lg:col-span-2 space-y-8"
            >
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-2">Get in Touch</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  I welcome conversations with executives, program sponsors, and technology leaders working on digital transformation, ERP, DevOps, and infrastructure initiatives.
                </p>
              </div>

              <div className="space-y-5">
                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-md bg-accent/10 flex items-center justify-center shrink-0">
                    <Mail className="h-4 w-4 text-accent" />
                  </div>
                  <div>
                    <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">Email</div>
                    <a href="mailto:cs_info@agentmail.to" className="text-sm text-foreground hover:text-accent transition-colors">
                      cs_info@agentmail.to
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-md bg-accent/10 flex items-center justify-center shrink-0">
                    <Linkedin className="h-4 w-4 text-accent" />
                  </div>
                  <div>
                    <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">LinkedIn</div>
                    <a href="https://linkedin.com/in/jlibao14" target="_blank" rel="noopener noreferrer" className="text-sm text-foreground hover:text-accent transition-colors">
                      linkedin.com/in/jlibao14
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-md bg-accent/10 flex items-center justify-center shrink-0">
                    <MapPin className="h-4 w-4 text-accent" />
                  </div>
                  <div>
                    <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">Location</div>
                    <p className="text-sm text-foreground">Quezon City, Philippines</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-md bg-accent/10 flex items-center justify-center shrink-0">
                    <Clock className="h-4 w-4 text-accent" />
                  </div>
                  <div>
                    <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">Response Time</div>
                    <p className="text-sm text-foreground">Within 48 business hours</p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-border/40">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  For immediate inquiries related to ongoing program engagements, please reference your project name in the subject line.
                </p>
              </div>
            </motion.div>

            {/* Contact Form */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={1}
              className="lg:col-span-3"
            >
              {submitted ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-16 px-8 rounded-lg border border-accent/20 bg-accent/5">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                  >
                    <CheckCircle2 className="h-14 w-14 text-accent mb-5 mx-auto" />
                  </motion.div>
                  <h3 className="text-2xl font-bold text-foreground mb-3">Message Received</h3>
                  <p className="text-muted-foreground max-w-sm">
                    Thank you for reaching out. I'll review your message and respond within 48 business hours.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} noValidate className="space-y-6 p-8 rounded-lg border border-border/50 bg-card">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label htmlFor="name" className="block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
                        Full Name <span className="text-accent">*</span>
                      </label>
                      <input
                        id="name"
                        name="name"
                        type="text"
                        value={form.name}
                        onChange={handleChange}
                        placeholder="Jane Smith"
                        className={`w-full px-4 py-2.5 rounded-md text-sm bg-background border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent/40 transition-colors ${
                          errors.name ? "border-destructive" : "border-border/60 focus:border-accent/60"
                        }`}
                      />
                      {errors.name && <p className="mt-1.5 text-xs text-destructive">{errors.name}</p>}
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
                        Email Address <span className="text-accent">*</span>
                      </label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        value={form.email}
                        onChange={handleChange}
                        placeholder="jane@company.com"
                        className={`w-full px-4 py-2.5 rounded-md text-sm bg-background border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent/40 transition-colors ${
                          errors.email ? "border-destructive" : "border-border/60 focus:border-accent/60"
                        }`}
                      />
                      {errors.email && <p className="mt-1.5 text-xs text-destructive">{errors.email}</p>}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="company" className="block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
                      Company / Organization
                    </label>
                    <input
                      id="company"
                      name="company"
                      type="text"
                      value={form.company}
                      onChange={handleChange}
                      placeholder="Acme Corporation"
                      className="w-full px-4 py-2.5 rounded-md text-sm bg-background border border-border/60 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60 transition-colors"
                    />
                  </div>

                  <div>
                    <label htmlFor="message" className="block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
                      Message <span className="text-accent">*</span>
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      rows={6}
                      value={form.message}
                      onChange={handleChange}
                      placeholder="Briefly describe your initiative, the challenge you're facing, and what kind of engagement you have in mind..."
                      className={`w-full px-4 py-2.5 rounded-md text-sm bg-background border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent/40 transition-colors resize-none ${
                        errors.message ? "border-destructive" : "border-border/60 focus:border-accent/60"
                      }`}
                    />
                    {errors.message && <p className="mt-1.5 text-xs text-destructive">{errors.message}</p>}
                  </div>

                  {submitError && (
                    <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3">
                      {submitError}
                    </p>
                  )}

                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    size="lg"
                    className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-semibold h-12 group disabled:opacity-60"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Sending...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        Send Message
                        <Send className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    )}
                  </Button>
                </form>
              )}
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
}
