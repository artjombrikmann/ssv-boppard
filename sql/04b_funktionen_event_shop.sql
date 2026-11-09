-- =====================================================================
-- 04b: Multi-Mandant B1 (additiv), Teil 2 "Funktionen, Event-Typen, Shop"  (AP 3)
--
-- VORAUSSETZUNG: 04a_grundlagen.sql ist ausgeführt.
--
-- Für die laufende App unsichtbar: neue Tabellen/Funktionen/Spalten, die das
-- aktuelle Frontend nicht kennt. Zwei Ausnahmen sind bewusst eingebaut:
--   * Die ALTEN Signaturen add_punkte / punkte_abziehen / increment_schichten_count
--     werden ersetzt (gleiche Signatur, gleiche Rechteprüfung) und schreiben
--     zusätzlich in die Boppard-Mitgliedschaft ("Brücke", bis AP 6).
--   * veranstaltungen_kategorie_check wird durch einen Fremdschlüssel auf
--     event_typen ersetzt (die vier bisherigen Werte sind für Boppard geseedet).
--
--  1. Punkte-Funktionen: neue Signaturen + Brücke in den alten
--  2. Beitreten (mit Versuchsbegrenzung), Rangliste, Mitgliederliste, Gäste
--  3. Event-Typen (+ Fremdschlüssel statt CHECK)
--  4. Shop generisch: preise, shop_anfragen, shop_einloesen, Übernahme der Historie
--  5. verein_anlegen
--  6. Rechte (revoke von public/anon, grant an authenticated/service_role)
--
-- Bewusst NICHT hier (siehe Zusammenfassung von Claude):
--   * Trigger auf shop_anfragen für die Mail  -> AP 4, sobald die Function steht
--   * Storage-Bucket vereins-logos            -> 04c_storage_logos.sql
--
-- Keine Platzhalter, keine Secrets. Am besten an einem Tag ohne Event ausführen,
-- NICHT um 00:00 oder 08:00 UTC (Cron-Läufe, siehe Abschnitt 1c).
-- verein_anlegen() ist bis AP 5 gesperrt (würde die laufende App brechen).
-- =====================================================================

begin;

do $$
begin
  if to_regprocedure('public.ist_admin_von(uuid)') is null then
    raise exception '04a_grundlagen.sql zuerst ausführen';
  end if;
end $$;

-- Sicherheitsnetz für Tabellen, deren DATEN diese Datei ändert.
create schema if not exists backup_pre_mt;
create table if not exists backup_pre_mt.preise_vor_04b   as select * from public.preise;
create table if not exists backup_pre_mt.mitgliedschaften_vor_04b as select * from public.mitgliedschaften;

-- =====================================================================
-- 1) PUNKTE-FUNKTIONEN
-- =====================================================================

-- 1a) Neue Signaturen: schreiben nur in mitgliedschaften.
--     Erlaubt: Service Role / Cron / SQL Editor (auth.uid() is null) und Admins
--     des Vereins. punkte_abziehen zusätzlich für den User selbst.
--     (anon hat kein Execute, siehe Abschnitt 6.)
create or replace function public.add_punkte(p_user uuid, p_verein uuid, p_amount integer)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.ist_admin_von(p_verein) then
    raise exception 'nicht erlaubt';
  end if;

  update public.mitgliedschaften m
     set punkte          = m.punkte + p_amount,
         schichten_count = m.schichten_count + 1
   where m.user_id = p_user and m.verein_id = p_verein;

  if not found then
    raise exception 'Keine Mitgliedschaft für diesen Nutzer in diesem Verein';
  end if;
end;
$$;

create or replace function public.punkte_abziehen(p_user uuid, p_verein uuid, p_amount integer)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Betrag muss größer 0 sein';
  end if;

  if auth.uid() is not null
     and not public.ist_admin_von(p_verein)
     and p_user is distinct from auth.uid() then
    raise exception 'nicht erlaubt';
  end if;

  update public.mitgliedschaften m
     set punkte = m.punkte - p_amount
   where m.user_id = p_user and m.verein_id = p_verein
     and m.punkte >= p_amount;

  if not found then
    raise exception 'Nicht genug Punkte oder keine Mitgliedschaft';
  end if;
end;
$$;

