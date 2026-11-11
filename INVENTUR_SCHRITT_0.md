# Schichtmeister Multi-Mandant: Schritt 0 (Inventur)

Stand: Branch `multi-mandant`, nur gelesen, nichts geändert.
Regel für Vercel-Preview-Hosts: `*.vercel.app` wird beim Erkennen des Vereins wie `localhost` behandelt (erst `?verein=`, sonst Boppard). Das kommt in `slugAusHost()` in B2.1.

## Abweichungen zwischen Dokument und Code

1. **Es gibt kein `supabase/functions/` im Repo.** Punkt 8 kann nur über die Aufrufe im Frontend beantwortet werden. Für B2.6 wird der Quellcode der Edge Functions gebraucht.
2. **`src/screens/.env.local` ist im Git getrackt.** Sie enthält `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`. Der Anon-Key ist öffentlich, aber die Datei liegt am falschen Ort, Vite liest sie dort nicht. `Verwaltung.tsx` und `Profil.tsx` nutzen `import.meta.env.VITE_*`, das funktioniert nur, wenn Vercel diese Variablen gesetzt hat. `supabaseClient.ts` hat URL und Key dagegen hartkodiert.
3. **Es gibt keinen Passwort-vergessen-Callback.** `Login.tsx` ruft `resetPasswordForEmail(email)` ohne `redirectTo` auf. Es gibt keine Route `/passwort-neu` und keinen `PASSWORD_RECOVERY`-Handler. Der Link führt heute auf die Site URL, der Nutzer kann dort kein neues Passwort setzen.
4. **`public/index.html` ist ein CRA-Überbleibsel** und wird nicht verwendet. Maßgeblich ist die `index.html` im Root (Vite).
5. **Es gibt keinen Router.** `App.tsx` schaltet Tabs per State um. Für `/passwort-neu` reicht ein Pfad-Check, `react-router` ist nicht nötig.
6. **Das Frontend nutzt `profiles` an Stellen, die der Hotfix vermutlich blockiert.** `Shop.tsx:45` schreibt `profiles.punkte` direkt. `Verwaltung.tsx:241` fügt ein Temp-Profil mit `is_admin` und `punkte` ein. Laut Hotfix gibt es Spaltenrechte auf `profiles`. Ob beides in Produktion noch läuft, ist nicht prüfbar und sollte getestet werden.
7. **`einstellungen` ist heute ein Singleton.** `.single()` steht in `Login`, `Shop`, `Profil` und `Verwaltung`, dazu `upsert({ id: 1 })` in `Verwaltung`. Mit mehreren Vereinen schlägt `.single()` fehl, solange RLS noch nicht greift. Diese Aufrufe müssen auf `.eq('verein_id', …)` umgestellt werden.
8. **`Einstellungen` in `types.ts` passt nicht zu `Profil.tsx`.** `Profil` nutzt `food_pts`, `food_val`, `shop_pts` und `shop_val`. Diese Felder stehen nicht im Interface (der Code kompiliert vermutlich nur, weil Vite nicht typprüft).

## 1. Tabellenzugriffe (Datei, Tabelle, Art)

