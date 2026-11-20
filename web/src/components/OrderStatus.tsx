import type { OrderStatus as Status } from "../api/orders";
import { StatusLabel, type StatusTone } from "./StatusLabel";

const LOOK: Record<Status, { tone: StatusTone; label: string; filled?: boolean }> = {
  PENDING: { tone: "ochre", label: "Menunggu bayar" },
  PAID: { tone: "inkblue", label: "Lunas" },
  CANCELLED: { tone: "quiet", label: "Dibatalkan" },
  EXPIRED: { tone: "oxblood", label: "Kedaluwarsa" },
  REFUND_REQUIRED: { tone: "oxblood", label: "Perlu refund", filled: true },
};

// Organizer dashboard chips: a tinted pill with a coloured dot, the label in dark text.
const TINT: Record<Status, { bg: string; dot: string; text: string }> = {
  PENDING: { bg: "bg-clay", dot: "bg-ochre", text: "text-ink" },
  PAID: { bg: "bg-sage-wash", dot: "bg-sage", text: "text-ink" },
  CANCELLED: { bg: "bg-mist", dot: "bg-slate", text: "text-ink" },
  EXPIRED: { bg: "bg-oxblood-wash", dot: "bg-oxblood", text: "text-oxblood" },
  REFUND_REQUIRED: { bg: "bg-oxblood", dot: "bg-canvas", text: "text-canvas" },
};

// expired: a PENDING order past expires_at reads as expired before the sweeper runs.
export function OrderStatus({ status, expired = false, tinted = false }: { status: Status; expired?: boolean; tinted?: boolean }) {
  const shown: Status = status === "PENDING" && expired ? "EXPIRED" : status;
  const look = LOOK[shown];
  if (tinted) {
    const t = TINT[shown];
    return (
      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-caption font-bold ${t.bg} ${t.text}`}>
        <span aria-hidden="true" className={`size-2 rounded-full ${t.dot}`} />
        {look.label}
      </span>
    );
  }
  return (
    <StatusLabel tone={look.tone} filled={look.filled}>
      {look.label}
    </StatusLabel>
  );
}
