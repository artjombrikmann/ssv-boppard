-- =====================================================================
-- 04j: Hilfsfunktionen für den DB-Switch (AP 4 Vorbereitung, vor AP 5)
--
-- Nach dem Switch (sql/05_b3_switch.sql) darf niemand mehr fremde Profile lesen
-- (die offene Policy "read_all" auf profiles entfällt). Drei Stellen im Frontend
-- brauchen deshalb Funktionen statt direkter Joins auf profiles:
--
--   schicht_teilnehmer(p_schicht)   Marktplatz "Bereits dabei": nur Namen
--   belegungen_offen(p_verein)      Admin Punktevergabe: offene Belegungen mit Name
--   vereins_mitglieder(p_verein)    NEU gefasst: liefert zusätzlich email_bestaetigt
--                                   (die Verwaltung zeigt "Unbestätigt")
--
-- Rein additiv: neue Funktionen bzw. eine ersetzte mit zusätzlichen Spalten am Ende.
-- Die laufende App ruft sie noch nicht auf. Kann JETZT ausgeführt werden.
-- Keine Secrets. Wiederholbar.
-- =====================================================================

begin;

-- 1) Teilnehmer einer Schicht: nur Anzeigename, nur für Mitglieder des Vereins der Schicht.
--    Gäste werden mit ihrem Namen gezeigt (wie bisher), E-Mail und Punkte nie.
--    Abgesagte Anmeldungen fehlen (wie bisher: status <> 'abgesagt').
create or replace function public.schicht_teilnehmer(p_schicht bigint)
returns table (name text)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_verein uuid;
begin
  select verein_id into v_verein from public.schichten where id = p_schicht;
  if v_verein is null then return; end if;

  -- Service Role / SQL Editor (auth.uid() is null) darf alles, Nutzer nur im eigenen Verein
  if auth.uid() is not null
     and not exists (select 1 from public.mitgliedschaften x
                      where x.user_id = auth.uid() and x.verein_id = v_verein) then
    raise exception 'nicht erlaubt';
  end if;

  return query
    select coalesce(nullif(p.name, ''), nullif(p.display_name, ''), 'Unbekannt')
      from public.schichtbelegungen b
      join public.profiles p on p.id = b.mitglied_id
     where b.schicht_id = p_schicht
       and b.status is distinct from 'abgesagt'
     order by p.name;
end;
$$;

-- 2) Offene Belegungen für die Punktevergabe (Admin). Liefert, was die Verwaltung heute über den
--    Join schichtbelegungen -> profiles(name) -> schichten(bezeichnung, punkte) holt.
create or replace function public.belegungen_offen(p_verein uuid)
returns table (id bigint, schicht_id bigint, mitglied_id uuid, status text, punkte_vergeben boolean,
               mitglied_name text, schicht_bezeichnung text, schicht_punkte integer)
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.ist_admin_von(p_verein) then
    raise exception 'nicht erlaubt';
  end if;

  return query
    select b.id, b.schicht_id, b.mitglied_id, b.status, coalesce(b.punkte_vergeben, false),
           p.name, s.bezeichnung, s.punkte
      from public.schichtbelegungen b
      join public.schichten s on s.id = b.schicht_id
      join public.profiles  p on p.id = b.mitglied_id
     where s.verein_id = p_verein
       and b.status = 'Angemeldet'
     order by b.created_at;
end;
$$;

-- 3) Mitgliederliste neu fassen: zusätzlich email_bestaetigt. Ein Rückgabetyp lässt sich nicht
--    per CREATE OR REPLACE ändern, deshalb erst entfernen (die Funktion ist neu aus 04b und noch
--    von keinem Frontend aufgerufen).
drop function if exists public.vereins_mitglieder(uuid);

create function public.vereins_mitglieder(p_verein uuid)
returns table (user_id uuid, name text, display_name text, email text, punkte integer,
               schichten_count integer, is_admin boolean, is_trainer boolean,
               ist_gast boolean, temp_typ text, beigetreten_am timestamptz,
               email_bestaetigt boolean)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is not null and not public.ist_admin_von(p_verein) then
    raise exception 'nicht erlaubt';
  end if;

  return query
    select m.user_id, p.name, p.display_name, p.email, m.punkte, m.schichten_count,
           m.is_admin, m.is_trainer, coalesce(p.is_temp, false), p.temp_typ, m.created_at,
           coalesce(p.email_bestaetigt, false)
      from public.mitgliedschaften m
      join public.profiles p on p.id = m.user_id
     where m.verein_id = p_verein
     order by m.punkte desc, p.name;
end;
$$;

-- Rechte wie bei den übrigen Funktionen: nicht für anon, nur eingeloggte Nutzer und Service Role
revoke execute on function public.schicht_teilnehmer(bigint)  from public, anon;
revoke execute on function public.belegungen_offen(uuid)      from public, anon;
revoke execute on function public.vereins_mitglieder(uuid)    from public, anon;
grant  execute on function public.schicht_teilnehmer(bigint)  to authenticated, service_role;
grant  execute on function public.belegungen_offen(uuid)      to authenticated, service_role;
grant  execute on function public.vereins_mitglieder(uuid)    to authenticated, service_role;

commit;

-- KONTROLLE 1 (erwartet: 3 Zeilen)
select p.oid::regprocedure as funktion
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('schicht_teilnehmer', 'belegungen_offen', 'vereins_mitglieder')
 order by 1;

-- KONTROLLE 2 (im SQL Editor wirkt auth.uid() = null, also "Service-Rolle"; erwartet: Zahlen, kein Fehler)
select (select count(*) from public.vereins_mitglieder('5b0bba2d-0000-4000-8000-000000000001')) as mitglieder,
       (select count(*) from public.belegungen_offen('5b0bba2d-0000-4000-8000-000000000001'))    as offene_belegungen;
-- erwartet: mitglieder = Anzahl Profile (75), offene_belegungen = Anzahl angemeldeter Belegungen

-- KONTROLLE 3: Nutzer-Rechte (anon darf NICHT), erwartet: false
select has_function_privilege('anon', 'public.schicht_teilnehmer(bigint)', 'execute') as anon_darf;

-- ROLLBACK:
--   drop function if exists public.schicht_teilnehmer(bigint), public.belegungen_offen(uuid);
--   vereins_mitglieder(uuid): Definition aus 04b_funktionen_event_shop.sql (Abschnitt 2d) wieder ausführen
--   (vorher: drop function public.vereins_mitglieder(uuid);)