| Datei | Zugriffe |
|---|---|
| `App.tsx` | `profiles` select `*` (eigene Zeile). `benachrichtigungen` select und update (`gelesen`). |
| `usePushNotifications.ts` | `push_subscriptions` **upsert `onConflict: 'user_id'`** (Zeile 51–57), delete per `user_id`. |
| `Home.tsx` | `schichten` select. `schichtbelegungen` select (eigene). **`profiles` select `punkte` für alle** (Rang). |
| `Login.tsx` | **`einstellungen` select `freischaltcode` (`.single()`)**. **`profiles` select** per E-Mail und per Name (Duplikatprüfung). |
| `Marktplatz.tsx` | `schichten` select und update (`belegt`). `schichtbelegungen` select, insert, update. `kategorien` select. `veranstaltungen` select. |
| `MeineSchichten.tsx` | `schichtbelegungen` select und update. `schichten` update (`belegt`). |
| `Profil.tsx` | `schichtbelegungen` select. `einstellungen` select (`.single()`). `gutschein_anfragen` insert. **rpc `punkte_abziehen`**. `profiles` update (`display_name`). |
| `Rangliste.tsx` | **`profiles` select `id, name, punkte, schichten_count`** (Top 5, alle User). |
| `Shop.tsx` | `einstellungen` select. `profiles` select und **update `punkte`**. `gutschein_anfragen` insert. |
| `Verwaltung.tsx` | `schichtbelegungen` select, insert, update, delete. `profiles` select `*` (alle), select (Duplikate), **insert (Temp-User)**. `veranstaltungen` select, insert, delete. `schichten` select, insert, update, delete. `einstellungen` select und **upsert `{id:1, freischaltcode}`**. `kategorien` select, insert, delete. `schicht_vorlagen` select, insert, delete. `schicht_vorlagen_positionen` insert, delete. **rpc `add_punkte`**. |

- Es gibt **keinen** `onConflict` auf `kategorien`. Der einzige Upsert dort ist `einstellungen` mit `id:1`.
- `preise`, `punkteregeln`, `shop_anfragen` und `trikot_wuensche` werden vom Frontend gar nicht angesprochen. `ShopArtikel`, `ShopAnfrage` und `Punkteregel` stehen nur in `types.ts`. Der Shop läuft über die hartkodierte Liste `ARTIKEL` in `Shop.tsx`.

## 2. `is_admin`, `punkte` und `schichten_count` auf dem Profil

- **`is_admin`:** `App.tsx:119` (Admin-Tab) und `App.tsx:339` (Verwaltung rendern). `Verwaltung.tsx:244` schreibt `is_admin: false` beim Temp-User.
- **`profile.punkte` (lesend):** `App.tsx:293`, `Home.tsx:37,42`, `Profil.tsx:80,119,183`, `Shop.tsx:28`, `Verwaltung.tsx:1034`.
- **Schreibend:** `Shop.tsx:45` (`profiles.update({punkte})`), `Profil.tsx:119` (nur lokaler State), `Verwaltung.tsx:244`.
- **`profile.schichten_count`:** `Home.tsx:101` (Anzeige), `Rangliste.tsx:14,112`, `Verwaltung.tsx:244`.
- **Nicht verwechseln:** `kategorien.schichten_count` (`Verwaltung.tsx:151–954`) ist etwas anderes und bleibt.

Umbau: `App.tsx` lädt zusätzlich `mitgliedschaften` für den aktuellen Verein und reicht `mitgliedschaft` an alle Screens weiter (`screenProps`). Das `Profile`-Interface verliert `punkte`, `schichten_count` und `is_admin`.

## 3. Profile anderer User lesen

| Stelle | Zweck | Ersatz |
|---|---|---|
| `Rangliste.tsx:12` | Top 5 | `rpc('rangliste', {p_verein})` mit `.slice(0,5)` im Client |
| `Home.tsx:35` | Rang berechnen (lädt **alle** Punktestände) | gleiche RPC |
| `Verwaltung.tsx:85` | Mitgliederliste (`select *`, Punkte, E-Mail) | neue RPC `vereins_mitglieder(p_verein)` |
| `Verwaltung.tsx:84` | `schichtbelegungen` mit Join `profiles(name)` (Punkte-Vergabe) | RLS auf `profiles` (B3) bricht diesen Join. Ersatz: RPC oder `schicht_teilnehmer` |
| `Verwaltung.tsx:235,239`, `Login.tsx:67,80` | Duplikatprüfung E-Mail und Name | siehe Punkt 4, in `Login` wird sie unbrauchbar |

Die Rangliste filtert heute **nicht** nach `consent_rangliste` oder Temp-User. Sie zeigt die 5 höchsten Punktestände. Die RPC aus B1.6 filtert nach `consent_rangliste = true`, das ändert das Verhalten. Vorschlag: in der RPC zusätzlich `is_temp` ausschließen (Klärung bei B1).

## 4. Registrierung in `Login.tsx`

