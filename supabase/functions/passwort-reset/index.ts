import { serviceClient } from "../_shared/auth.ts";
import { corsHeaders as corsFuer } from "../_shared/cors.ts";
import { esc } from "../_shared/util.ts";
import { logoAbsolut, mailRahmen, sichereFarbe, vereinsUrl } from "../_shared/mail.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = "noreply@schichtmeisterapp.de";

const MAX_PRO_MAIL = 3;    // Anfragen je E-Mail-Adresse und Stunde
const MAX_PRO_IP = 20;     // Anfragen je Aufrufer-IP und Stunde

// Passwort vergessen, ohne Login aufrufbar.
//   Body: { email, verein_slug }
//
// Schutz:
//  * Die Antwort ist IMMER dieselbe (200, neutral), egal ob es das Konto gibt, die Grenze
//    erreicht ist oder intern etwas schiefgeht. So lässt sich nicht erkennen, wer ein Konto hat.
//  * Die Rücksprung-Adresse wird NUR serverseitig aus dem geprüften Slug gebaut. Eine vom
//    Browser mitgeschickte Adresse wird nie verwendet (sonst Phishing über unsere Mail).
//  * Begrenzung je E-Mail und je IP über die Tabelle reset_versuche (sql/04h).
Deno.serve(async (req) => {
  const corsHeaders = corsFuer(req);

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const neutral = () => new Response(JSON.stringify({ erfolg: true }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  try {
    if (req.method !== "POST") return neutral();

    let body: { email?: unknown; verein_slug?: unknown };
    try { body = await req.json(); } catch { return neutral(); }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const slug = typeof body.verein_slug === "string" ? body.verein_slug.trim().toLowerCase() : "";

    // Offensichtlich ungültige Eingaben: neutral ablehnen, ohne etwas zu tun
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email) || email.length > 254) return neutral();
    if (!/^[a-z0-9]([a-z0-9-]{0,28}[a-z0-9])?$/.test(slug)) return neutral();

    const supabase = serviceClient();

    // Verein prüfen (nur aktive Vereine). Unbekannter Slug: neutral beenden.
    const { data: verein } = await supabase
      .from("vereine")
      .select("id, slug, name, farbe_primary, logo_url")
      .eq("slug", slug)
      .eq("aktiv", true)
      .maybeSingle();
    if (!verein) return neutral();

    // Begrenzung: zuerst zählen, dann eintragen. Alte Einträge werden mit aufgeräumt.
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unbekannt";
    const mailKey = "mail:" + await sha256(email);
    const ipKey = "ip:" + await sha256(ip);
    const vorEinerStunde = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    await supabase.from("reset_versuche").delete().lt("erstellt_am", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const [{ count: nMail }, { count: nIp }] = await Promise.all([
      supabase.from("reset_versuche").select("id", { count: "exact", head: true }).eq("schluessel", mailKey).gt("erstellt_am", vorEinerStunde),
      supabase.from("reset_versuche").select("id", { count: "exact", head: true }).eq("schluessel", ipKey).gt("erstellt_am", vorEinerStunde),
    ]);

    // Jeder Aufruf zählt, auch bei erreichter Grenze (sonst ließe sich die Grenze ausreizen)
    await supabase.from("reset_versuche").insert([{ schluessel: mailKey }, { schluessel: ipKey }]);

    if ((nMail ?? 0) >= MAX_PRO_MAIL || (nIp ?? 0) >= MAX_PRO_IP) {
      console.warn("passwort-reset: Grenze erreicht");
      return neutral();
    }

    // Gibt es das Konto? Wenn nicht, wird NICHTS gesendet (die Antwort bleibt gleich).
    const { data: profil } = await supabase
      .from("profiles")
      .select("id, email, name, display_name, is_temp")
      .ilike("email", email)
      .maybeSingle();
    if (!profil || profil.is_temp) return neutral();

    // Das Konto muss Mitglied dieses Vereins sein, sonst kann man über fremde Vereine
    // herausfinden, ob eine Adresse registriert ist.
    const { data: mitglied } = await supabase
      .from("mitgliedschaften")
      .select("user_id")
      .eq("user_id", profil.id)
      .eq("verein_id", verein.id)
      .maybeSingle();
    if (!mitglied) return neutral();

    const basisUrl = vereinsUrl(verein.slug);

    // Link serverseitig erzeugen. redirectTo kommt NUR aus dem geprüften Slug.
    const { data: link, error: linkError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: profil.email as string,
      options: { redirectTo: `${basisUrl}/passwort-neu` },
    });
    const actionLink = link?.properties?.action_link;
    if (linkError || !actionLink) {
      console.error("passwort-reset: Link nicht erzeugt:", linkError?.message ?? "kein action_link");
      return neutral();
    }

    const name = profil.display_name || (profil.name ?? "").split(" ")[0] || "";
    const html = mailRahmen(
      { name: verein.name, farbe: sichereFarbe(verein.farbe_primary), logoUrl: logoAbsolut(verein.logo_url, basisUrl), basisUrl },
      `<p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#1a1a1a;">Passwort zurücksetzen</p>
       <p style="margin:0 0 16px;font-size:14px;color:#555;line-height:1.6;">${name ? `Hallo ${esc(name)}, ` : ""}für dein Konto bei ${esc(verein.name)} wurde ein neues Passwort angefordert. Klicke auf den Knopf, um eines festzulegen.</p>
       <p style="margin:0 0 24px;text-align:center;">
         <a href="${esc(actionLink)}" style="display:inline-block;padding:14px 28px;background:${sichereFarbe(verein.farbe_primary)};color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Neues Passwort festlegen</a>
       </p>
       <p style="margin:0 0 8px;font-size:12px;color:#777;line-height:1.5;">Dein Passwort gilt für alle Vereine, bei denen du Mitglied bist.</p>
       <p style="margin:0;font-size:12px;color:#777;line-height:1.5;">Der Link ist nur kurz gültig. Hast du das nicht angefordert, kannst du diese Mail ignorieren, dein Passwort bleibt dann unverändert.</p>`,
    );

    if (!RESEND_API_KEY) {
      console.error("passwort-reset: RESEND_API_KEY fehlt");
      return neutral();
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${verein.name} via Schichtmeister <${FROM_EMAIL}>`,
        to: profil.email,
        subject: `Passwort zurücksetzen · ${verein.name}`,
        html,
      }),
    });
    if (!resendRes.ok) console.error("passwort-reset: Resend-Fehler:", resendRes.status, await resendRes.text());

    return neutral();
  } catch (err) {
    // Auch Fehler bleiben nach außen neutral, Details nur im Log
    console.error("passwort-reset: Fehler:", String(err));
    return neutral();
  }
});

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
