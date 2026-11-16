# AP 5: DB-Switch, Vorbereitung und Testplan

Stand: 2026-11-11. Der Switch (`sql/05_b3_switch.sql`) schaltet Row Level Security pro Verein scharf.
Er ist der riskanteste Schritt des Umbaus. Zeitpunkt: **nach den zwei großen Events Ende November,
nachts, an einem Tag ohne Event.** Alle Dateien sind geschrieben, keine ist ausgeführt.

## 0. Befund vom 2026-11-11: Daten sind heute ohne Login lesbar

Mit dem öffentlichen Anon-Key (steht im Frontend) liefert die REST-Schnittstelle ohne Anmeldung:

| Tabelle | Zeilen | Inhalt |
|---|---|---|
| `profiles` | 76 | Namen, E-Mail-Adressen, Punkte aller Mitglieder |
| `einstellungen` | 1 | **Freischaltcode und Admin-Mail** |
| `schichtbelegungen` | 119 | wer wann arbeitet |
| `schichten` | 88 | |
| `push_subscriptions` | 2 | Endpunkte und Schlüssel von Browser-Abos |
| `preise` | 3 | |

Das ist kein neuer Fehler (offene Policy `read_all`), das Schreiben ist seit `01_hotfix` geschlossen, das
Lesen nicht. **Sofortmaßnahme: `sql/04k_anonym_sperren.sql`**, unabhängig vom Switch ausführbar (siehe unten).
Der eigentliche Schutz zwischen Mitgliedern und Vereinen kommt erst mit dem Switch.

## 1. Reihenfolge

| # | Schritt | Wann | Datei |
|---|---|---|---|
| 1 | Anonymen Lesezugriff sperren | **jederzeit, empfohlen vor den Events** | `04k_anonym_sperren.sql` |
| 2 | Hilfsfunktionen für den Switch | jederzeit, rein additiv | `04j_switch_hilfsfunktionen.sql` |
| 3 | Frontend umbauen (Verwaltung, Marktplatz, Gäste) | nach den Events, in Teilen | siehe Abschnitt 3 |
| 4 | Backup-Kopien (`backup_pre_b3`) | am Tag des Switchs, vorher | Abschnitt 4 |
| 5 | **Switch** | nachts, ohne Event | `05_b3_switch.sql` |
| 6 | Pflichttests | sofort danach | Abschnitt 5 |
| 7 | Bei Problemen: Rollback | binnen 10 Minuten entscheiden | `05_b3_rollback.sql` |

Spay wird erst **nach** dem Switch angelegt (`verein_anlegen` ist bis dahin gesperrt).

## 2. Warum 04k und der Switch getrennt sind

`04k` fügt **restriktive** Policies hinzu (`auth.uid() is not null`). Sie ändern keine bestehende Policy und
lassen sich mit sechs `drop policy` zurücknehmen. Angemeldete Nutzer sehen weiter alles wie bisher.
Was `04k` **nicht** löst: Ein eingeloggtes Mitglied kann weiter alle Profile und Belegungen lesen.
Das schließt erst der Switch.

Vor `04k` ausführen (nur lesen, Besitzer der Funktionen prüfen, siehe Kontrolle 1b in der Datei):
Gehören `handle_new_user` und `sync_belegt` dem Benutzer `postgres`, laufen Registrierung und Anmeldungen
unverändert. Sonst melden.

Nebenwirkung: Eine sehr alte App-Version (vor 2026-11-09) liest den Freischaltcode vor der Registrierung ohne
Login. Damit scheitert dort nur die Registrierung, bis die App sich aktualisiert.

## 3. Vor dem Switch muss das Frontend fertig sein

Der Switch läuft **ohne** Frontend-Rollback. Das Frontend muss daher mit alter **und** neuer Policy-Welt
funktionieren. Diese Stellen brechen sonst:

| Stelle | Problem nach dem Switch | Lösung (noch offen, außer wo vermerkt) |
|---|---|---|
| `Marktplatz.tsx:58` Join `profiles(name, display_name)` | "Bereits dabei" zeigt "Unbekannt" für alle anderen | `rpc('schicht_teilnehmer')` (04j) |
| `Verwaltung.tsx:91` Join `profiles(name)` | Punktevergabe-Liste ohne Namen | `rpc('belegungen_offen')` (04j) |
| `Verwaltung.tsx:92` `profiles select *` | Mitgliederliste leer bis auf eigene Zeile | `rpc('vereins_mitglieder')` (04j) |
| `Verwaltung.tsx:242/246` Duplikat-Prüfung | liefert immer "leer" | entfällt, `temp_user_anlegen` prüft serverseitig |
| `Verwaltung.tsx:248` `profiles insert` (Gast) | wird abgelehnt (`id = auth.uid()` trifft nicht zu) | `rpc('temp_user_anlegen')` (04b) |
| `Verwaltung.tsx:119` `add_punkte(user_id, amount)` | funktioniert über die Brücke, schreibt aber nur Boppard | später `add_punkte(p_user, p_verein, p_amount)` |
| `Verwaltung.tsx:212` `einstellungen upsert {id:1}` | nur für Boppard richtig | mit `verein_id` arbeiten |
| `Verwaltung.tsx:265/356` `schichten.update({ belegt })` | wirkungslos seit `01_hotfix` (Trigger `sync_belegt` macht das) | entfernen |
| Alle `insert` in Verwaltung auf vereinsbezogene Tabellen | `verein_id` kommt aus dem Default (Boppard); für Spay falsch | `verein_id` aus dem Kontext mitsenden |
| `usePushNotifications.ts` `onConflict: 'user_id'` | bricht, sobald die alte Constraint fällt | **erledigt** (Branch `vorbereitung-ap5`, `user_id,verein_id`) |
| `einstellungen .single()` in Profil, Shop, Verwaltung | bricht mit zweitem Verein | `.eq('verein_id', …)` |

Außerdem: `Shop.tsx` und `Profil.tsx` legen `gutschein_anfragen` noch direkt an. Die Policy dafür bleibt im Switch
erhalten (`gutschein_anfragen_anlegen`), bis der generische Shop (4.4) live ist.

## 4. Am Tag des Switchs

1. **Tag ohne Event**, Uhrzeit nachts, nicht um 01:00 oder 09:00 Uhr (Cron).
2. **Sicherung:** Supabase-Backup anlegen (Dashboard, Database, Backups) **und** die Backup-Kopien:
   ```sql
   create schema if not exists backup_pre_b3;
   create table backup_pre_b3.profiles                    as select * from public.profiles;
   create table backup_pre_b3.mitgliedschaften            as select * from public.mitgliedschaften;
   create table backup_pre_b3.schichten                   as select * from public.schichten;
   create table backup_pre_b3.schichtbelegungen           as select * from public.schichtbelegungen;
   create table backup_pre_b3.veranstaltungen             as select * from public.veranstaltungen;
   create table backup_pre_b3.einstellungen               as select * from public.einstellungen;
   create table backup_pre_b3.gutschein_anfragen          as select * from public.gutschein_anfragen;
   create table backup_pre_b3.shop_anfragen               as select * from public.shop_anfragen;
   ```
   (Der Switch bricht ab, wenn `backup_pre_b3.profiles` fehlt.)
3. **Policies sichern:** macht `05_b3_switch.sql` selbst (Tabelle `backup_pre_b3.policies`). Zusätzlich vorher
   als Datei speichern: `select * from pg_policies where schemaname = 'public';` (Ergebnis kopieren).
4. **Punkte-Kontrolle** muss 0 liefern (Abschnitt unten).
5. `05_b3_rollback.sql` **geöffnet bereithalten**.
6. Zwei Test-Konten, eines davon Admin, und ein Handy mit der App.

Punkte-Kontrolle (profiles gegen mitgliedschaften, muss 0 liefern):
```sql
select count(*) from public.profiles p join public.mitgliedschaften m
  on m.user_id = p.id and m.verein_id = '5b0bba2d-0000-4000-8000-000000000001'
 where coalesce(p.punkte,0) <> m.punkte or coalesce(p.schichten_count,0) <> m.schichten_count;
```
Admin-Kontrolle (muss 0 Zeilen liefern):
```sql
select p.id from public.profiles p join public.mitgliedschaften m
  on m.user_id = p.id and m.verein_id = '5b0bba2d-0000-4000-8000-000000000001'
 where coalesce(p.is_admin,false) <> m.is_admin;
```

## 5. Pflichttests direkt nach dem Switch

Reihenfolge einhalten. Bei jedem Fehler sofort Rollback erwägen (binnen 10 Minuten).

### A. Boppard-Regression (mit Test-Account, dann mit Admin)