- **Freischaltcode:** Er wird **clientseitig** geprüft (`Login.tsx:55–64`). Die App liest `einstellungen.freischaltcode` mit dem Anon-Key und vergleicht ihn im Browser.
- **Wofür:** Er schützt nur die **Registrierung**. Mit Admin-Rechten hat er nichts zu tun, `is_admin` wird nur per SQL gesetzt.
- **Schwäche:** Der Code ist für nicht eingeloggte Besucher lesbar, solange `einstellungen` öffentlich lesbar ist. Ein direkter `auth.signUp`-Aufruf umgeht die Prüfung ohnehin. B1.9 (serverseitig in `handle_new_user`) ist die passende Lösung, eine Rückfrage ist dafür nicht nötig.
- **Duplikatprüfung vor dem `signUp`:** Sie läuft als anonymer Select auf `profiles` und funktioniert nur, weil `profiles` heute offen lesbar ist (`read_all`). Nach B3 liefert sie immer leer. Die E-Mail-Prüfung entfällt ohnehin (B2.4a). Die Namensprüfung ist pro Verein sinnvoll, geht aber nur noch serverseitig oder gar nicht. **Entscheidung für B2.**
- **Metadaten:** Das `signUp` sendet nur `name` und `display_name`. `verein_slug` und `freischaltcode` fehlen noch.
- **Consents:** Die drei Checkboxen (Rangliste, Datenschutz, Erinnerung) werden nur im UI erzwungen. `handle_new_user` setzt alle Consent-Flags auf `false`. Es gibt keine Stelle, die sie später auf `true` setzt. Heute sind die Einwilligungen in der DB nirgends dokumentiert. Relevant für B2.4a Punkt 5.
- **E-Mail-Bestätigung:** Nach dem `signUp` zeigt die App den Screen „Erfolg" mit dem Hinweis, die Adresse per Mail zu bestätigen. Es gibt keine eigene Callback-Behandlung, Supabase leitet auf die Site URL.
- **Temp-User:** `Verwaltung.tsx:231–249` legt per `profiles.insert` eine Zeile mit `crypto.randomUUID()` an, ohne `auth.users`-Eintrag. Die Zeile hat `is_temp: true`, `temp_typ` und die Fake-E-Mail `temp_<ts>@ssv-boppard.intern`. Die Domain muss generisch werden, außerdem muss eine Mitgliedschaft entstehen. Ob `profiles.id` einen Foreign Key auf `auth.users` hat, ist aus dem Code nicht ersichtlich (der Insert funktioniert offenbar, also vermutlich nein). Das gehört in die Verifikation.

## 5. RPC-Aufrufe

| Aufruf | Stelle | Wer |
|---|---|---|
| `add_punkte(user_id, amount)` | `Verwaltung.tsx:112` (`givePoints`) | Admin im UI |
| `punkte_abziehen(user_id, amount)` | `Profil.tsx:91` (Gutschein einlösen) | Mitglied selbst |
| `increment_schichten_count` | **kein Aufruf im Frontend** | vermutlich nur Edge Function oder Trigger |

- `Shop.tsx` zieht Punkte nicht per RPC ab, sondern per `profiles.update`. Das ist die zweite, abweichende Variante.
- In `Profil.tsx:83–94` laufen `insert` in `gutschein_anfragen` und Punkteabzug nacheinander ohne Transaktion. Bestehendes Risiko, außerhalb des Auftrags.

## 6. Farben und Vereinsnamen

**Hex-Farben (Anzahl, ohne `rgba`):** `Verwaltung.tsx` 218, `Marktplatz.tsx` 85, `Profil.tsx` 68, `App.tsx` 50, `Shop.tsx` 46, `Home.tsx` 43, `Login.tsx` 39, `MeineSchichten.tsx` 38, `styles.css` 32, `Rangliste.tsx` 28, `eventBanner.ts` 12, `NotificationToggle.tsx` 11. Dazu `index.html` (`theme-color`) und `manifest.json` (`theme_color`).

