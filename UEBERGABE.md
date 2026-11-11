# Übergabe: Stand Multi-Mandant-Umbau

Stand: 2026-11-11. Branch `multi-mandant` (gleich `main`, Merge-Commit `59613a0`). Gesamtanleitung: `PHASE_B_MULTI_MANDANT.md`, Inventur: `INVENTUR_SCHRITT_0.md`.

Vorsicht: Es gibt **kein Staging**. Preview und Produktion nutzen dieselbe Datenbank und dieselben Edge Functions. Getestet wird nur mit Test-Accounts.

## Wo wir stehen

| AP | Stand |
|---|---|
| 0, 1, 2 | Erledigt, in `main`, in Produktion, getestet (Cron-Läufe um 01:00 und 09:00 Uhr bestätigt: 200) |
| 3 (Datenbank additiv) | Erledigt. `04a` bis `04h` siehe unten |
| 4.1 Vereinskontext, Branding, Manifest | Erledigt, in der Preview getestet |
| 4.2 Mitgliedschaft, Punkte/Admin/Rang | Erledigt, getestet (Gutschein-Test lief, Mails kamen an) |
| 4.3a Registrierung, Beitreten, Datenschutz | Erledigt, alle 6 Tests bestanden |
| 4.3b Passwort-Reset | Erledigt: `04h` ausgeführt, Function `passwort-reset` deployt, in Produktion getestet |
| 4.4 bis 4.8 | Offen |
| 5 bis 8 | Offen |

