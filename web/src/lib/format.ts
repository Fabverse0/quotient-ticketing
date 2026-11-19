// Every date and time is shown in WIB, whatever the browser's own time zone.
const ZONE = "Asia/Jakarta";

const dateTime = new Intl.DateTimeFormat("id-ID", {
  timeZone: ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const time = new Intl.DateTimeFormat("id-ID", { timeZone: ZONE, hour: "2-digit", minute: "2-digit" });
const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export const formatDateTime = (iso: string) => `${dateTime.format(new Date(iso))} · ${time.format(new Date(iso))} WIB`;
export const formatDate = (iso: string) => dateTime.format(new Date(iso));
export const formatRupiah = (amount: number) => rupiah.format(amount).replace(/\s/g, "");
export const formatCount = (n: number) => n.toLocaleString("id-ID");
export const kindLabel = (kind: "REGULAR" | "VIP") => (kind === "REGULAR" ? "Reguler" : "VIP");

export function formatCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// Turns a WIB wall-clock value from <input type="datetime-local"> into an ISO instant.
export const wibInputToIso = (value: string) => new Date(`${value}:00+07:00`).toISOString();