- Kein Tailwind, alles sind Inline-Styles plus `styles.css`.
- `#0d631b` (Primärgrün) kommt 121-mal vor, `#e8f5ee` (helles Grün) 46-mal. Weitere Grüntöne: `#1a7a4a`, `#1a7a1a`, `#145214`, `#166534`, `#15803d`, `#084d13`.
- Neutralgrau (`#9ca3af`, `#f3f4f6`, `#5d5e61`, `#f8faf8`) und Rot (`#ef4444`, `#fef2f2`) bleiben fest.
- `styles.css` definiert in `:root` schon `--primary: #0d631b`, `--primary-dark: #084d13` und `--primary-light: #e8f5ee`. Die Screens nutzen die Variablen nur nicht.
- `body { background: #f8faf8 }` ist ein leicht grünlicher Grauton, den ich als Teil der Marke behandeln würde.

**Namen und Logo:**

- `public/LOGO-SSV-BOPPARD-_1_.png` wird in `App.tsx:105,139` und `Login.tsx:181` geladen.
- „SSV Boppard" steht in `App.tsx:107,147`, `Login.tsx:136,184,185` („Schichtplaner 1920 e.V."), `Marktplatz.tsx:328`, `Profil.tsx:34`, `Shop.tsx:17–19`, `index.html:25,27`, `manifest.json:2,4`.
- Kontaktadressen: `info@ssv-boppard.de` (`Login.tsx:140`, Datenschutztext) und `geschaeftsfuehrung@ssv-boppard.de` (`Shop.tsx:22`, ungenutzt).
- Fake-Domain `@ssv-boppard.intern` in `Verwaltung.tsx:243`.
- Platzhaltertexte mit „Boppard": `Verwaltung.tsx:654` (Ort), `:984` und `:991` (`admin_email` und Freischaltcode).
- Die Datenschutzerklärung in `Login.tsx:135–141` ist komplett Boppard-spezifisch („Verantwortlicher: SSV Boppard 1920 e.V."). Für Spay braucht sie vereinsspezifische Texte, vermutlich aus einer neuen Spalte in `vereine`.
- `sw.js`: kein Vereinsname, aber `icon: '/icon-192.png'`, Titel-Fallback „Schichtmeister".
- `index.html`: `apple-mobile-web-app-title` ist „Schichtmeister" und generisch.
- Shop-Artikel (`Shop.tsx:17–19`) sind fest eingebaut: Boppard-Kiosk, Fanshop und „Heimtrikot 2025". Dazu kommt `VOUCHERS` in `Profil.tsx` („Im SSV Boppard Online-Fanshop"). Das ist vereinsspezifischer Inhalt, nicht nur Branding. **Entscheidung nötig** (siehe Rückfragen).

## 7. Hartkodierte Event-Typen

- `eventBanner.ts`: Typ `Kategorie` und Map mit 4 Typen (Gradient, Icon, Label). Die Gradients nutzen Boppard-Grün. `getBanner` fällt auf `heimspiel` zurück.
- `types.ts:29`: Union-Typ auf `Veranstaltung.kategorie`.
- `Marktplatz.tsx:175–177`: `getBanner(ev.kategorie)`, plus Sonderfall `isVereinsfest`.
- `Verwaltung.tsx`: Defaults `'heimspiel'` (Zeilen 24, 124, 367, 397), zwei hartkodierte `<select>`-Listen (643–647 Event, 821–825 Vorlage, in unterschiedlicher Reihenfolge), Vorlagen-Filter nach `event_typ === newEv.kategorie` (682, 690) und Emoji-Auswahl per Verschachtelung (840).
- `Einstellungen` kennt `bonus_turnier` und `bonus_fest`, ebenfalls typgebunden.

Minimaler Weg für Spay: Der CHECK-Constraint bleibt vorerst, Spay nutzt die vier vorhandenen Typen. Erst bei konkretem Bedarf kommt `event_typen` (B1.10). Das bleibt eine Frage an Spay.

## 8. Edge Functions (nur indirekt sichtbar)