create or replace function public.increment_schichten_count(p_user uuid, p_verein uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.ist_admin_von(p_verein) then
    raise exception 'nicht erlaubt';
  end if;

  update public.mitgliedschaften m
     set schichten_count = m.schichten_count + 1
   where m.user_id = p_user and m.verein_id = p_verein;

  if not found then
    raise exception 'Keine Mitgliedschaft für diesen Nutzer in diesem Verein';
  end if;
end;
$$;

-- 1b) ALTE Signaturen: Verhalten und Rechteprüfung wie in 01_hotfix_sicherheit.sql,
--     zusätzlich Brücke in die Boppard-Mitgliedschaft. Parameternamen (user_id,
--     amount) müssen bleiben, sonst lehnt Postgres das Ersetzen ab.
--     Spalten werden überall qualifiziert (user_id ist auch ein Spaltenname).
create or replace function public.add_punkte(user_id uuid, amount integer)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null
     and not exists (select 1 from profiles where id = auth.uid() and is_admin = true) then
    raise exception 'nicht erlaubt';
  end if;

  update profiles
     set punkte = coalesce(punkte, 0) + amount,
         schichten_count = coalesce(schichten_count, 0) + 1
   where id = add_punkte.user_id;

  update public.mitgliedschaften m
     set punkte = m.punkte + add_punkte.amount,
         schichten_count = m.schichten_count + 1
   where m.user_id = add_punkte.user_id
     and m.verein_id = '5b0bba2d-0000-4000-8000-000000000001';
end;
$$;

create or replace function public.punkte_abziehen(user_id uuid, amount integer)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null
     and not exists (select 1 from profiles where id = auth.uid() and is_admin = true)
     and not (punkte_abziehen.user_id = auth.uid() and amount > 0) then
    raise exception 'nicht erlaubt';
  end if;

  update profiles
     set punkte = coalesce(punkte, 0) - amount
   where id = punkte_abziehen.user_id;

  update public.mitgliedschaften m
     set punkte = m.punkte - punkte_abziehen.amount
   where m.user_id = punkte_abziehen.user_id
     and m.verein_id = '5b0bba2d-0000-4000-8000-000000000001';
end;
$$;

create or replace function public.increment_schichten_count(user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null
     and not exists (select 1 from profiles where id = auth.uid() and is_admin = true) then
    raise exception 'nicht erlaubt';
  end if;

  update profiles
     set schichten_count = coalesce(schichten_count, 0) + 1
   where id = increment_schichten_count.user_id;

  update public.mitgliedschaften m
     set schichten_count = m.schichten_count + 1
   where m.user_id = increment_schichten_count.user_id
     and m.verein_id = '5b0bba2d-0000-4000-8000-000000000001';
end;
$$;

-- 1c) Einmalige Angleichung Boppard: Seit 02_multi_mandant_phase_a.sql haben die alten
--     Funktionen NUR profiles geändert (Cron-Punkte, Shop-Abzüge). profiles ist bis zu
--     diesem Zeitpunkt die Wahrheit. Ab dem Commit dieser Datei halten die Brücken
--     beide Tabellen synchron.
--     Fenster: Läuft der Cron (00:00 / 08:00 UTC) oder bucht jemand genau jetzt Punkte,
--     kann ein Wert fehlen -> KONTROLLE 3 danach prüfen, notfalls dieses UPDATE einzeln wiederholen.
update public.mitgliedschaften m
   set punkte          = coalesce(p.punkte, 0),
       schichten_count = coalesce(p.schichten_count, 0)
  from public.profiles p
 where p.id = m.user_id
   and m.verein_id = '5b0bba2d-0000-4000-8000-000000000001'
   and (m.punkte <> coalesce(p.punkte, 0) or m.schichten_count <> coalesce(p.schichten_count, 0));

-- =====================================================================
-- 2) BEITRETEN, RANGLISTE, MITGLIEDER, GÄSTE
-- =====================================================================

-- 2a) Versuche beim Freischaltcode begrenzen (nur Service/Funktionen, keine Policy)
create table if not exists public.beitritt_versuche (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  verein_id   uuid not null references public.vereine(id)  on delete cascade,
  erstellt_am timestamptz not null default now()
);
alter table public.beitritt_versuche enable row level security;
create index if not exists beitritt_versuche_user_idx on public.beitritt_versuche (user_id, erstellt_am desc);

-- 2b) Einem Verein beitreten.
--     Rückgabe (Text, KEINE Exception bei falschem Code, sonst würde der
--     protokollierte Fehlversuch mit zurückgerollt):
--       'ok' | 'bereits_mitglied' | 'falscher_code' | 'gesperrt'
--     Exception nur bei: nicht angemeldet, unbekannter/inaktiver Verein.
--     Vergleich wie bisher in Login.tsx: Eingabe getrimmt, sonst exakt (Groß-/Kleinschreibung zählt).
--     Sperre: ab 5 Fehlversuchen pro User und Stunde.
create or replace function public.verein_beitreten(p_slug text, p_code text, p_consents jsonb default '{}'::jsonb)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_verein uuid;
  v_code   text;
  v_fehl   integer;
