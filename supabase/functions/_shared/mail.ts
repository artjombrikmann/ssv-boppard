// Kleiner Baustein für Mails im Vereinsdesign (Logo, Farbe, Name aus der Tabelle vereine).
// Wird von passwort-reset genutzt, die übrigen Mail-Functions folgen in AP 4.7.

import { esc } from "./util.ts";

export interface VereinMail {
  name: string;
  farbe: string;
  logoUrl: string | null;
  basisUrl: string;       // z. B. https://boppard.schichtmeisterapp.de
}

const HEX = /^#[0-9a-f]{6}$/i;

export function sichereFarbe(farbe: unknown): string {
  return typeof farbe === "string" && HEX.test(farbe) ? farbe : "#0d631b";
}

// Vereinsadresse: Boppard bleibt auf app.schichtmeisterapp.de (dort sind die installierten PWAs),
// alle anderen Vereine auf <slug>.schichtmeisterapp.de. Wird NUR aus dem geprüften Slug gebaut.
export function vereinsUrl(slug: string): string {
  return slug === "boppard"
    ? "https://app.schichtmeisterapp.de"
    : `https://${slug}.schichtmeisterapp.de`;
}

// Logos mit relativem Pfad (Boppard: /LOGO-….png) werden auf die Vereinsadresse bezogen.
export function logoAbsolut(logoUrl: string | null, basisUrl: string): string | null {
  if (!logoUrl) return null;
  if (/^https:\/\//i.test(logoUrl)) return logoUrl;
  if (logoUrl.startsWith("/")) return basisUrl + logoUrl;
  return null;
}

export function mailRahmen(v: VereinMail, inhalt: string): string {
  const farbe = sichereFarbe(v.farbe);
  const logo = v.logoUrl
    ? `<img src="${esc(v.logoUrl)}" alt="${esc(v.name)}" width="56" height="56" style="display:block;margin:0 auto 10px;border-radius:50%;background:#ffffff;object-fit:contain;" />`
    : "";
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:${farbe};padding:24px 32px;text-align:center;">
          ${logo}
          <span style="font-size:20px;font-weight:600;color:#ffffff;">${esc(v.name)} · Schichtmeister</span>
        </td></tr>
        <tr><td style="padding:32px;">${inhalt}</td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Schichtmeister · schichtmeisterapp.de</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
