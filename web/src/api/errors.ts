// User-facing copy for API error codes. The DESIGN.md "State wajib" table is the
// source for the Quotient-specific ones.
const MESSAGES: Record<string, string> = {
  QUOTA_EXHAUSTED: "Kursi baru saja habis. Sisa kuota sudah diperbarui.",
  BUYER_LIMIT_EXCEEDED: "Kamu sudah memegang 4 tiket untuk event ini.",
  ORDER_EXPIRED: "Waktu bayar habis. Kursi sudah dilepas untuk pembeli lain.",
  DATABASE_BUSY: "Sistem sedang ramai. Coba lagi beberapa detik.",
  INVALID_CREDENTIALS: "Email atau password tidak cocok.",
  EMAIL_TAKEN: "Email ini sudah terdaftar. Masuk dengan email ini.",
  INVALID_TOKEN: "Sesi kamu sudah berakhir. Masuk lagi untuk melanjutkan.",
  UNAUTHORIZED: "Masuk dulu untuk melanjutkan.",
  FORBIDDEN: "Akun ini tidak punya akses ke halaman itu.",
  NETWORK: "Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.",
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    // Per-field messages from a 400 VALIDATION_ERROR ("email: ...; password: ...").
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function messageFor(error: unknown): string {
  if (error instanceof ApiError) return MESSAGES[error.code] ?? error.message;
  return MESSAGES.NETWORK!;
}

export function parseFieldErrors(message: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const part of message.split("; ")) {
    const at = part.indexOf(": ");
    if (at > 0) fields[part.slice(0, at)] ??= part.slice(at + 2);
  }
  return fields;
}