begin
  if v_uid is null then raise exception 'nicht angemeldet'; end if;

  select id into v_verein from public.vereine where slug = p_slug and aktiv;
  if v_verein is null then raise exception 'Unbekannter Verein'; end if;

  if exists (select 1 from public.mitgliedschaften where user_id = v_uid and verein_id = v_verein) then
    return 'bereits_mitglied';
  end if;

  delete from public.beitritt_versuche where erstellt_am < now() - interval '1 day';

  select count(*) into v_fehl from public.beitritt_versuche
   where user_id = v_uid and erstellt_am > now() - interval '1 hour';
  if v_fehl >= 5 then return 'gesperrt'; end if;

  select freischaltcode into v_code from public.vereins_geheimnisse where verein_id = v_verein;
  if coalesce(v_code, '') <> '' and btrim(coalesce(p_code, '')) is distinct from v_code then
    insert into public.beitritt_versuche (user_id, verein_id) values (v_uid, v_verein);
    return 'falscher_code';
  end if;

  insert into public.mitgliedschaften
         (user_id, verein_id, consent_rangliste, consent_erinnerung,
          datenschutz_akzeptiert_am, nutzungsbedingungen_akzeptiert_am, einwilligung_quelle)
  values (v_uid, v_verein,
          coalesce((p_consents->>'rangliste')::boolean, false),
          coalesce((p_consents->>'erinnerung')::boolean, false),
          now(), now(), 'beitritt')
  on conflict (user_id, verein_id) do nothing;

  return 'ok';
end;
$$;

-- 2c) Rangliste: nur für Mitglieder des Vereins, nur mit Rangliste-Einwilligung, ohne Gäste.
create or replace function public.rangliste(p_verein uuid)
returns table (user_id uuid, display_name text, punkte integer, schichten_count integer)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null
     or not exists (select 1 from public.mitgliedschaften x
                     where x.user_id = auth.uid() and x.verein_id = p_verein) then
    raise exception 'nicht erlaubt';
  end if;

  return query
    select m.user_id,
           coalesce(nullif(p.display_name, ''), split_part(p.name, ' ', 1)),
           m.punkte,
           m.schichten_count
      from public.mitgliedschaften m
      join public.profiles p on p.id = m.user_id
     where m.verein_id = p_verein
       and m.consent_rangliste
       and not coalesce(p.is_temp, false)
     order by m.punkte desc, m.schichten_count desc, p.name;
end;
$$;

-- 2d) Mitgliederliste für Admins (inkl. E-Mail, Gäste gekennzeichnet)
create or replace function public.vereins_mitglieder(p_verein uuid)
returns table (user_id uuid, name text, display_name text, email text, punkte integer,
               schichten_count integer, is_admin boolean, is_trainer boolean,
               ist_gast boolean, temp_typ text, beigetreten_am timestamptz)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is not null and not public.ist_admin_von(p_verein) then
    raise exception 'nicht erlaubt';
  end if;

  return query
    select m.user_id, p.name, p.display_name, p.email, m.punkte, m.schichten_count,
           m.is_admin, m.is_trainer, coalesce(p.is_temp, false), p.temp_typ, m.created_at
      from public.mitgliedschaften m
      join public.profiles p on p.id = m.user_id
     where m.verein_id = p_verein
     order by p.name;
end;
$$;

-- 2e) Gast anlegen (Profil + Mitgliedschaft). Gäste haben keinen Auth-Account
--     (profiles.id hat keinen Fremdschlüssel auf auth.users, wie bisher).
--     Fake-Adresse endet auf ".intern" (wird von den Edge Functions als Gast erkannt).
--     Prüfungen wie bisher in Verwaltung.tsx, nur pro Verein: Name und E-Mail dürfen nicht doppelt sein.
create or replace function public.temp_user_anlegen(p_verein uuid, p_name text, p_typ text default 'Mitglied', p_email text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id    uuid := gen_random_uuid();
  v_name  text := btrim(coalesce(p_name, ''));
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
begin
  if auth.uid() is not null and not public.ist_admin_von(p_verein) then
    raise exception 'nicht erlaubt';
  end if;
  if v_name = '' then raise exception 'Name ist Pflicht'; end if;
  if p_typ not in ('Mitglied', 'Gast', 'Extern') then raise exception 'Ungültiger Typ'; end if;

  if v_email is not null and exists (select 1 from public.profiles where lower(email) = lower(v_email)) then
    raise exception 'Diese E-Mail ist bereits vergeben';
  end if;
  if exists (select 1 from public.mitgliedschaften m join public.profiles p on p.id = m.user_id
              where m.verein_id = p_verein and lower(p.name) = lower(v_name)) then
    raise exception 'Ein Mitglied mit diesem Namen existiert bereits';
  end if;

  insert into public.profiles (id, name, display_name, email, punkte, schichten_count, is_admin, is_temp, temp_typ)
  values (v_id, v_name, split_part(v_name, ' ', 1),
          coalesce(v_email, 'temp_' || v_id::text || '@gast.intern'),
          0, 0, false, true, p_typ);

  insert into public.mitgliedschaften (user_id, verein_id) values (v_id, p_verein);
  return v_id;
end;
$$;

-- 2f) Namen normalisieren: klein, ohne Komma/Punkt, Wörter sortiert
--     ("Mustermann, Max" = "max mustermann")
create or replace function public.norm_name(t text)
returns text
language sql immutable
as $$
  select coalesce(string_agg(w, ' ' order by w), '')
    from regexp_split_to_table(lower(regexp_replace(coalesce(t, ''), '[,.]', ' ', 'g')), '\s+') as w
   where w <> ''
