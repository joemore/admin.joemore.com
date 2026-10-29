"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }
  return (
    <span className="copy-control">
      <button
        type="button"
        className="icon-button"
        onClick={copy}
        aria-label={status === "copied" ? "Copied" : label}
        title={label}
      >
        {status === "copied" ? <Check size={14} /> : <Copy size={14} />}
      </button>
      <span className="sr-only" role="status">
        {status === "copied"
          ? "Copied to clipboard"
          : status === "failed"
            ? "Copy unavailable. Select the value to copy it manually."
            : ""}
      </span>
    </span>
  );
}
