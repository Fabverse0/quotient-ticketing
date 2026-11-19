import type { OrderStatus as Status } from "../api/orders";
import { StatusLabel, type StatusTone } from "./StatusLabel";

const LOOK: Record<Status, { tone: StatusTone; label: string; filled?: boolean }> = {
  PENDING: { tone: "ochre", label: "Menunggu bayar" },
  PAID: { tone: "inkblue", label: "Lunas" },
  CANCELLED: { tone: "quiet", label: "Dibatalkan" },
  EXPIRED: { tone: "oxblood", label: "Kedaluwarsa" },
  REFUND_REQUIRED: { tone: "oxblood", label: "Perlu refund", filled: true },
};

// expired: a PENDING order past expires_at reads as expired before the sweeper runs.
export function OrderStatus({ status, expired = false }: { status: Status; expired?: boolean }) {
  const look = status === "PENDING" && expired ? LOOK.EXPIRED : LOOK[status];
  return (
    <StatusLabel tone={look.tone} filled={look.filled}>
      {look.label}
    </StatusLabel>
  );
}