$$;

-- 2g) Vorschläge: Gast und echtes Mitglied mit gleichem (normalisiertem) Namen
create or replace function public.gast_vorschlaege(p_verein uuid)
returns table (gast_id uuid, gast_name text, mitglied_id uuid, mitglied_name text)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is not null and not public.ist_admin_von(p_verein) then
    raise exception 'nicht erlaubt';
  end if;

  return query
    select g.user_id, pg.name, e.user_id, pe.name
      from public.mitgliedschaften g
      join public.profiles pg on pg.id = g.user_id and coalesce(pg.is_temp, false)
      join public.mitgliedschaften e on e.verein_id = g.verein_id and e.user_id <> g.user_id
      join public.profiles pe on pe.id = e.user_id and not coalesce(pe.is_temp, false)
     where g.verein_id = p_verein
       and public.norm_name(pg.name) = public.norm_name(pe.name)
     order by pg.name;
end;
$$;

-- 2h) Gast mit echtem Konto zusammenführen (eine Transaktion).
--     Belegungen: Hat das echte Konto dieselbe Schicht schon, bleibt EINE Zeile.
--       - Normalfall: die Gast-Zeile wird verworfen.
--       - Ausnahme: Gast ist 'Angemeldet', das echte Konto nicht (z. B. 'abgesagt')
--         -> die aktive Anmeldung des Gasts bleibt, die inaktive Zeile fällt weg.
--       - punkte_vergeben wird zusammengeführt (war es bei einer der beiden Zeilen
--         true, bleibt es true), damit die Punkte der Schicht nicht doppelt vergeben werden.
create or replace function public.gast_zusammenfuehren(p_gast uuid, p_echt uuid, p_verein uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  r        record;
  v_real   record;
  v_punkte integer;
  v_anz    integer;
  v_flag   boolean;
  v_uebertragen integer := 0;
  v_verworfen   integer := 0;
begin
  if auth.uid() is not null and not public.ist_admin_von(p_verein) then
    raise exception 'nicht erlaubt';
  end if;
  if p_gast = p_echt then raise exception 'Gast und Konto sind identisch'; end if;

  -- Beide Mitgliedschaften sperren, damit keine Punktevergabe dazwischenfunkt
  perform 1 from public.mitgliedschaften
   where verein_id = p_verein and user_id in (p_gast, p_echt) for update;

  select punkte, schichten_count into v_punkte, v_anz
    from public.mitgliedschaften where user_id = p_gast and verein_id = p_verein;
  if not found then raise exception 'Der Gast ist kein Mitglied dieses Vereins'; end if;

  if not exists (select 1 from public.mitgliedschaften where user_id = p_echt and verein_id = p_verein) then
    raise exception 'Das echte Konto ist kein Mitglied dieses Vereins';
  end if;
  if not coalesce((select is_temp from public.profiles where id = p_gast), false) then
    raise exception 'p_gast ist kein Gast';
  end if;
  if coalesce((select is_temp from public.profiles where id = p_echt), false) then
    raise exception 'p_echt ist ein Gast, nicht ein echtes Konto';
  end if;
  if exists (select 1 from public.mitgliedschaften where user_id = p_gast and verein_id <> p_verein) then
    raise exception 'Der Gast ist in mehreren Vereinen Mitglied, bitte manuell klären';
  end if;

  -- Schichtbelegungen übertragen
  for r in select * from public.schichtbelegungen where mitglied_id = p_gast order by id loop
    select * into v_real from public.schichtbelegungen
     where schicht_id = r.schicht_id and mitglied_id = p_echt;

    if found then
      v_flag := coalesce(r.punkte_vergeben, false) or coalesce(v_real.punkte_vergeben, false);
      if r.status = 'Angemeldet' and v_real.status is distinct from 'Angemeldet' then
        delete from public.schichtbelegungen where id = v_real.id;
        update public.schichtbelegungen set mitglied_id = p_echt, punkte_vergeben = v_flag where id = r.id;
        v_uebertragen := v_uebertragen + 1;
      else
        update public.schichtbelegungen set punkte_vergeben = v_flag where id = v_real.id;
        delete from public.schichtbelegungen where id = r.id;
        v_verworfen := v_verworfen + 1;
      end if;
    else
      update public.schichtbelegungen set mitglied_id = p_echt where id = r.id;
      v_uebertragen := v_uebertragen + 1;
    end if;
  end loop;

  -- Punkte und Zähler übertragen
  update public.mitgliedschaften m
     set punkte = m.punkte + v_punkte,
         schichten_count = m.schichten_count + v_anz
   where m.user_id = p_echt and m.verein_id = p_verein;

  -- Anfragen und Benachrichtigungen übertragen
  update public.gutschein_anfragen set mitglied_id = p_echt where mitglied_id = p_gast;
  update public.benachrichtigungen set mitglied_id = p_echt where mitglied_id = p_gast;

  -- Gast entfernen (Mitgliedschaft zuerst, dann Profil)
  delete from public.mitgliedschaften where user_id = p_gast and verein_id = p_verein;
  delete from public.profiles where id = p_gast;

  return jsonb_build_object(
    'schichten_uebertragen', v_uebertragen,
    'schichten_verworfen_doppelt', v_verworfen,
    'punkte', v_punkte,
    'schichten_count', v_anz);
end;
$$;

-- =====================================================================
-- 3) EVENT-TYPEN
-- =====================================================================
create table if not exists public.event_typen (
  id        uuid primary key default gen_random_uuid(),
  verein_id uuid not null references public.vereine(id) on delete cascade,
  key       text not null,
  label     text not null,
  sort      integer not null default 0,
  farbe     text,
  unique (verein_id, key)
);
alter table public.event_typen enable row level security;

