# Schichtmeister – Gesamtanleitung für Claude Code (v2)
### Fixes + Multi-Mandant-Umbau (SSV Boppard + SV Spay)

Repo: `artjombrikmann/ssv-boppard` · Supabase-Projekt-Ref: `kfawjltveddyoqewayzh` · Hosting: Vercel

> **Start:** Lies dieses Dokument komplett und `INVENTUR_SCHRITT_0.md`. Arbeite die Arbeitspakete (AP) **strikt der Reihe nach** ab, beginne mit AP 0 und AP 1. Nach jedem AP stoppst du (STOP) und gibst Artjom eine Schritt-für-Schritt-Anleitung. Erst wenn er „fertig" schreibt, geht es weiter.

---

## 0. Arbeitsregeln (verbindlich)

1. **SQL nie selbst gegen die Produktion ausführen.** Alle SQL-Änderungen als nummerierte Dateien unter `sql/` (Fortsetzung ab `03_`). Artjom führt sie im Supabase SQL Editor aus. Jede Datei: `begin; … commit;`, deutsche Kommentare, Kontroll-Query am Ende, Rollback-Hinweise.
2. **Keine Secrets in Dateien oder Commits.** In SQL-Dateien stehen Platzhalter wie `<CRON_SECRET>`, die Artjom beim Ausführen ersetzt. Nichts davon ins Repo.
3. **Erst lesen, dann ändern.** Wo dieses Dokument vom Code abweicht, gilt der Code. Weise darauf hin.
4. **Ein Commit pro sinnvollem Schritt**, vollständige Dateien liefern (keine Fragmente zum Selbst-Zusammenbauen).
5. **Artjom ist kein Terminal-Experte.** Jede Anleitung nennt genau: Wo klicken oder welcher Befehl, was erwartet wird, was er dir zurückmelden soll. Eine Aufgabe nach der anderen.
6. **Kein Staging.** Preview-Deployments und Tests laufen gegen die echte Datenbank. Deshalb: nur Test-Accounts verwenden, SQL zuerst additiv, riskante Schritte nachts/ohne Event, Rollback-Datei vorher bereitlegen.
7. Getestet wird auf echten Geräten (PWA auf iPhone und Android).
8. Bei Unklarheit höchstens **eine gebündelte Rückfrage** pro AP.

## 1. Stand (bereits erledigt)

- `sql/01_hotfix_sicherheit.sql` ausgeführt: Spaltenrechte auf `profiles`, abgesicherte Punkte-Funktionen, `sync_belegt` als SECURITY DEFINER, Policy `update_belegt` entfernt.
- `sql/02_multi_mandant_phase_a.sql` ausgeführt: Backup-Schema `backup_pre_mt`; Tabellen `vereine` (Boppard-ID `5b0bba2d-0000-4000-8000-000000000001`) und `mitgliedschaften` (Backfill aller Profile); `verein_id NOT NULL DEFAULT <Boppard>` an 11 Tabellen; View `vereine_public`; `handle_new_user()` legt Mitgliedschaft an (`verein_slug` aus Metadaten, Fallback `boppard`).
- Policy `admin_insert` auf `einstellungen` angelegt (Admin-E-Mail und Freischaltcode lassen sich wieder speichern).
- `account-loeschen` abgesichert und deployt (Aufrufer-Prüfung, Admin-Pflicht für fremde Konten).
- Cron: `punkte-vergeben-nacht` war kaputt (fehlende DB-Einstellung, Function existiert nicht). Wird von Artjom entfernt. Es bleiben `punkte-vergabe-daily` (00:00 UTC) und `schicht-reminder-daily` (08:00 UTC).
- Aktuell **keine** `supabase/functions/` im Repo. Lade sie in AP 0 herunter.

## 2. Entscheidungen (fix)

| Thema | Entscheidung |
|---|---|
| Architektur | Ein Supabase-Projekt, ein Vercel-Projekt, ein Repo. Trennung über `verein_id` + RLS |
| Accounts | Ein Account pro Person, Mitgliedschaft pro Verein (`mitgliedschaften`: `is_admin`, `is_trainer`, `punkte`, `schichten_count`, Einwilligungen) |
| Hosts | `boppard.schichtmeisterapp.de`, `spay.schichtmeisterapp.de`, `app.schichtmeisterapp.de` bleibt Alias für Boppard |
| Branding | CSS-Variablen aus `vereine_public`, dynamisches Manifest pro Host |
| Shop | **Generisch** über `preise` (Admin pflegt Prämien), Einlösen atomar per RPC. Feature-Flag `shop` pro Verein |
| Gäste (Temp-User) | Zusammenführen mit echtem Konto per **Admin-Klick** im Tab „User" (Vorschläge nach Namen + manuelle Auswahl) |
| Event-Typen | Pro Verein in Tabelle `event_typen` statt festem CHECK-Constraint |
| Einwilligungen | Pro Mitgliedschaft mit Zeitstempel. Bestandsnutzer Boppard werden als „zugestimmt zum Registrierungsdatum" nachgetragen (rechtlich von Artjom gegenzuprüfen) |
| Datenschutztext | Ein generischer Baustein mit Platzhaltern aus `vereine` (Verantwortlicher, Anschrift, Kontakt, Vertretung) |
| Rangliste | Pro Verein, ohne Gäste, nur Mitglieder mit Rangliste-Einwilligung |
| Namensprüfung bei Registrierung | Entfällt, ersetzt durch Gäste-Zusammenführung |
| Passwort-Reset | Edge Function + Resend im Vereinsdesign, Redirect serverseitig aus Slug gebaut |
| Mail-Absender | „<Verein> via Schichtmeister", Reply-To = Vereins-Admin-Mail, Logo und Farbe aus `vereine` |
| Zeitzone | Alles „heute/morgen" explizit in `Europe/Berlin` |

