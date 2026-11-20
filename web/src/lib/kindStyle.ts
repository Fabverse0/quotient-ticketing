import type { TicketKind } from "../api/events";

export const KINDS: TicketKind[] = ["REGULAR", "VIP"];

// Reguler is always the ink blue and VIP always the umber, wherever they are compared.
export const KIND_STYLE: Record<TicketKind, { fill: string; track: string; tint: string; swatch: string }> = {
  REGULAR: { fill: "bg-inkblue", track: "bg-blue-wash", tint: "bg-blue-wash", swatch: "bg-canvas" },
  VIP: { fill: "bg-umber", track: "bg-clay", tint: "bg-clay", swatch: "bg-umber-light" },
};