drop policy if exists event_typen_lesen on public.event_typen;
create policy event_typen_lesen on public.event_typen
  for select using (verein_id in (select public.meine_vereine()));

drop policy if exists event_typen_admin on public.event_typen;
create policy event_typen_admin on public.event_typen
  for all using (public.ist_admin_von(verein_id)) with check (public.ist_admin_von(verein_id));

-- Seed Boppard (Reihenfolge wie im Event-Dropdown, Labels aus eventBanner.ts)
insert into public.event_typen (verein_id, key, label, sort) values
  ('5b0bba2d-0000-4000-8000-000000000001', 'heimspiel',     'Heimspiel',     1),
  ('5b0bba2d-0000-4000-8000-000000000001', 'vereinsfest',   'Vereinsfest',   2),
  ('5b0bba2d-0000-4000-8000-000000000001', 'flag-football', 'Flag-Football', 3),
  ('5b0bba2d-0000-4000-8000-000000000001', 'turnier',       'Turnier',       4)
on conflict (verein_id, key) do nothing;

-- Fester CHECK -> Fremdschlüssel (kategorie ist nullable, dann wird nichts geprüft).
-- Bestand: 11x heimspiel, 3x vereinsfest, 2x turnier (alle in der Seed-Liste).
alter table public.veranstaltungen drop constraint if exists veranstaltungen_kategorie_check;
alter table public.veranstaltungen drop constraint if exists veranstaltungen_kategorie_fk;
alter table public.veranstaltungen
  add constraint veranstaltungen_kategorie_fk
  foreign key (verein_id, kategorie) references public.event_typen (verein_id, key);

alter table public.schicht_vorlagen drop constraint if exists schicht_vorlagen_event_typ_fk;
alter table public.schicht_vorlagen
  add constraint schicht_vorlagen_event_typ_fk
  foreign key (verein_id, event_typ) references public.event_typen (verein_id, key);

-- =====================================================================
-- 4) SHOP GENERISCH
-- =====================================================================
alter table public.preise
  add column if not exists kategorie         text,      -- z. B. 'gutschein', 'artikel'
  add column if not exists anzahl_verfuegbar integer,   -- null = unbegrenzt
  add column if not exists icon              text,      -- Material-Symbol-Name
  add column if not exists farbe             text;      -- Hex, daraus baut das Frontend den Verlauf

alter table public.preise drop constraint if exists preise_werte_check;
alter table public.preise
  add constraint preise_werte_check check (punkte_kosten >= 0 and (anzahl_verfuegbar is null or anzahl_verfuegbar >= 0));

alter table public.shop_anfragen
  add column if not exists mail_gesendet boolean not null default false;

-- Seed Boppard: exakt die Artikel aus Shop.tsx (ARTIKEL), Jahr beim Trikot entfernt.
-- (Die Werte 200/300 Punkte aus einstellungen/Profil.tsx werden bewusst NICHT übernommen,
--  die Mitglieder nutzen heute den Shop mit 50/200/500.)
insert into public.preise (verein_id, name, beschreibung, punkte_kosten, verfuegbar, kategorie, icon, farbe)
select '5b0bba2d-0000-4000-8000-000000000001', v.name, v.beschreibung, v.kosten, true, v.kat, v.icon, v.farbe
  from (values
    ('5 € Verzehrgutschein',  'Einlösbar bei jedem Heimspiel am Hauptkiosk des SSV Boppard.', 50,  'gutschein', 'restaurant',   '#166534'),
    ('10 € Fanshop-Gutschein','Einlösbar im offiziellen SSV Boppard Online-Fanshop.',          200, 'gutschein', 'checkroom',    '#1e3a5f'),
    ('Heimtrikot',            'Das offizielle Heimtrikot des SSV Boppard mit Vereinswappen.',   500, 'artikel',   'emoji_events', '#92400e')
  ) as v(name, beschreibung, kosten, kat, icon, farbe)
 where not exists (select 1 from public.preise p
                    where p.verein_id = '5b0bba2d-0000-4000-8000-000000000001' and p.name = v.name);

