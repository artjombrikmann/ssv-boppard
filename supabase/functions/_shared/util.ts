// Kleine gemeinsame Helfer.

export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Gäste (Temp-User) haben keine echte Mailadresse.
export function istGastOderFake(profil: { is_temp?: boolean | null; email?: string | null } | null | undefined): boolean {
  if (!profil) return true;
  if (profil.is_temp) return true;
  const mail = (profil.email ?? "").toLowerCase();
  return !mail || mail.endsWith(".intern");
}

// Heutiges Datum (YYYY-MM-DD) in Europe/Berlin
export function heuteBerlin(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