| Function | Aufrufer im Frontend | Auth-Header | Body |
|---|---|---|---|
| `schicht-reminder` | `Verwaltung.tsx:68` (Testmail) | Anon-Key | `{test_mode, test_email}` |
| `schicht-zuweisung` | `Verwaltung.tsx:264` (bei Zuweisung), `:68` (Test) | Anon-Key | `{mitglied_id, schicht_id, admin_id}` (IDs aus dem Client) |
| `gutschein-anfrage` | `Profil.tsx:101`, `Verwaltung.tsx:68` (Test) | User-JWT, im Test Anon-Key | `{mitglied_id, typ, punkte}` |
| `account-loeschen` | `Profil.tsx:162` (selbst), `Verwaltung.tsx:285` (Admin) | User-JWT | `{userId}` optional |
| `punkte-vergeben`, `punkte-vergabe`, `push-notification` | nicht vom Frontend | – | Cron bzw. Trigger |

**Unbekannt, weil der Code fehlt:** welcher Key intern verwendet wird, ob der Aufrufer geprüft wird, welche Tabellen angefasst werden, wo `admin_email` oder Absender stehen.

**Auffällig:** `schicht-zuweisung` wird mit dem Anon-Key aufgerufen. Falls die Function dem Body vertraut, kann jeder mit dem Anon-Key fremde Zuweisungsmails auslösen. Das ist am Function-Code zu prüfen.

## 9. Auth, Passwort-Reset und E-Mail-Bestätigung

- `resetPasswordForEmail(email)` ohne `redirectTo` (siehe Abweichung 3).
- Kein `PASSWORD_RECOVERY`-Handling, keine Route `/passwort-neu`.
- Passwort ändern geht nur eingeloggt (`Profil.tsx:145`, `updateUser`).
- Die E-Mail-Bestätigung läuft komplett über Supabase-Default. Das Frontend zeigt nur den Hinweisscreen.
- Anmeldefehler werden pauschal als „E-Mail oder Passwort falsch" angezeigt. Eine nicht bestätigte Adresse bekommt dieselbe Meldung.

## 10. Push und Service Worker

- `usePushNotifications.ts`: Der VAPID-Public-Key ist hartkodiert (öffentlich, in Ordnung). `subscribe()` registriert `/sw.js`, fragt die Erlaubnis ab und speichert per **Upsert `onConflict: 'user_id'`** `{user_id, endpoint, p256dh, auth, updated_at}`. Das heißt: **eine Subscription pro User**. Ziel ist `onConflict: 'user_id,verein_id'`, der Unique-Constraint dafür kommt in B1.7. `unsubscribe()` löscht per `user_id`, auch das muss auf den Verein eingegrenzt werden.
- `sw.js`: Cache-Name `schichtmeister-v1`, Network-First, ignoriert `supabase.co`. Der Push-Handler nimmt `title`, `body`, `url` und `tag` aus der Payload. **Das Icon ist fest `/icon-192.png`** (mit `badge`), Titel-Fallback „Schichtmeister". Das Icon muss aus der Payload kommen oder über die dynamische Icon-URL pro Host geliefert werden.
- Der Service Worker wird zweimal registriert (`index.html` und im Hook). Funktional unkritisch.
- `app.schichtmeisterapp.de` bleibt für Boppard bestehen, bestehende Subscriptions bleiben dadurch gültig. Jede Subdomain hat eine eigene Origin und damit eine eigene Subscription.

## Was pro Datei angepasst werden muss