-- Historie: gutschein_anfragen -> shop_anfragen.
--   * nur Anfragen von echten Konten (shop_anfragen.user_id zeigt auf auth.users;
--     Gäste haben keins und bleiben in gutschein_anfragen)
--   * nur wenn eine Prämie mit gleichem Namen existiert (preis_id ist Pflicht)
--   * mail_gesendet = true (es soll keine Mail mehr entstehen)
--   * Status: genehmigt/bearbeitet/erledigt -> bearbeitet, abgelehnt -> abgelehnt, sonst offen
insert into public.shop_anfragen
       (user_id, preis_id, preis_name, punkte_kosten, status, erstellt_am, verein_id, mail_gesendet)
select g.mitglied_id, p.id, g.typ, g.punkte,
       case lower(coalesce(g.status, ''))
         when 'genehmigt' then 'bearbeitet'
         when 'bearbeitet' then 'bearbeitet'
         when 'erledigt'  then 'bearbeitet'
         when 'abgelehnt' then 'abgelehnt'
         else 'offen' end,
       coalesce(g.created_at, now()), g.verein_id, true
  from public.gutschein_anfragen g
  join public.preise p on p.verein_id = g.verein_id and p.name = g.typ
 where exists (select 1 from auth.users u where u.id = g.mitglied_id)
   and not exists (select 1 from public.shop_anfragen s
                    where s.user_id = g.mitglied_id and s.preis_id = p.id
                      and s.erstellt_am = coalesce(g.created_at, now()));