**`multi-mandant` ist seit 2026-11-11 nach `main` gemergt (PR #2, `59613a0`).** Die Produktions-App läuft mit dem neuen Frontend (Teil 4.1 bis 4.3b). Rollback bei Problemen: in Vercel den Production-Eintrag `b61a998` (Stand AP 2) suchen, Promote to Production. Die Datenbank bleibt, das alte Frontend arbeitet damit weiter.

## Sofort offen

Nichts Dringendes. Beobachten: Das Event am 2026-11-13 läuft auf der neuen Version. Nach dem Merge laufen alle Boppard-Nutzer über das neue Frontend; Meldungen von Mitgliedern ernst nehmen.

Prüfabfrage Punkte (muss 0 liefern, siehe unten) nach dem Merge ist noch zu bestätigen.

## SQL-Dateien (alle in der Datenbank ausgeführt, außer wo vermerkt)

| Datei | Inhalt | Stand |
|---|---|---|
| `01`, `02`, `02b` | Hotfix, Phase A, `sync_belegt` | ausgeführt |
| `03_functions_sicherheit.sql` | `mail_gesendet`, Trigger, Cron mit Secret | ausgeführt |
| `04_vorab_schema_pruefung.sql` | nur lesen, Schema-Abfrage | ausgeführt |
| `04a_grundlagen.sql` | Plattform-Admins, RLS-Hilfsfunktionen, `vereins_geheimnisse`, Einwilligungen, Letzter-Admin-Schutz | ausgeführt |
| `04b_funktionen_event_shop.sql` | Punkte-RPCs mit Brücke, Beitreten, Rangliste, Gäste, `event_typen`, Shop, `verein_anlegen` | ausgeführt |
| `04c_storage_logos.sql` | Bucket `vereins-logos` | **nicht ausgeführt**, erst für AP 7 nötig |
| `04d_boppard_angaben.sql` | Vertretung Leon Stuckert, Gartenstraße 29, 56154 Boppard | ausgeführt |
| `04e_boppard_logo.sql` | Logo in `vereine` | ausgeführt |
| `04f_vereine_public_id.sql` | `id` in `vereine_public` | ausgeführt |
| `04g_registrierung_serverseitig.sql` | Code-Prüfung in `handle_new_user`, Einwilligungen, Brücke `einstellungen` nach `vereins_geheimnisse` | ausgeführt |
| `04h_reset_versuche.sql` | Begrenzung Passwort-Reset | ausgeführt |

## Wichtige Entscheidungen und Fallen

- **Doppelte Datenhaltung bis AP 6:** Punkte und Admin stehen in `profiles` **und** `mitgliedschaften`. Die alten Funktionen (`add_punkte(uuid,integer)` usw.) schreiben beides (Brücke). Prüfabfrage, muss **0** liefern:
  `select count(*) from profiles p join mitgliedschaften m on m.user_id = p.id and m.verein_id = '5b0bba2d-0000-4000-8000-000000000001' where coalesce(p.punkte,0) <> m.punkte or coalesce(p.schichten_count,0) <> m.schichten_count;`
- **`verein_anlegen()` ist bis AP 5 gesperrt.** Eine zweite `einstellungen`-Zeile würde das alte `.single()` für alle Boppard-Nutzer brechen. Das gilt auch für den Test-Verein und für Spay (AP 7).
- **`einstellungen.id`** ist Primärschlüssel mit Default 1. Neue Vereine bekommen die nächste freie Nummer.
- **Shop-Preise:** Die Preise aus `Shop.tsx` gelten (50, 200, 500 Punkte), nicht die aus `einstellungen`/`Profil.tsx` (200, 300). In `preise` stehen: 5 € Verzehrgutschein, 10 € Fanshop-Gutschein, Heimtrikot (ohne Jahr). Die 15 alten Anfragen wurden nach `shop_anfragen` übernommen (ohne Mail).
- **Registrierung:** Der Freischaltcode wird serverseitig geprüft, **nur wenn** der Client einen mitschickt. Ein direkter `signUp` ohne Code geht bis AP 6 weiter (alte App-Versionen).
- **Rangliste** zeigt nur Mitglieder mit Einwilligung und ohne Gäste (bewusste Verhaltensänderung).
- **Bestätigungs- und Reset-Links:** Supabase Site URL `https://app.schichtmeisterapp.de`, Redirect URLs `https://app.schichtmeisterapp.de/**` und `https://*.schichtmeisterapp.de/**` sind gesetzt. Vercel-Previews sind nicht erlaubt, Links aus Previews führen auf `app.`.
- **Mail-Zustellung:** DKIM, SPF und DMARC (`_dmarc` TXT `v=DMARC1; p=none;` in Vercel angelegt) stehen auf PASS, GMX stuft die Mail als kein Spam ein. Resend Forge ist **nicht** aktiviert (Wirkung unklar, wirkt auf alle Mails).
- **Nameserver** der Domain sind bei Vercel (`ns1/ns2.vercel-dns.com`). DNS-Einträge legt man unter Vercel, Domains, DNS Records an, **nicht** auf der Resend-Seite.
- **Cron-Secret** liegt als Function-Secret `CRON_SECRET` und in den zwei Cron-Jobs. Der Wert stand einmal in einem Screenshot. Auf Wunsch neu setzen (SQL und `supabase secrets set`).
- **Gäste** (`is_temp`): 2 Stück. Die Verwaltung legt sie noch per `profiles.insert` an (ohne Mitgliedschaft). Umstellung auf `temp_user_anlegen` ist Teil 4.5.

## Nächste Schritte nach 3b (AP 4 Rest)

- **4.1b** Alle festen Grüntöne (rund 700) auf CSS-Variablen umstellen, Boppard-Texte aus dem Verein (Login, Shop, Marktplatz). Boppard muss danach exakt gleich aussehen.
- **4.4** Shop generisch (`preise`, `shop_einloesen`, Profil-Gutscheindialog in denselben Weg), Admin-Tab "Prämien" und "Anfragen", Trigger auf `shop_anfragen` für die Mail, Function `shop-anfrage`. Feature-Flag `shop`.
- **4.5** Admin-Tab "User": Gäste zusammenführen (`gast_vorschlaege`, `gast_zusammenfuehren`), Temp-User über `temp_user_anlegen`, Mitgliederliste über `vereins_mitglieder`, "Aus Verein entfernen".
- **4.6** Event-Typen im Admin pflegen, `eventBanner.ts` aus `event_typen`.
- **4.7** Edge Functions mandantenfähig (`_shared/mail.ts` ist als Baustein da), `punkte-vergabe` und `schicht-reminder` für alle Vereine mit `cron_laeufe`, `push-notification` neu, `account-loeschen` v2.
- **4.8** Vercel Wildcard-Domain `*.schichtmeisterapp.de`, Subdomains `boppard`/`spay`.
- **Verwaltung.tsx** liest noch `profiles` (Mitgliederliste, Join für Punktevergabe) und `einstellungen` ohne Vereinsfilter. Das ist für AP 5 zwingend umzustellen.
- Danach AP 5 (DB-Switch, nachts, ohne Event, mit Rollback-Datei und Backup), AP 6 (Cleanup, auch `handle_email_confirmed` ohne `search_path` härten), AP 7 (Spay), AP 8 (Superadmin).

## Offene Punkte außerhalb des Codes (Artjom)

- **Handy-Test** der Preview auf iPhone und Android steht noch aus (Regel 7 der Anleitung). Besonders PWA-Name und -Icon.
- **Betreiber-Angaben** der Plattform in `src/config.ts` eintragen (Betreiber, Anschrift, Kontakt), solange sie leer sind, fehlt der Abschnitt "Technischer Betrieb" im Datenschutztext.
- **Datenschutztext und Einwilligungs-Backfill** (73 Bestandsnutzer als "zugestimmt zum Registrierungsdatum") rechtlich gegenprüfen.
- **Test-Konten** unter Authentication, Users aufräumen (u. a. `ssvboppard1920@googlemail.com`, falls es ein Test-Konto ist).
- **Sicherung:** Supabase-Backup vom 2026-11-09 liegt vor. Vor AP 5 neu anlegen.
- **Plattform-Admin eintragen** (noch nicht bestätigt): `insert into plattform_admins select id from profiles where email = '<mail>';`
- **Spay:** Freischaltcode, Event-Arten, Shop ja/nein offen. Logo liegt unter `docs/spay/logo.png`.
- **Resend:** Entscheidung zu "Forge" offen.
