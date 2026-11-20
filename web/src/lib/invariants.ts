// What each invariant check means, in the words the dashboard shows. The API sends
// its own description; the ids and value keys below come from the invariants service.
export interface CheckInfo {
  id: string;
  label: string;
  // Shown before the first run, so the panel says what will be compared.
  formula: string;
  // "=" must match exactly, "<=" is an upper bound.
  relation: "=" | "<=";
}

export const CHECKS: CheckInfo[] = [
  { id: "reserved_matches_pending", label: "Kursi ditahan sama dengan pesanan menunggu bayar", formula: "reserved = jumlah quantity pesanan PENDING", relation: "=" },
  { id: "sold_matches_paid", label: "Kursi terjual sama dengan pesanan lunas", formula: "sold = jumlah quantity pesanan PAID", relation: "=" },
  { id: "tickets_match_sold", label: "Tiket yang terbit sama dengan kursi terjual", formula: "jumlah tiket = sold", relation: "=" },
  { id: "counters_within_quota", label: "Terjual dan ditahan tidak melebihi kuota", formula: "sold + reserved <= quota", relation: "<=" },
  { id: "orders_within_quota", label: "Pesanan aktif tidak melebihi kuota", formula: "jumlah quantity pesanan PENDING + PAID <= quota", relation: "<=" },
  { id: "buyer_limit", label: "Tidak ada pembeli dengan lebih dari 4 tiket aktif", formula: "tiket aktif per pembeli <= 4", relation: "<=" },
];

const VALUE_LABELS: Record<string, string> = {
  reserved: "ditahan",
  pendingQuantity: "pesanan menunggu",
  sold: "terjual",
  paidQuantity: "pesanan lunas",
  tickets: "tiket terbit",
  soldPlusReserved: "terjual + ditahan",
  quota: "kuota",
  activeQuantity: "pesanan aktif",
  maxActiveQuantity: "terbanyak per pembeli",
  limit: "batas",
};

const valueLabel = (key: string) => VALUE_LABELS[key] ?? key;

// "ditahan 7 = pesanan menunggu 7", or "ditahan 3 ≠ pesanan menunggu 200" when it fails.
export function compare(values: Record<string, number>, relation: "=" | "<=", ok: boolean) {
  const [left, right] = Object.entries(values);
  if (!left || !right) return "";
  const sign = ok ? (relation === "=" ? "=" : "≤") : relation === "=" ? "≠" : ">";
  return `${valueLabel(left[0])} ${left[1].toLocaleString("id-ID")} ${sign} ${valueLabel(right[0])} ${right[1].toLocaleString("id-ID")}`;
}