-- Einlösen: eine Transaktion (Prämie sperren, Guthaben prüfen, abziehen, Anfrage anlegen).
create or replace function public.shop_einloesen(p_preis uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_p    record;
  v_shop boolean;
  v_id   uuid;
begin
  if v_uid is null then raise exception 'nicht angemeldet'; end if;

  select * into v_p from public.preise where id = p_preis for update;
  if not found or not v_p.verfuegbar then raise exception 'Prämie nicht verfügbar'; end if;
  if v_p.punkte_kosten < 0 then raise exception 'Ungültiger Preis'; end if;

  select coalesce((features->>'shop')::boolean, false) into v_shop
    from public.vereine where id = v_p.verein_id and aktiv;
  if not coalesce(v_shop, false) then raise exception 'Der Shop ist für diesen Verein nicht aktiviert'; end if;

  if v_p.anzahl_verfuegbar is not null then
    if v_p.anzahl_verfuegbar <= 0 then raise exception 'Prämie ausverkauft'; end if;
    update public.preise set anzahl_verfuegbar = anzahl_verfuegbar - 1 where id = v_p.id;
  end if;

  update public.mitgliedschaften m
     set punkte = m.punkte - v_p.punkte_kosten
   where m.user_id = v_uid and m.verein_id = v_p.verein_id
     and m.punkte >= v_p.punkte_kosten;
  if not found then
    raise exception 'Nicht genug Punkte oder keine Mitgliedschaft in diesem Verein';
  end if;

  insert into public.shop_anfragen (user_id, preis_id, preis_name, punkte_kosten, status, verein_id)
  values (v_uid, v_p.id, v_p.name, v_p.punkte_kosten, 'offen', v_p.verein_id)
  returning id into v_id;

  return v_id;
end;
$$;

-- Bearbeiten durch Admin des Vereins. Ablehnen bucht die Punkte zurück (und den Bestand),
-- genau einmal: eine abgelehnte Anfrage kann nicht wieder geöffnet werden.
create or replace function public.shop_anfrage_bearbeiten(p_id uuid, p_status text, p_notiz text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_a record;
begin
  if p_status not in ('offen', 'bearbeitet', 'abgelehnt') then
    raise exception 'Ungültiger Status';
  end if;

  select * into v_a from public.shop_anfragen where id = p_id for update;
  if not found then raise exception 'Anfrage nicht gefunden'; end if;

  if auth.uid() is not null and not public.ist_admin_von(v_a.verein_id) then
    raise exception 'nicht erlaubt';
  end if;

  if v_a.status = 'abgelehnt' and p_status <> 'abgelehnt' then
    raise exception 'Abgelehnte Anfragen können nicht wieder geöffnet werden';
  end if;

  if p_status = 'abgelehnt' and v_a.status <> 'abgelehnt' then
    -- Rückbuchung. Ist die Person nicht mehr Mitglied, entfällt sie (kein Konto zum Gutschreiben).
    update public.mitgliedschaften m
       set punkte = m.punkte + v_a.punkte_kosten
     where m.user_id = v_a.user_id and m.verein_id = v_a.verein_id;
    update public.preise set anzahl_verfuegbar = anzahl_verfuegbar + 1
     where id = v_a.preis_id and anzahl_verfuegbar is not null;
  end if;

  update public.shop_anfragen
     set status = p_status, notiz = coalesce(p_notiz, notiz)
   where id = p_id;
end;
$$;

-- =====================================================================
-- 5) VEREIN ANLEGEN (Plattform-Admin, Service Role oder SQL Editor)
--    Reservierte Slugs sind gesperrt, außer p_erlaube_reserviert = true
--    (z. B. bewusst für den Test-Verein 'test').
-- =====================================================================
create or replace function public.verein_anlegen(
  p_slug text, p_name text, p_farbe text, p_admin_email text, p_freischaltcode text,
  p_erlaube_reserviert boolean default false)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id   uuid := gen_random_uuid();
  v_eid  integer;
  v_n    integer;
  v_boppard constant uuid := '5b0bba2d-0000-4000-8000-000000000001';
begin
  if auth.uid() is not null and not public.ist_plattform_admin() then
    raise exception 'nicht erlaubt';
  end if;

  -- Sperre bis AP 5: Eine zweite einstellungen-Zeile bricht das aktuelle Frontend
  -- (.single() ohne Vereinsfilter) für ALLE Nutzer. Solange die alte offene Policy
  -- "read_all" auf einstellungen existiert, ist der Switch (AP 5) noch nicht erfolgt.
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'einstellungen' and policyname = 'read_all') then
    raise exception 'Gesperrt bis AP 5 (DB-Switch): ein zweiter Verein würde die laufende App für Boppard brechen';
  end if;

  if p_slug is null or p_slug !~ '^[a-z0-9]([a-z0-9-]{0,28}[a-z0-9])?$' then
    raise exception 'Ungültiger Slug (nur a-z, 0-9, Bindestrich, 1-30 Zeichen, nicht am Rand)';
  end if;
  if not p_erlaube_reserviert and p_slug in ('admin', 'app', 'www', 'api', 'mail', 'test') then
    raise exception 'Reservierter Slug: %', p_slug;
  end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'Name ist Pflicht'; end if;
  if p_farbe is null or p_farbe !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Farbe als #rrggbb angeben'; end if;
  if coalesce(btrim(p_admin_email), '') = '' then raise exception 'Admin-E-Mail ist Pflicht'; end if;

  insert into public.vereine (id, slug, name, farbe_primary) values (v_id, p_slug, btrim(p_name), p_farbe);

  -- einstellungen: id ist ein Singleton-Primärschlüssel (Default 1) -> nächste freie id.
  -- Code und Mail werden auch hier gesetzt, damit die Spalten-Defaults von Boppard
  -- (alte Mail, alter Code) NICHT übernommen werden.
  select coalesce(max(id), 0) + 1 into v_eid from public.einstellungen;
  insert into public.einstellungen (id, verein_id, admin_email, freischaltcode)
  values (v_eid, v_id, p_admin_email, p_freischaltcode);

  insert into public.vereins_geheimnisse (verein_id, freischaltcode, admin_email)
  values (v_id, p_freischaltcode, p_admin_email);

  insert into public.event_typen (verein_id, key, label, sort, farbe)
  select v_id, key, label, sort, farbe from public.event_typen where verein_id = v_boppard;

  -- Kategorien von Boppard kopieren. Solange der alte Unique-Constraint kategorien_name_key (name)
  -- besteht (bis AP 5), werden gleichnamige Kategorien übersprungen. Nach AP 5 klappt das Kopieren.
  insert into public.kategorien (verein_id, name, farbe, punkte)
  select v_id, name, farbe, punkte from public.kategorien where verein_id = v_boppard
  on conflict do nothing;
  get diagnostics v_n = row_count;
  raise notice 'Kategorien kopiert: %', v_n;

  -- Beispiel-Prämie, nicht sichtbar bis der Admin sie anpasst und aktiviert
  insert into public.preise (verein_id, name, beschreibung, punkte_kosten, verfuegbar, kategorie)
  values (v_id, 'Beispiel-Prämie (bitte anpassen)', 'Hier steht die Beschreibung der Prämie.', 100, false, 'artikel');

  return v_id;
end;
$$;

-- =====================================================================
-- 6) RECHTE
--    Alle neuen Funktionen: weder PUBLIC noch anon, nur eingeloggte Nutzer und Service Role.
--    (Die Funktionen prüfen den Aufrufer zusätzlich selbst.)
-- =====================================================================
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.add_punkte(uuid, uuid, integer)',
    'public.punkte_abziehen(uuid, uuid, integer)',
    'public.increment_schichten_count(uuid, uuid)',
    'public.verein_beitreten(text, text, jsonb)',
    'public.rangliste(uuid)',
    'public.vereins_mitglieder(uuid)',
    'public.temp_user_anlegen(uuid, text, text, text)',
    'public.gast_vorschlaege(uuid)',
    'public.gast_zusammenfuehren(uuid, uuid, uuid)',
    'public.shop_einloesen(uuid)',
    'public.shop_anfrage_bearbeiten(uuid, text, text)',
    'public.verein_anlegen(text, text, text, text, text, boolean)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- Die ersetzten alten Signaturen behalten ihre Rechte (create or replace ändert sie nicht),