## 3. Arbeitspakete im Überblick

| AP | Inhalt | Branch | Deploy |
|---|---|---|---|
| 0 | Vorbereitung: Functions herunterladen, Repo-Hygiene | `main` | – |
| 1 | **Sofortfix Shop und Gutschein-Mail** | `fix/shop` → PR → `main` | sofort |
| 2 | **Edge Functions absichern** | `fix/functions-sicherheit` → PR → `main` | nach AP 1 |
| 3 | DB additiv (B1) | `multi-mandant` | SQL Editor |
| 4 | Frontend + Functions mandantenfähig (B2) | `multi-mandant` | Vercel + Functions |
| 5 | DB-Switch mit neuer RLS (B3) | `multi-mandant` | SQL Editor, nachts |
| 6 | Cleanup (C) | – | nach 1–2 Wochen |
| 7 | Onboarding SV Spay | – | nach AP 5 |
| 8 | Superadmin-Konsole (eigene Spezifikation, später) | eigenes Projekt | – |

---

## AP 0 – Vorbereitung

1. Wechsle auf `main`, `git pull`. Arbeitsverzeichnis muss sauber sein.
2. Fehlt `supabase/functions/`: lade die Functions herunter (`supabase functions download --use-api <name>`). Falls das nicht klappt, bitte Artjom um Copy-Paste aus dem Dashboard (Edge Functions → Function → Code). Zu sichern sind: `gutschein-anfrage`, `punkte-vergabe`, `schicht-reminder`, `schicht-zuweisung`, `account-loeschen`. **Nicht** relevant: `push-notification` (wird gelöscht und neu gebaut), `rapid-responder`, `smart-action` (leere Vorlagen), `spielbericht-generieren` (gehört nicht zu Schichtmeister, Tabelle `spielberichte` existiert hier nicht).
3. `src/screens/.env.local` liegt versehentlich im Repo: `git rm --cached`, in `.gitignore` aufnehmen. `supabaseClient.ts` liest URL und Anon-Key aus `import.meta.env` mit den bisherigen Werten als Fallback.
4. Kein STOP nötig, direkt weiter mit AP 1.

---

## AP 1 – Sofortfix Shop und Gutschein-Mail (auf `main`)

**Hintergrund:** Der Hotfix aus Phase 1 verbietet normalen Usern das direkte Ändern von `profiles.punkte`. `Shop.tsx` zieht Punkte genau so ab. Ergebnis aktuell: Gutscheine werden ohne Punktabzug vergeben. Außerdem zeigt die Gutschein-Mail „Fanshop", obwohl ein Verzehrgutschein angefragt wurde.

**Aufgaben**
1. `Shop.tsx`: Punkteabzug per `supabase.rpc('punkte_abziehen', { user_id, amount })`. Reihenfolge: Guthaben prüfen → Abzug per RPC → bei Fehler abbrechen und Meldung zeigen → erst danach Anfrage speichern. Punktestand danach neu laden.
2. `Profil.tsx`: dieselbe Prüfung. Der Gutschein-Weg dort nutzt schon die RPC, achte auf Fehlerbehandlung und Reihenfolge.
3. **typ-Werte:** Ermittle, welche `typ`-Werte in `gutschein_anfragen` geschrieben werden. Die Function `gutschein-anfrage` kennt nur `food`, alles andere wird „Fanshop-Gutschein". Ersetze das durch ein explizites Mapping. Unbekannte Werte: Rohwert in der Mail anzeigen und loggen, nicht stillschweigend „Fanshop".
4. **Doppelte Mails:** Prüfe, ob zusätzlich zum DB-Trigger `trigger_gutschein_mail` auch das Frontend die Function aufruft. Falls ja, Frontend-Aufruf entfernen, der Trigger bleibt.
5. `Marktplatz.tsx` und `MeineSchichten.tsx`: das Client-Update `schichten.update({belegt})` entfernen (der Trigger `sync_belegt` erledigt das, das Update läuft seit dem Hotfix ins Leere). Optimistische Aktualisierung der Anzeige beim Anmelden/Abmelden einbauen, um die 1–2 Sekunden Verzögerung zu beseitigen.
6. Function deployen: `supabase functions deploy gutschein-anfrage`. Frontend: PR → Merge nach `main` → Vercel.

**STOP 1 – Anleitung an Artjom:** Test mit Test-User: (a) Shop: Artikel einlösen → Punkte sind nach F5 abgezogen. (b) Profil: Verzehrgutschein → Admin-Mail zeigt „Verzehrgutschein", genau **eine** Mail. (c) Schicht an-/abmelden fühlt sich schnell an.

---

## AP 2 – Edge Functions absichern (auf `main`, Branch `fix/functions-sicherheit`)

**Befund aus dem Code:** Die Mail-Functions und `punkte-vergabe` sind für jeden mit dem öffentlichen Anon-Key aufrufbar. Die Testmodi (`test_mode`) verschicken Mails von `noreply@schichtmeisterapp.de` an beliebige Adressen. `schicht-zuweisung` nimmt `admin_id` ungeprüft aus dem Body.

**Gemeinsamer Code** unter `supabase/functions/_shared/`:
- `auth.ts`: `requireUser(req)` (gültiges User-JWT, sonst 401), `requireAdmin(req)` (User + `profiles.is_admin`, in AP 4 dann `ist_admin_von`), `requireCron(req)` (Header `x-cron-secret` gleich Function-Secret `CRON_SECRET`, sonst 401).

