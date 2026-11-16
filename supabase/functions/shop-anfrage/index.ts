import { serviceClient } from "../_shared/auth.ts";
import { corsHeaders as corsFuer } from "../_shared/cors.ts";
import { esc } from "../_shared/util.ts";
import { logoAbsolut, mailRahmen, sichereFarbe, vereinsUrl } from "../_shared/mail.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = "noreply@schichtmeisterapp.de";

// Aufruf durch den DB-Trigger notify_shop_anfrage (sendet { anfrage_id }).
// Wie gutschein-anfrage: Die Function vertraut nie Daten aus dem Body. Sie lädt die Anfrage per ID,
// "beansprucht" sie über mail_gesendet (false -> true) und sendet die Mail an die Admin-Adresse
// des Vereins aus einstellungen. Idempotent, nicht zum Spammen missbrauchbar.
Deno.serve(async (req) => {
  const corsHeaders = corsFuer(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { anfrage_id } = await req.json();
    if (!anfrage_id || typeof anfrage_id !== "string") return json(400, { fehler: "anfrage_id fehlt" });

    const supabase = serviceClient();

    const { data: anfrage, error: claimError } = await supabase
      .from("shop_anfragen")
      .update({ mail_gesendet: true })
      .eq("id", anfrage_id)
      .eq("mail_gesendet", false)
      .select("id, user_id, preis_name, punkte_kosten, verein_id")
      .maybeSingle();

    if (claimError) {
      console.error("Claim-Fehler:", claimError.message);
      return json(500, { fehler: "Anfrage konnte nicht geladen werden" });
    }
    if (!anfrage) return json(200, { erfolg: true, uebersprungen: true });

    const freigeben = async () => {
      const { error } = await supabase.from("shop_anfragen").update({ mail_gesendet: false }).eq("id", anfrage.id);
      if (error) console.error("mail_gesendet-Reset fehlgeschlagen:", error.message);
    };

    const [{ data: einst }, { data: verein }, { data: profil }] = await Promise.all([
      supabase.from("einstellungen").select("admin_email").eq("verein_id", anfrage.verein_id).maybeSingle(),
      supabase.from("vereine").select("name, slug, farbe_primary, logo_url").eq("id", anfrage.verein_id).maybeSingle(),
      supabase.from("profiles").select("name, display_name, email").eq("id", anfrage.user_id).maybeSingle(),
    ]);

    const adminEmail = einst?.admin_email;
    if (!adminEmail) {
      await freigeben();
      return json(400, { fehler: "Keine Admin-Email für diesen Verein" });
    }

    const name = profil?.display_name || profil?.name || "Unbekannt";
    const basisUrl = vereinsUrl(String(verein?.slug ?? "boppard"));
    const rahmen = {
      name: String(verein?.name ?? "Schichtmeister"),
      farbe: sichereFarbe(verein?.farbe_primary),
      logoUrl: logoAbsolut((verein?.logo_url as string | null) ?? null, basisUrl),
      basisUrl,
    };

    const inhalt = `
      <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#1a1a1a;">Neue Shop-Anfrage</p>
      <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.6;">Ein Mitglied hat Punkte eingelöst. Die Punkte sind bereits abgezogen.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:8px;border:1px solid #e5e7eb;">
        <tr><td style="padding:20px 24px;">
          <p style="margin:0 0 12px;font-size:13px;color:#555;"><strong style="color:#1a1a1a;">Mitglied:</strong> ${esc(name)}</p>
          <p style="margin:0 0 12px;font-size:13px;color:#555;"><strong style="color:#1a1a1a;">E-Mail:</strong> ${esc(profil?.email ?? "–")}</p>
          <p style="margin:0 0 12px;font-size:13px;color:#555;"><strong style="color:#1a1a1a;">Prämie:</strong> ${esc(anfrage.preis_name)}</p>
          <p style="margin:0;font-size:13px;color:#555;"><strong style="color:#1a1a1a;">Punkte:</strong> ${esc(anfrage.punkte_kosten)} Punkte</p>
        </td></tr>
      </table>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Schichtmeister <${FROM_EMAIL}>`,
        to: adminEmail,
        subject: `Neue Shop-Anfrage von ${name}`,
        html: mailRahmen(rahmen, inhalt),
      }),
    });
    console.log("Resend:", await resendRes.text());

    if (!resendRes.ok) {
      await freigeben();
      return json(502, { fehler: "Mailversand fehlgeschlagen" });
    }
    return json(200, { erfolg: true });
  } catch (err) {
    console.error("Fehler:", String(err));
    return json(500, { fehler: "Interner Fehler" });
  }
});