| Datei | Anpassung |
|---|---|
| **neu** `VereinContext.tsx` | Slug aus Host. Alias `app`, `www` → `boppard`. `localhost` **und `*.vercel.app`** → `?verein=` oder `boppard`. `vereine_public` laden, Cache, CSS-Variablen, Titel, Icons, Fehlerseite. |
| `index.tsx` | `VereinProvider` einhängen. |
| `App.tsx` | `mitgliedschaft` laden, `is_admin` und `punkte` daraus. Logo und Name aus dem Kontext. Beitreten-Screen. Pfad-Check für `/passwort-neu`. Vereinswechsler. 50 Farben auf Variablen. |
| `Login.tsx` | Logo, Name und Datenschutztext aus dem Verein. `signUp` mit `verein_slug` und `freischaltcode`. Clientseitige Codeprüfung und Duplikat-Selects entfernen. Fälle „E-Mail bekannt" (B2.4a). Reset über Edge Function. |
| **neu** `PasswortNeu.tsx` | siehe B2.5 |
| `Home.tsx` | `punkte` und `schichten_count` aus der Mitgliedschaft. Rang über die RPC. Selects mit Vereinsfilter. |
| `Rangliste.tsx` | RPC statt `profiles`. |
| `Shop.tsx` | `profiles.update` ersetzen durch `punkte_abziehen`-RPC. Artikel und Texte pro Verein. `einstellungen` ohne `.single()`. |
| `Profil.tsx` | `punkte_abziehen` mit `p_verein`. `VOUCHERS`-Texte pro Verein. `gutschein_anfragen.insert` mit `verein_id`. Vereinswechsler. |
| `Verwaltung.tsx` | Größter Umbau (1268 Zeilen). Mitgliederliste über RPC. `add_punkte` mit `p_verein`. Alle `insert` mit `verein_id`. Temp-User mit Mitgliedschaft. `einstellungen` ohne `id:1`. Freischaltcode und `admin_email` aus `vereins_geheimnisse`. Event-Typen. 218 Farben. |
| `Marktplatz.tsx`, `MeineSchichten.tsx` | `insert` und `select` mit `verein_id`. Farben. Text „Der SSV Boppard freut sich". |
| `usePushNotifications.ts` | Upsert-Key und Delete mit `verein_id`. |
| `NotificationToggle.tsx` | Verein durchreichen, Farben. |
| `eventBanner.ts` | Gradients aus Vereinsfarben ableiten. |
| `types.ts` | `Profile` ohne Punkte und Admin, neue Typen `Mitgliedschaft` und `Verein`, korrigiertes `Einstellungen`. |
| `styles.css` | Variablen um `--secondary` erweitern, feste Farben ersetzen. |
| `index.html` | Titel, Beschreibung und `theme-color` neutral. Icons per JS setzen. |
| `public/manifest.json` | Ersetzen durch `api/manifest.ts` mit Redirect in `vercel.json`. |
| `public/sw.js` | Icon und Badge aus der Payload. |
| `vercel.json` | `/manifest.json` → `/api/manifest` |
| **neu** `api/manifest.ts`, Edge Functions | siehe B2.3, B2.5, B2.6 |
| `sql/03_b1_additiv.sql` | folgt nach Freigabe |

## Offen vor B1

1. Verifikations-SQL aus Abschnitt 2 des Plans ausführen und das Ergebnis liefern.
2. Quelltext der Edge Functions (`punkte-vergeben`, `punkte-vergabe`, `schicht-reminder`, `schicht-zuweisung`, `gutschein-anfrage`, `account-loeschen`, `push-notification`) ins Repo unter `supabase/functions/` legen oder schicken.
3. Entscheidungen:
   - **Shop und Gutscheine:** Die Artikel in `Shop.tsx` und `VOUCHERS` in `Profil.tsx` sind Boppard-Inhalte. Für Spay (a) ausblenden per Feature-Flag `shop`, (b) aus `preise` und `einstellungen` laden oder (c) vorerst unverändert lassen?
   - **Datenschutzerklärung:** Text pro Verein in einer neuen Spalte (z. B. `vereine.datenschutz_text`)? Spay braucht eigenen Verantwortlichen und Kontakt.
   - **Einwilligungen:** pro Mitgliedschaft mit Zeitstempel speichern (Empfehlung aus B2.4a Punkt 5)? Heute werden sie nirgends gespeichert.
   - **Rangliste:** Temp-User ausschließen? (Heute werden sie bei hohen Punkten angezeigt.)
   - **Namensprüfung bei der Registrierung:** entfällt oder bleibt serverseitig pro Verein?

Weiter geht es erst nach Freigabe dieser Inventur.
