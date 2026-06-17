"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export function Toast({ message, type = "info" }: { message: string; type?: "info" | "success" | "error" }) {
  const [visible, setVisible] = useState(!!message);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(t);
  }, [message]);

  if (!visible || !message) return null;

  return (
    <div
      className={cn(
        "fixed bottom-5 right-5 z-[100] rounded-lg px-4 py-3 text-sm shadow-lg animate-fade-in",
        type === "success" && "bg-emerald-700 text-white",
        type === "error" && "bg-rose-700 text-white",
        type === "info" && "bg-[#1f2937] text-white"
      )}
    >
      {message}
    </div>
  );
}
