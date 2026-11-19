import type { ReactNode } from "react";
import { Button } from "./Button";

// Loading keeps the shape of the content it stands in for (DESIGN.md).
export function PageLoading() {
  return (
    <div role="status" aria-label="Memuat" className="grid gap-5 py-16 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-56 animate-pulse rounded-ui bg-wall" />
      ))}
    </div>
  );
}

export function PageMessage({ children, action }: { children: ReactNode; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex flex-col items-center gap-5 py-24 text-center">
      <p className="max-w-(--width-lead) text-lead text-graphite">{children}</p>
      {action && (
        <Button variant="secondary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
