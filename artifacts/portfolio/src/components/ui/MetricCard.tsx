import React from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";

interface MetricCardProps {
  value: string;
  label: string;
  delay?: number;
}

export function MetricCard({ value, label, delay = 0 }: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
    >
      <Card className="bg-card border-border/50 text-center py-6 px-4">
        <CardContent className="p-0">
          <motion.div 
            className="text-4xl font-bold text-accent mb-2 tracking-tighter"
            initial={{ scale: 0.5, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 100, delay: delay + 0.2 }}
          >
            {value}
          </motion.div>
          <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