-- hier zur Sicherheit erneut wie im Hotfix:
revoke execute on function public.add_punkte(uuid, integer)       from public, anon;
revoke execute on function public.punkte_abziehen(uuid, integer)  from public, anon;
revoke execute on function public.increment_schichten_count(uuid) from public, anon;

commit;

-- ---------------------------------------------------------------------
-- KONTROLLE 1: Objekte vorhanden, Seeds, Historie
-- ---------------------------------------------------------------------
select
  (select count(*) from public.event_typen where verein_id = '5b0bba2d-0000-4000-8000-000000000001') as event_typen,
  (select count(*) from public.preise      where verein_id = '5b0bba2d-0000-4000-8000-000000000001') as preise,
  (select count(*) from public.gutschein_anfragen)                                                  as gutschein_anfragen,
  (select count(*) from public.shop_anfragen)                                                       as shop_anfragen_uebernommen,
  (select count(*) from public.gutschein_anfragen g
    where not exists (select 1 from auth.users u where u.id = g.mitglied_id))                       as davon_von_gaesten,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
    and proname in ('verein_beitreten','rangliste','vereins_mitglieder','temp_user_anlegen',
                    'gast_vorschlaege','gast_zusammenfuehren','shop_einloesen',
                    'shop_anfrage_bearbeiten','verein_anlegen'))                                    as neue_funktionen;
-- erwartet: event_typen = 4, preise = 3, shop_anfragen_uebernommen = gutschein_anfragen - davon_von_gaesten
--           (Zeilen ohne passende Prämie wären die Differenz), neue_funktionen = 9

-- KONTROLLE 2 (separat): Punkte-Funktionen, jetzt je zwei Signaturen
--   select oid::regprocedure from pg_proc where pronamespace = 'public'::regnamespace
--    and proname in ('add_punkte','punkte_abziehen','increment_schichten_count') order by 1;
-- erwartet: 6 Zeilen

-- KONTROLLE 3 (separat): Abgleich Punkte profiles <-> mitgliedschaften (Boppard)
--   select count(*) from public.profiles p join public.mitgliedschaften m
--     on m.user_id = p.id and m.verein_id = '5b0bba2d-0000-4000-8000-000000000001'
--    where coalesce(p.punkte,0) <> m.punkte or coalesce(p.schichten_count,0) <> m.schichten_count;
-- erwartet: 0 direkt nach dieser Datei (Angleichung in Abschnitt 1c). Bleibt es 0, solange die
--           alten Funktionen laufen. Ist es später > 0, hat etwas profiles/mitgliedschaften
--           am Brücken-Pfad vorbei geändert (z. B. SQL von Hand), vor AP 5 klären.

-- ---------------------------------------------------------------------
-- ROLLBACK (einzeln, nur falls etwas bricht):
--   * Alte Punkte-Funktionen ohne Brücke: Definition aus 01_hotfix_sicherheit.sql erneut ausführen.
--   * veranstaltungen: alten CHECK wieder anlegen
--       alter table public.veranstaltungen drop constraint veranstaltungen_kategorie_fk;
--       alter table public.veranstaltungen add constraint veranstaltungen_kategorie_check
--         check (kategorie = any (array['heimspiel','vereinsfest','flag-football','turnier']));
--       alter table public.schicht_vorlagen drop constraint schicht_vorlagen_event_typ_fk;
--   * drop function public.add_punkte(uuid, uuid, integer), public.punkte_abziehen(uuid, uuid, integer),
--       public.increment_schichten_count(uuid, uuid), public.verein_beitreten(text, text, jsonb),
--       public.rangliste(uuid), public.vereins_mitglieder(uuid),
--       public.temp_user_anlegen(uuid, text, text, text), public.norm_name(text),
--       public.gast_vorschlaege(uuid), public.gast_zusammenfuehren(uuid, uuid, uuid),
--       public.shop_einloesen(uuid), public.shop_anfrage_bearbeiten(uuid, text, text),
--       public.verein_anlegen(text, text, text, text, text, boolean);
--   * drop table public.event_typen, public.beitritt_versuche;
--   * Shop: delete from public.shop_anfragen where mail_gesendet;  -- nur die übernommenen Zeilen,
--       solange noch keine echten Einlösungen existieren; preise-Seed: Backup in backup_pre_mt.preise_vor_04b
--       alter table public.preise drop column kategorie, drop column anzahl_verfuegbar,
--         drop column icon, drop column farbe, drop constraint preise_werte_check;
--       alter table public.shop_anfragen drop column mail_gesendet;
-- ---------------------------------------------------------------------