**Pro Function**
- `schicht-zuweisung`: `requireAdmin`; `admin_id` aus dem JWT statt aus dem Body; `test_mode` nur für Admins; Endzeit aus `endzeit_ts` formatieren (aktuell wird die Spalte `endzeit` (nur Uhrzeit) formatiert, das ergibt „Invalid Date"); Gäste überspringen (`profiles.is_temp = true` oder E-Mail endet auf `@ssv-boppard.intern`).
- `gutschein-anfrage`: Aufruf aus dem DB-Trigger. Neue Spalte `gutschein_anfragen.mail_gesendet boolean not null default false`. Trigger sendet `gutschein_id`. Die Function lädt die Anfrage per ID aus der DB (nie Daten aus dem Body), sendet nur, wenn `mail_gesendet = false`, und setzt danach `true`. Damit ist sie idempotent und nicht zum Spammen missbrauchbar. `test_mode` nur für Admins.
- `schicht-reminder`: `requireCron`; `test_mode` nur für Admins; Gäste und Fake-Adressen überspringen; `consent_erinnerung` wird erst in AP 4 ausgewertet.
- `punkte-vergabe`: `requireCron`. Fehler beheben: (a) Status „Abgeschlossen" nach `coalesce(datum_ende, datum)` statt nur `datum` (mehrtägige Events), (b) `add_punkte` zählt `schichten_count` bereits mit, der zusätzliche Aufruf `increment_schichten_count` zählt doppelt, also entfernen, (c) Belegung zuerst „beanspruchen" (`update … set punkte_vergeben = true where id = … and punkte_vergeben = false returning id`), dann Punkte vergeben, bei Fehler Flag zurücksetzen, (d) „heute" in `Europe/Berlin`.
- `push-notification`: wird von Artjom gelöscht (nie benutzt, ohne Prüfung aufrufbar, unverschlüsselter Payload). Neubau in AP 4.
- CORS: `Access-Control-Allow-Origin` auf `*.schichtmeisterapp.de` und Preview-Hosts einschränken, wo das Frontend die Function aufruft.

**Frontend:** Alle Functions-Aufrufe senden `Authorization: Bearer <session.access_token>` statt Anon-Key (`Verwaltung.tsx` für Zuweisung und Mail-Tests, `Profil.tsx`).

**SQL `sql/03_functions_sicherheit.sql`:** Spalte `mail_gesendet`; Trigger `notify_gutschein_anfrage` sendet `gutschein_id`; Cron-Jobs neu anlegen (erst `cron.unschedule`, dann `cron.schedule`) mit Header `x-cron-secret`. Vorlage (Secret als Platzhalter):
```sql
select cron.schedule('punkte-vergabe-daily', '0 0 * * *', $$
  select net.http_post(
    url := 'https://kfawjltveddyoqewayzh.supabase.co/functions/v1/punkte-vergabe',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb);
$$);
```
Analog für `schicht-reminder-daily` (08:00 UTC). Den Anon-Key entnimmst du den bisherigen Job-Definitionen, er ist öffentlich.

**Deploy-Reihenfolge (wichtig, sonst 401 in der Nacht):**
1. Frontend mergen und deployen (sendet nun das JWT, die alten Functions ignorieren es).
2. SQL-Datei ausführen (Trigger sendet `gutschein_id`, Cron sendet den Header).
3. `supabase secrets set CRON_SECRET=<wert>` (Artjom wählt einen langen Zufallswert).
4. Functions deployen: `gutschein-anfrage`, `schicht-zuweisung`, `schicht-reminder`, `punkte-vergabe`.

**STOP 2 – Anleitung an Artjom** mit genau dieser Reihenfolge, danach Tests: Zuweisung (Mail zeigt Endzeit korrekt), Gutschein-Mail (eine Mail), Mail-Test-Buttons in der Verwaltung, nächster Morgen: `select jobname, status, start_time from cron.job_run_details order by start_time desc limit 6;` zeigt `succeeded`.

---

## AP 3 – DB additiv (Branch `multi-mandant`, `sql/04_b1_additiv.sql`)

Alles hier ist für die laufende App unsichtbar. Möglicherweise sinnvoll in mehrere Dateien aufteilen (z. B. `04a`, `04b`), damit Fehler leichter eingrenzbar sind.

**3.1 Plattform und Vereinsdaten**
```sql
create table public.plattform_admins (user_id uuid primary key references public.profiles(id) on delete cascade);
alter table public.plattform_admins enable row level security;  -- bewusst keine Policy

create or replace function public.ist_plattform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.plattform_admins where user_id = auth.uid()) $$;

alter table public.vereine
  add column if not exists icon_192_url text,
  add column if not exists icon_512_url text,
  add column if not exists features jsonb not null default '{}'::jsonb,   -- z. B. {"shop": true, "trikot": true}
  add column if not exists rechtsname text,
  add column if not exists anschrift text,
  add column if not exists plz_ort text,
  add column if not exists land text default 'Deutschland',
  add column if not exists kontakt_email text,
  add column if not exists vertretung text;          -- Vorsitz, für den Datenschutztext
```
`vereine_public` um Icons, Features und die Impressums-/Datenschutz-Angaben erweitern (öffentliche Vereinsdaten).

**3.2 Hilfsfunktionen für RLS** (alle `security definer`, `stable`, `set search_path = public`):
`meine_vereine()`, `ist_admin_von(p_verein uuid)`, `verein_der_schicht(p_schicht bigint)`, `ist_admin_ueber_nutzer(p_user uuid)`, `teilt_verein_mit(p_user uuid)`. Muster:
```sql
create or replace function public.meine_vereine() returns setof uuid
language sql stable security definer set search_path = public as $$
  select verein_id from public.mitgliedschaften where user_id = auth.uid() $$;

create or replace function public.ist_admin_von(p_verein uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.mitgliedschaften
                 where user_id = auth.uid() and verein_id = p_verein and is_admin) $$;
```

**3.3 Geheimnisse trennen**
```sql
create table public.vereins_geheimnisse (
  verein_id uuid primary key references public.vereine(id) on delete cascade,
  freischaltcode text, admin_email text);
alter table public.vereins_geheimnisse enable row level security;
create policy geheimnisse_admin on public.vereins_geheimnisse
  for all using (public.ist_admin_von(verein_id)) with check (public.ist_admin_von(verein_id));
insert into public.vereins_geheimnisse (verein_id, freischaltcode, admin_email)
select verein_id, freischaltcode, admin_email from public.einstellungen on conflict do nothing;
```
`einstellungen.freischaltcode` und `admin_email` bleiben bis AP 6 (alte App-Versionen).

**3.4 Trigger** `trigger_schichten_verein`: `schichten.verein_id` immer aus `veranstaltungen.verein_id` ableiten (`before insert or update of veranstaltung_id`; bei `veranstaltung_id is null` die bestehende `verein_id` behalten).

**3.5 Punkte-Funktionen**
- Neue Signaturen `add_punkte(p_user, p_verein, p_amount)` (zählt `schichten_count` selbst um 1), `punkte_abziehen(p_user, p_verein, p_amount)` (Admin/Service **oder** `p_user = auth.uid()` mit `p_amount > 0` und ausreichendem Guthaben), `increment_schichten_count(p_user, p_verein)`. Alle schreiben nur in `mitgliedschaften`. `revoke execute … from public, anon`.
- **Übergangs-Brücke:** Die alten Signaturen aus dem Hotfix schreiben bis AP 6 zusätzlich in die Boppard-Mitgliedschaft, damit nichts verloren geht, solange alte App-Versionen laufen:
```sql
update public.mitgliedschaften set punkte = punkte + amount, schichten_count = schichten_count + 1
 where mitgliedschaften.user_id = add_punkte.user_id
   and verein_id = '5b0bba2d-0000-4000-8000-000000000001';
```
Analog für `punkte_abziehen` und `increment_schichten_count`.

**3.6 Einwilligungen pro Mitgliedschaft**
Spalten in `mitgliedschaften`: `consent_rangliste`, `consent_erinnerung` (boolean, default false), `datenschutz_akzeptiert_am`, `nutzungsbedingungen_akzeptiert_am` (timestamptz), `einwilligung_quelle text`. Backfill für alle bestehenden Boppard-Mitgliedschaften: Einwilligungen `true`, Zeitstempel = `profiles.created_at`, Quelle `backfill-ui-pflicht` (die Checkboxen waren im UI Pflicht, wurden aber nie gespeichert). Gäste (`is_temp`) ausnehmen.

**3.7 Beitreten, Rangliste, Mitglieder**
```sql
create or replace function public.verein_beitreten(p_slug text, p_code text, p_consents jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare v_verein uuid; v_code text;
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;
  select id into v_verein from public.vereine where slug = p_slug and aktiv;
  if v_verein is null then raise exception 'Unbekannter Verein'; end if;
  select freischaltcode into v_code from public.vereins_geheimnisse where verein_id = v_verein;
  if coalesce(v_code,'') <> '' and p_code is distinct from v_code then raise exception 'Falscher Code'; end if;
  insert into public.mitgliedschaften (user_id, verein_id, consent_rangliste, consent_erinnerung,
         datenschutz_akzeptiert_am, nutzungsbedingungen_akzeptiert_am, einwilligung_quelle)
  values (auth.uid(), v_verein, coalesce((p_consents->>'rangliste')::boolean,false),
          coalesce((p_consents->>'erinnerung')::boolean,false), now(), now(), 'beitritt')
  on conflict do nothing;
end $$;
```
Versuche beim Code begrenzen (z. B. Tabelle `beitritt_versuche`, max. 5 pro User und Stunde).
`rangliste(p_verein)` (SECURITY DEFINER): nur für Mitglieder des Vereins, nur `mitgliedschaften.consent_rangliste = true`, **ohne** Gäste, sortiert nach Punkten; liefert `user_id, display_name, punkte, schichten_count`.
`vereins_mitglieder(p_verein)` für Admins (Name, E-Mail, Punkte, Rolle, Gast ja/nein).
`temp_user_anlegen(p_verein, p_name, p_typ)`: Admin-Check, legt Profil (`is_temp = true`) **und** Mitgliedschaft an (das Frontend darf nicht in `mitgliedschaften` schreiben).

**3.8 Gäste zusammenführen**
- `gast_vorschlaege(p_verein)` (Admin): Paare aus Gast und echtem Mitglied, deren Namen nach Normalisierung gleich sind (klein, Leerzeichen zusammengefasst, Reihenfolge Vor/Nachname egal). Rückgabe: `gast_id, gast_name, mitglied_id, mitglied_name`.
- `gast_zusammenfuehren(p_gast, p_echt, p_verein)` (SECURITY DEFINER, Admin des Vereins, atomar): prüft, dass beide Mitglieder des Vereins sind, `p_gast` ein Gast und `p_echt` kein Gast ist. Überträgt `schichtbelegungen` (bei Konflikt auf `unique(schicht_id, mitglied_id)` die Gast-Zeile verwerfen), addiert Punkte und `schichten_count` des Gasts auf die Mitgliedschaft des echten Kontos, überträgt `gutschein_anfragen` und `benachrichtigungen`, löscht danach Mitgliedschaft und Profil des Gasts. Gibt eine Zusammenfassung zurück (Anzahl Schichten, Punkte).

**3.9 Event-Typen**
```sql
create table public.event_typen (
  id uuid primary key default gen_random_uuid(),
  verein_id uuid not null references public.vereine(id) on delete cascade,
  key text not null, label text not null, sort int not null default 0, farbe text,
  unique (verein_id, key));
```
RLS: Mitglieder lesen, Admin schreibt. Seed für Boppard: `heimspiel`, `vereinsfest`, `turnier`, `flag-football` (mit den bisherigen Labels). `veranstaltungen_kategorie_check` entfernen, dafür Composite-FK `(verein_id, kategorie) references event_typen (verein_id, key)` (kategorie ist nullable). Gleiches für `schicht_vorlagen (verein_id, event_typ)`.

**3.10 Shop generisch**
- `preise` (existiert, vom Frontend bisher ungenutzt): Spalten `kategorie text` (z. B. `gutschein`, `artikel`) und optional `anzahl_verfuegbar int` ergänzen.
- **Seed Boppard:** Lies `Shop.tsx` (`ARTIKEL`-Liste), die Gutschein-Werte aus `einstellungen` (`food_pts`, `food_val`, `shop_pts`, `shop_val`) und den Gutschein-Dialog in `Profil.tsx`. Erzeuge daraus `INSERT`s in `preise` (Verzehrgutschein, Fanshop-Gutschein, vorhandene Artikel), sodass das Verhalten für Boppard unverändert bleibt. Zeige Artjom die geplanten Zeilen vor dem Ausführen.
- `shop_anfragen` bekommt `mail_gesendet boolean default false`. Historische Zeilen aus `gutschein_anfragen` werden in `shop_anfragen` übernommen (Status-Werte auf `offen|bearbeitet|abgelehnt` mappen; prüfe die vorhandenen Werte zuerst). Bedenke: `shop_anfragen.user_id` verweist auf `auth.users`, Gäste haben keinen Auth-Account, ihre Anfragen (falls vorhanden) bleiben in `gutschein_anfragen`.
- RPC `shop_einloesen(p_preis uuid)` (SECURITY DEFINER, **eine Transaktion**): Mitgliedschaft im Verein des Preises, `verfuegbar = true`, Guthaben `>= punkte_kosten`, Punkte abziehen, `shop_anfragen` anlegen (mit Snapshot `preis_name`, `punkte_kosten`, `verein_id`), Anfrage-ID zurückgeben.
- RPC `shop_anfrage_bearbeiten(p_id, p_status, p_notiz)` (Admin des Vereins). Bei `abgelehnt` werden die Punkte per `add_punkte`-ähnlicher Logik zurückgebucht, genau einmal.
- Trigger auf `shop_anfragen` (insert) ersetzt `trigger_gutschein_mail` und ruft die Mail-Function mit der Anfrage-ID auf (idempotent über `mail_gesendet`).

**3.11 Weitere Objekte**
- `cron_laeufe (id, job, verein_id, gestartet_am, ok int, fehler int, details jsonb)` für den Cron-Monitor.
- `verein_anlegen(p_slug, p_name, p_farbe, p_admin_email, p_freischaltcode)` (Plattform-Admin oder Service Role): legt Verein, `einstellungen`-Zeile, `vereins_geheimnisse`, Standard-Kategorien (Kopie von Boppard), Standard-Event-Typen und Beispiel-Prämien an. **Reservierte Slugs ablehnen:** `admin`, `app`, `www`, `api`, `mail`, `test` (außer bewusst).
- Zusätzliche Constraints (die alten bleiben bis AP 5): `unique (verein_id, name)` auf `kategorien`, `unique (user_id, verein_id)` auf `push_subscriptions`.
- Storage-Bucket `vereins-logos` (öffentlich lesbar, Schreiben nur Plattform-Admin/Service Role) samt Policies.
- Letzter Admin: Trigger oder RPC-Prüfung, die verhindert, dass ein Verein ohne Admin zurückbleibt.

**STOP 3 – Anleitung an Artjom:** SQL-Datei(en) im SQL Editor ausführen (Reihenfolge nennen), Kontroll-Query prüfen, App normal nutzen (alles wie vorher), danach sich selbst als Plattform-Admin eintragen: `insert into plattform_admins select id from profiles where email = '<seine mail>';`

---

## AP 4 – Frontend und Functions mandantenfähig (Branch `multi-mandant`)

Muss mit der **alten und der neuen** RLS-Welt funktionieren (AP 5 folgt direkt danach).

**4.1 Vereinskontext und Branding**
- `VereinContext`: Slug aus Host (erstes Label; Alias `app`, `www` → `boppard`; `localhost` und `*.vercel.app` → Parameter `?verein=`, sonst `boppard`). Lädt `vereine_public`, cached in `localStorage`, setzt CSS-Variablen (`--primary`, `--primary-dark`, `--primary-light`, `--secondary`), `document.title`, `theme-color`, Favicon, `apple-touch-icon`. Unbekannter Slug: Fehlerseite.
- Alle harten Grüntöne und Boppard-Texte/-Logos aus der Inventur (Punkt 6) auf Variablen und Kontext umstellen. Systemfarben (Fehlerrot, Grautöne) bleiben.
- Dynamisches Manifest: Vercel Function `api/manifest.ts` (Host → Slug → Name, Icons, `theme_color`), `vercel.json` leitet `/manifest.json` dorthin. iOS: Icon im DOM prüfen, **auf echtem iPhone testen**.
- Feature-Flags: Shop-UI nur bei `features.shop`, Trikot-UI nur bei `features.trikot`.

**4.2 Auth, Registrierung, Beitritt**
- `Login.tsx`: Vereinslogo/-name. `signUp` mit `options.data = { name, display_name, verein_slug, freischaltcode, consents }`. `handle_new_user()` wird um die serverseitige Code-Prüfung erweitert (falscher Code → Registrierung schlägt fehl) und schreibt Einwilligungen in die Mitgliedschaft. (Anhand `Login.tsx` prüfen, wie der Code heute eingesetzt wird, und das Verhalten für Boppard erhalten.)
- **Bekannte E-Mail beim Registrieren:** beide Supabase-Varianten abfangen (leeres `data.user.identities` bei aktiver Bestätigung, Fehler „User already registered" ohne). Bestehendes Konto bleibt unverändert, das neue Passwort wird verworfen. UI wechselt auf Login (E-Mail vorausgefüllt) mit Hinweis „Diese E-Mail ist schon registriert, evtl. in einem anderen Verein. Dein Passwort gilt für alle Vereine." plus „Passwort vergessen?". Der eingegebene Freischaltcode bleibt **nur im Arbeitsspeicher**. Nach erfolgreichem Login ohne Mitgliedschaft: automatisch `verein_beitreten(slug, code, consents)`. Falscher Code oder Reset-Umweg → Beitreten-Screen mit manueller Codeeingabe.
- Login ohne Mitgliedschaft: Screen „Diesem Verein beitreten" (Code, Einwilligungen des Vereins). Fehlermeldung bei unbestätigter E-Mail verständlich (`email_not_confirmed`) statt „E-Mail oder Passwort falsch".
- `AuthContext`: `profile` (Stammdaten) + `mitgliedschaft` (aktueller Verein). Alle Stellen aus Inventur Punkt 2 auf `mitgliedschaft.*` umstellen. Vereinswechsler im Profil (Links auf die Subdomains, nur bei ≥ 2 Mitgliedschaften).
- Alle `insert`s auf vereinsbezogene Tabellen senden `verein_id` aus dem Kontext. Upserts: `kategorien` → `onConflict: 'verein_id,name'`, `push_subscriptions` → `'user_id,verein_id'`.
- Rangliste und Home-Rang über `rpc('rangliste')`. Namensprüfung bei der Registrierung entfällt.
- Datenschutz-/Nutzungsbedingungen-Seiten: generischer Baustein mit Platzhaltern aus `vereine` (Rechtsname, Anschrift, Kontakt, Vertretung). Betreiber-Angaben der Plattform als Konstanten in einer Config-Datei, Artjom trägt sie ein.

**4.3 Passwort zurücksetzen**
- Login: „Passwort vergessen?" → Edge Function `passwort-reset` (`{ email, verein_slug }`), Antwort immer neutral.
- `PasswortNeu.tsx` (`/passwort-neu`): `onAuthStateChange` Event `PASSWORD_RECOVERY`, Passwort zweimal, Mindestlänge, `updateUser({ password })`, danach Login. Hinweis „Dein Passwort gilt für alle Vereine".
- Function: Slug validieren; Redirect-URL **nur serverseitig** aus dem Slug bauen (`https://<slug>.schichtmeisterapp.de/passwort-neu`, Boppard: `app.…`); `auth.admin.generateLink({ type: 'recovery' })`, Fehler schlucken; Mail über Resend im Vereinsdesign; einfaches Rate-Limit (z. B. 3 pro E-Mail und Stunde).

**4.4 Shop generisch** (Feature-Flag `shop`)
- Shop-Screen liest `preise` des Vereins, Einlösen über `shop_einloesen`. Profil-Gutscheindialog ebenfalls (ein Weg statt zwei).
- Admin-Tab „Prämien": Artikel anlegen/bearbeiten (Name, Beschreibung, Bild, Punktepreis, verfügbar). Admin-Bereich „Anfragen": offen/bearbeitet/abgelehnt über `shop_anfrage_bearbeiten`.
- Mail-Function `shop-anfrage` (bisher `gutschein-anfrage`) ist idempotent, mit korrektem Artikelnamen und Vereinsdesign.

**4.5 Admin-Tab „User"**
- Neuer Bereich **„Gäste zusammenführen"**: Liste der Gäste mit Vorschlägen aus `gast_vorschlaege`, Button „Zusammenführen" mit Bestätigungsdialog (zeigt, was übertragen wird), zusätzlich manuelle Auswahl über Suche. Badge in der Admin-Übersicht bei offenen Vorschlägen.
- Temp-User anlegen über `temp_user_anlegen`. „Aus Verein entfernen" (nur Mitgliedschaft). Mitgliederliste über `vereins_mitglieder`.

**4.6 Event-Typen:** Pflege im Admin (Tab Kategorien oder eigener Abschnitt), Dropdowns, Banner (`eventBanner.ts`) und Vorlagen-Zuordnung aus `event_typen`.

**4.7 Edge Functions mandantenfähig**
- Gemeinsames Mail-Layout `_shared/mail.ts`: Logo, Farbe, Vereinsname aus `vereine`; Absender „<Verein> via Schichtmeister"; Reply-To = Vereins-Admin-Mail aus `vereins_geheimnisse`; **keine Boppard-Adresse oder -Logo-URL als Fallback**. Fehlt die Adresse: loggen, nicht senden.
- `punkte-vergabe`, `schicht-reminder`: arbeiten alle Vereine ab; Verein aus `schichten.verein_id`; Einstellungen pro Verein einmal pro Lauf in einer Map cachen; try/catch pro Datensatz bzw. Verein (Fehler bei Spay blockiert Boppard nicht); je Lauf und Verein eine Zeile in `cron_laeufe`. Punkte über die neuen RPC-Signaturen mit `p_verein`. `schicht-reminder` prüft `mitgliedschaften.consent_erinnerung`. Vereinsname, Logo, Link auf die Vereins-Subdomain in der Mail.
- `schicht-zuweisung`, `shop-anfrage`: Admin-Prüfung über `ist_admin_von(verein der Schicht/Anfrage)`.
- `push-notification` **neu**: mit Prüfung (Admin des Vereins oder serverseitige Aufrufer), **VAPID-konform verschlüsselter Payload** (zum Beispiel über die Bibliothek `web-push`-kompatibel für Deno), Subscriptions nach `user_id` und `verein_id`, Titel mit Vereinsnamen. Danach `usePushNotifications.ts` und `sw.js`: Titel/Icon aus der Payload, Subscription mit `verein_id` speichern.
- `account-loeschen` v2: Modi `verein_verlassen` (self), `mitglied_entfernen` (Admin des Vereins; entfernt Mitgliedschaft und Belegungen dieses Vereins), `konto_loeschen` (self, alle Vereine). Bleibt nach dem Entfernen keine Mitgliedschaft übrig, wird das Konto (und das Gastprofil bei Gästen) vollständig gelöscht. Der letzte Admin kann sich nicht selbst entfernen. Aufrufer-Prüfung wie in der aktuell deployten Version beibehalten.
- Cron-Jobs rufen weiterhin pro Job **einen** globalen Lauf auf.

**4.8 Vercel, DNS, Supabase Auth** (Anleitung an Artjom)
- Vercel: Wildcard-Domain `*.schichtmeisterapp.de` (setzt Vercel-Nameserver voraus; sonst Subdomains `spay` und `boppard` einzeln anlegen). `app.schichtmeisterapp.de` bleibt.
- Supabase: Authentication → URL Configuration → Redirect URLs: `https://*.schichtmeisterapp.de/**` und `https://app.schichtmeisterapp.de/**`. Site URL bleibt `https://app.schichtmeisterapp.de`.

**STOP 4 – Anleitung an Artjom:** (1) Preview-Test auf echten Geräten mit Test-Accounts (Registrierung, Login, Reset-Flow, Shop, Gäste-Zusammenführung, Branding mit `?verein=`). (2) Merge `multi-mandant` → `main` (Vercel). (3) Functions deployen, in der von Claude Code genannten Reihenfolge. (4) Supabase- und Vercel-Einstellungen aus 4.8.

---

## AP 5 – DB-Switch (`sql/05_b3_switch.sql` und `sql/05_b3_rollback.sql`)

**Ausführung nur nachts, an einem Tag ohne Event.** Vorher: (1) Export der aktuellen Policies (`select * from pg_policies where schemaname = 'public'`) als Datei sichern, (2) Backup-Kopien frisch anlegen (`backup_pre_b3`-Schema, wie in Phase A), (3) `05_b3_rollback.sql` liegt fertig bereit.

**5.1 Fehlende Mitgliedschaften nachziehen** (**keine** Punkte überschreiben):
```sql
insert into public.mitgliedschaften (user_id, verein_id, is_admin, punkte, schichten_count)
select id, '5b0bba2d-0000-4000-8000-000000000001',
       coalesce(is_admin,false), coalesce(punkte,0), coalesce(schichten_count,0)
from public.profiles
on conflict (user_id, verein_id) do nothing;
```
Admin-Änderungen per SQL in der Übergangszeit müssen in **beiden** Tabellen gesetzt worden sein.

**5.2 Policy-Matrix.** Alle bestehenden Policies der Tabellen droppen und ersetzen. Muster: lesen `verein_id in (select public.meine_vereine())`; Admin `for all using/with check public.ist_admin_von(verein_id)`.

| Tabelle | Lesen | Schreiben |
|---|---|---|
| `vereine` | keine Policy (View) | Plattform-Admin/Service Role |
| `mitgliedschaften` | eigene; Admin alle des Vereins | nur über RPC/Service Role |
| `profiles` | eigene Zeile; Admin: Profile seiner Mitglieder (`ist_admin_ueber_nutzer`). `read_all` entfällt | Spaltenrechte aus dem Hotfix bleiben; `insert`: `auth.uid() = id` oder Gast durch Admin |
| `veranstaltungen`, `schichten`, `kategorien`, `punkteregeln`, `preise`, `event_typen`, `einstellungen`, `schicht_vorlagen` | Mitglieder | Admin |
| `schichtbelegungen` | `verein_der_schicht(schicht_id) in meine_vereine()` | insert/delete: eigene (Schicht im eigenen Verein) oder Admin des Schicht-Vereins; update: Admin |
| `schicht_vorlagen_positionen` | über `schicht_vorlagen.verein_id` | Admin über Vorlage; die offene Policy „Alle Zugriffe erlaubt" entfällt |
| `vereins_geheimnisse` | Admin | Admin |
| `shop_anfragen`, `gutschein_anfragen` | eigene; Admin des Vereins alle | Einlösen nur über RPC; update: Admin |
| `benachrichtigungen` | eigene | update: eigene; `service_insert` entfällt (Functions nutzen den Service-Role-Key) |
| `push_subscriptions` | eigene; „Service Role liest alle" entfällt | eigene |
| `trikot_wuensche` | unverändert (Boppard, an Feature-Flag koppeln) | unverändert |

Voraussetzung für das Entfernen von `service_insert` und „Service Role liest alle": alle Functions nutzen den Service-Role-Key (laut Quelltext der Fall; im Code nochmals prüfen).

**5.3 Constraints:** `kategorien_name_key (name)` und `push_subscriptions_user_id_key (user_id)` droppen (die neuen bestehen seit AP 3). `einstellungen` darf nicht mehr per `.single()` ohne Vereinsfilter gelesen werden (Frontend in AP 4 angepasst).

**5.4 Gutschein-Trigger** entfernen (ersetzt durch den Trigger auf `shop_anfragen`).

**STOP 5 – Anleitung an Artjom:** Ablauf (Export, Backup, Ausführen, sofort testen). Pflichttests: Isolation (Tests 1–8 unten) und Boppard-Regression (Test 14). Rollback-Datei griffbereit, Entscheidung binnen 10 Minuten.

---

## AP 6 – Cleanup (frühestens 1–2 Wochen nach AP 5)

- `verein_id`-Defaults auf allen 11 Tabellen entfernen (fehlende `verein_id` führt dann laut zu Fehlern).
- `profiles.is_admin`, `punkte`, `schichten_count`, die Consent-Spalten; `einstellungen.freischaltcode`, `admin_email`; alte Funktionssignaturen und die Brücke; Tabelle `gutschein_anfragen` (nach Übernahme) droppen.
- Schema `backup_pre_mt` und `backup_pre_b3` droppen.
- Dokumentation (`CODE_STRUKTUR.md`) aktualisieren: neue Tabellen, Hilfsfunktionen, Multi-Mandant-Fallstricke.

## AP 7 – Onboarding SV Spay

| Angabe | Wert |
|---|---|
| Rechtsname | SV Spay 1956 e. V. |
| Anschrift | Im Faller 7, 56322 Spay, Deutschland |
| Kontakt | info@svspay.de |
| Slug / Host | `spay` / `spay.schichtmeisterapp.de` |
| Erster Admin | Andy Kensy (E-Mail folgt) |
| Logo | liegt unter `docs/spay/logo.png`; leite daraus Hauptfarbe (und Sekundärfarbe) ab und zeige Artjom den Vorschlag; erzeuge Icons 192/512 |
| Offen (von Artjom) | Freischaltcode (Vorschlag liefern), Event-Arten, Shop ja/nein, Vertretung (Vorsitz) für den Datenschutztext |

Schritte: (1) Logo und Icons in den Bucket `vereins-logos`, (2) `select public.verein_anlegen('spay', 'SV Spay 1956 e. V.', '<farbe>', 'info@svspay.de', '<code>');` danach `update vereine` mit Logo-URLs, Anschrift und Features, (3) Event-Typen und Kategorien für Spay einrichten, (4) Subdomain in Vercel, (5) Andy registriert sich auf `spay.…`, Artjom setzt `mitgliedschaften.is_admin = true`, (6) Pilot mit 3–5 Helfern.
**Spay darf erst nach AP 5 angelegt werden.** Eine zweite `einstellungen`-Zeile würde vorher das alte Frontend (`.single()`) brechen.

## AP 8 – Superadmin-Konsole (später, eigene Spezifikation)

Eigenes Vercel-Projekt `admin.schichtmeisterapp.de`, gleiches Supabase-Projekt. Alle Daten über RPCs, die intern `ist_plattform_admin()` prüfen. MFA (TOTP) für das Superadmin-Konto. Umfang: Vereinsübersicht (Mitglieder, Events, letzte Aktivität), Verein anlegen als Wizard (inkl. Logo-Upload), Vereinsdetail (Admins, Code, Branding, deaktivieren), Nutzersuche über Vereine hinweg, Aktivitäten, Cron-Monitor aus `cron_laeufe`.

---

## Testplan (Mandantenisolation)

Anlegen: Verein `test` mit drei Test-Accounts. **A** nur `test`, **B** nur Boppard, **C** in beiden. Je ein Admin pro Verein. Nach den Tests `vereine.aktiv = false`.

| # | Test | Erwartung |
|---|---|---|
| 1 | B ruft Daten von `test` ab (REST mit eigenem JWT: `schichten`, `veranstaltungen`, `kategorien`, `profiles`, `preise`) | leer |
| 2 | A versucht Insert mit `verein_id` von Boppard | RLS-Fehler |
| 3 | Admin `test` ändert Schicht von Boppard | 0 Zeilen/Fehler |
| 4 | C wechselt zwischen `boppard.…` und `test.…` | je nur Daten des Vereins, Punkte getrennt |
| 5 | Admin Boppard liest `vereins_geheimnisse` von `test` | leer |
| 6 | Nicht eingeloggt: `einstellungen`, `vereins_geheimnisse`, `profiles` lesen | leer |
| 7 | User setzt per Konsole `is_admin`/`punkte` (Profil, Mitgliedschaft) | Fehler |
| 8 | `rpc('add_punkte', …)` und `rpc('shop_einloesen', …)` mit fremdem Verein | Fehler |
| 9 | Registrierung auf `test.…` mit falschem/richtigem Code | Fehler / Erfolg, Mitgliedschaft nur in `test` |
| 10 | C tritt per `verein_beitreten` bei (falscher/richtiger Code); 6 Fehlversuche | Fehler / Erfolg; Sperre |
| 11 | Passwort-Reset von `test.…`: Mail im Test-Design, Link auf `test.…/passwort-neu`, danach Login bei Boppard mit neuem Passwort | funktioniert |
| 12 | Reset für unbekannte E-Mail | identische Antwort, keine Mail |
| 13 | Push an C im Verein `test` | nur auf der `test`-PWA, Titel mit Vereinsname |
| 14 | Boppard-Regression: Anmelden/Abmelden, Cron-Punkte, Reminder, Shop, Rangliste, Vorlagen-Assistent, Zuweisungsmail | wie vor der Migration |
| 15 | PWA-Installation `test.…` auf iPhone und Android | richtiger Name und Icon |
| 16 | Shop: Einlösen mit zu wenig Punkten; doppelter Klick; Ablehnen | Fehler; nur ein Abzug; Rückbuchung genau einmal |
| 17 | Gast mit Schichten und Punkten wird mit echtem Konto zusammengeführt (inkl. Doppelbuchung derselben Schicht) | alles übertragen, Gast weg, keine Fehler |
| 18 | Event-Typ anlegen/ändern; Vorlage dazu | funktioniert nur im eigenen Verein |
| 19 | Letzter Admin versucht sich zu entfernen | blockiert |
| 20 | Cron-Lauf (`punkte-vergabe`, `schicht-reminder`) mit Daten in beiden Vereinen | beide korrekt, Zeilen in `cron_laeufe`, Fehler in einem Verein blockieren den anderen nicht |

## Definition of Done

- Alle Tests bestanden, auf echten Geräten.
- Kein Zugriff auf Daten fremder Vereine über die REST-API.
- Keine Function ist ohne Prüfung des Aufrufers erreichbar (Ausnahme: öffentliche Branding-View).
- Boppard-Betrieb unverändert (eine Woche ohne Support-Meldung).
- Spay-Admin und Pilot-Helfer können sich registrieren, Schichten buchen, Passwort zurücksetzen.
- `CODE_STRUKTUR.md` aktualisiert.