| # | Test | Erwartung |
|---|---|---|
| A1 | Login, Home | Punkte, Schichtzahl, Rang wie vorher |
| A2 | Marktplatz laden, Schicht öffnen | "Bereits dabei" zeigt **Namen**, nicht "Unbekannt" |
| A3 | Anmelden, Abmelden | Platz belegt und wieder frei, ohne Fehler |
| A4 | Rangliste | Top 5 ohne Gäste |
| A5 | Profil, Konto bearbeiten | Name speichern geht |
| A6 | Shop: Gutschein einlösen | Punkte sinken, Mail kommt einmal |
| A7 | Admin: Tab Admin | Mitgliederliste mit Namen und Punkten, "Unbestätigt" sichtbar |
| A8 | Admin: Punkte vergeben | Name in der Liste, Punkte gebucht |
| A9 | Admin: Gast anlegen | geht (über `temp_user_anlegen`), sonst Fehler **vor** dem Switch beheben |
| A10 | Admin: Schicht zuweisen | Mail kommt, Belegung erscheint |
| A11 | Admin: Event und Schicht anlegen, wieder löschen | geht |
| A12 | Nacht danach: Cron `punkte-vergabe`, `schicht-reminder` | Function-Logs zeigen 200 |
| A13 | Push-Schalter an und aus | kein Fehler in der Konsole |

### B. Isolation (mit einem zweiten Verein nur nach Spay möglich; vorher als Anonym und als Nutzer)

| # | Test | Erwartung |
|---|---|---|
| B1 | Ohne Login `profiles`, `einstellungen`, `vereins_geheimnisse`, `schichten`, `schichtbelegungen`, `preise`, `push_subscriptions` abfragen | überall `[]` |
| B2 | Als normales Mitglied `profiles` abfragen | **nur die eigene Zeile** |
| B3 | Als normales Mitglied `mitgliedschaften` abfragen | nur die eigene |
| B4 | Als normales Mitglied `is_admin` oder `punkte` in `profiles` und `mitgliedschaften` setzen | Fehler |
| B5 | Als Mitglied `rpc('add_punkte', …)` | Fehler "nicht erlaubt" |
| B6 | Als Mitglied `vereins_geheimnisse` lesen | leer |
| B7 | Als Mitglied `gutschein_anfragen` lesen | nur die eigenen |

Abfrage von außen (Terminal, mit eigenem JWT für B2 bis B7; B1 geht mit dem Anon-Key, siehe `04k`):
```
curl -s "https://kfawjltveddyoqewayzh.supabase.co/rest/v1/profiles?select=id&limit=5" \
     -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <JWT des Test-Accounts>"
```
Das JWT des Test-Accounts steht nach dem Login im Browser unter Entwicklertools, Anwendung, Lokaler Speicher,
Eintrag `sb-…-auth-token`, Feld `access_token`. **Nicht weitergeben und nicht speichern**, es gilt eine Stunde.

### C. Nach Spay (AP 7), mit Test-Verein

Die Tests 1 bis 20 aus `PHASE_B_MULTI_MANDANT.md` (Testplan Mandantenisolation) gelten unverändert. Voraussetzung:
Verein `test` mit drei Konten (A nur `test`, B nur Boppard, C in beiden) und je einem Admin.

## 6. Rollback

`sql/05_b3_rollback.sql` spielt die Policies aus `backup_pre_b3.policies` zurück, mit Selbsttest (Anzahl).
Das Frontend bleibt unverändert. Daten gehen nicht verloren. Entscheidung binnen 10 Minuten, weil danach
Anmeldungen und Punkte unter den neuen Regeln entstehen.

## 7. Bekannte Grenzen (ehrlich)

- Die SQL-Dateien sind mit dem Postgres-Parser (`libpg-query`) auf **Syntax** geprüft, **nicht** gegen die echte
  Datenbank ausgeführt. Falsche Spaltennamen oder Rechteprobleme zeigen sich erst beim Ausführen. Deshalb laufen
  Switch und Rollback in einer Transaktion: Ein Fehler ändert nichts.
- `einstellungen` enthält bis AP 6 weiter Freischaltcode und Admin-Mail, und jedes Mitglied seines Vereins kann
  die Zeile lesen. Ein Mitglied kann den Code also einem Dritten weitergeben. Das ist heute auch so.
- Der Rollback legt die alten Unique-Constraints nur zurück, solange es einen Verein gibt.
- `trikot_wuensche` hat "Public insert/read" und ist nicht Teil des Switchs. Ob die Wunschliste öffentlich bleiben
  soll, ist offen.
