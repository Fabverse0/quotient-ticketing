import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
  busy?: boolean;
};

const base =
  "inline-flex h-(--size-button) items-center justify-center rounded-ui px-5 text-body " +
  "transition-colors duration-(--dur-fast) disabled:opacity-60";

const variants = {
  primary: "bg-ink font-bold text-canvas hover:bg-ink-deep active:bg-ink-deep",
  secondary: "border border-mist bg-transparent text-ink hover:bg-wash active:bg-mist",
};

// One primary button per screen (DESIGN.md).
export function Button({ variant = "primary", busy = false, className = "", children, disabled, ...rest }: Props) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
