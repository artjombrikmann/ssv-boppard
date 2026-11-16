-- =====================================================================
-- 04n: Shop-Verwaltung für Admins (AP 4.4, Admin-Tab "Shop")
--
-- Alles über Funktionen, damit es mit und ohne den DB-Switch (AP 5) gleich funktioniert und
-- keine Schreibrechte auf die Tabellen nötig sind:
--
--   praemie_speichern(...)       Prämie anlegen (p_id null) oder ändern
--   praemie_loeschen(p_id)       löscht; gibt es schon Anfragen dazu, wird sie nur ausgeblendet
--   shop_anfragen_liste(p_verein) Anfragen mit Name und E-Mail (kein Join auf profiles im Frontend)
--
-- Das Bearbeiten einer Anfrage (offen, bearbeitet, abgelehnt, mit Rückbuchung) macht die
-- bestehende Funktion shop_anfrage_bearbeiten aus 04b.
--
-- Rein additiv, die laufende App ruft die Funktionen noch nicht auf. Keine Secrets. Wiederholbar.
-- =====================================================================

begin;

create or replace function public.praemie_speichern(
  p_verein uuid, p_id uuid, p_name text, p_beschreibung text, p_punkte integer,
  p_verfuegbar boolean, p_kategorie text, p_anzahl integer, p_icon text, p_farbe text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id    uuid;
  v_name  text := btrim(coalesce(p_name, ''));
  v_icon  text := nullif(btrim(coalesce(p_icon, '')), '');
  v_farbe text := nullif(btrim(coalesce(p_farbe, '')), '');
begin
  if auth.uid() is not null and not public.ist_admin_von(p_verein) then
    raise exception 'nicht erlaubt';
  end if;
  if v_name = '' or length(v_name) > 80 then raise exception 'Name ist Pflicht (höchstens 80 Zeichen)'; end if;
  if p_punkte is null or p_punkte < 0 or p_punkte > 100000 then raise exception 'Ungültige Punktzahl'; end if;
  if p_anzahl is not null and p_anzahl < 0 then raise exception 'Ungültiger Bestand'; end if;
  if v_icon is not null and v_icon !~ '^[a-z0-9_]{1,40}$' then raise exception 'Ungültiges Symbol'; end if;
  if v_farbe is not null and v_farbe !~* '^#[0-9a-f]{6}$' then raise exception 'Ungültige Farbe'; end if;

  if p_id is null then
    insert into public.preise (verein_id, name, beschreibung, punkte_kosten, verfuegbar, kategorie, anzahl_verfuegbar, icon, farbe)
    values (p_verein, v_name, nullif(btrim(coalesce(p_beschreibung, '')), ''), p_punkte,
            coalesce(p_verfuegbar, true), nullif(btrim(coalesce(p_kategorie, '')), ''), p_anzahl, v_icon, v_farbe)
    returning id into v_id;
  else
    update public.preise
       set name = v_name,
           beschreibung = nullif(btrim(coalesce(p_beschreibung, '')), ''),
           punkte_kosten = p_punkte,
           verfuegbar = coalesce(p_verfuegbar, true),
           kategorie = nullif(btrim(coalesce(p_kategorie, '')), ''),
           anzahl_verfuegbar = p_anzahl,
           icon = v_icon,
           farbe = v_farbe
     where id = p_id and verein_id = p_verein
    returning id into v_id;
    if v_id is null then raise exception 'Prämie nicht gefunden'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.praemie_loeschen(p_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_verein uuid;
begin
  select verein_id into v_verein from public.preise where id = p_id;
  if v_verein is null then raise exception 'Prämie nicht gefunden'; end if;
  if auth.uid() is not null and not public.ist_admin_von(v_verein) then
    raise exception 'nicht erlaubt';
  end if;

  if exists (select 1 from public.shop_anfragen where preis_id = p_id) then
    update public.preise set verfuegbar = false where id = p_id;
    return 'ausgeblendet';
  end if;
  delete from public.preise where id = p_id;
  return 'geloescht';
end;
$$;

create or replace function public.shop_anfragen_liste(p_verein uuid)
returns table (id uuid, user_id uuid, mitglied_name text, mitglied_email text, preis_name text,
               punkte_kosten integer, status text, erstellt_am timestamptz, notiz text)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is not null and not public.ist_admin_von(p_verein) then
    raise exception 'nicht erlaubt';
  end if;

  return query
    select a.id, a.user_id,
           coalesce(nullif(p.name, ''), nullif(p.display_name, ''), 'Unbekannt')::text,
           p.email::text, a.preis_name::text, a.punkte_kosten::integer, a.status::text,
           a.erstellt_am::timestamptz, a.notiz::text
      from public.shop_anfragen a
      left join public.profiles p on p.id = a.user_id
     where a.verein_id = p_verein
     order by (a.status = 'offen') desc, a.erstellt_am desc
     limit 200;
end;
$$;

revoke execute on function public.praemie_speichern(uuid, uuid, text, text, integer, boolean, text, integer, text, text) from public, anon;
revoke execute on function public.praemie_loeschen(uuid)        from public, anon;
revoke execute on function public.shop_anfragen_liste(uuid)     from public, anon;
grant  execute on function public.praemie_speichern(uuid, uuid, text, text, integer, boolean, text, integer, text, text) to authenticated, service_role;
grant  execute on function public.praemie_loeschen(uuid)        to authenticated, service_role;
grant  execute on function public.shop_anfragen_liste(uuid)     to authenticated, service_role;

-- Die Funktion aus 04b war noch nicht für anon gesperrt, nachholen
revoke execute on function public.shop_anfrage_bearbeiten(uuid, text, text) from public, anon;
grant  execute on function public.shop_anfrage_bearbeiten(uuid, text, text) to authenticated, service_role;

commit;

-- KONTROLLE 1 (erwartet: 4 Zeilen, überall anon_darf = false)
select p.oid::regprocedure as funktion,
       has_function_privilege('anon', p.oid, 'execute') as anon_darf
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('praemie_speichern', 'praemie_loeschen', 'shop_anfragen_liste', 'shop_anfrage_bearbeiten')
 order by 1;

-- KONTROLLE 2 (SQL Editor = Service-Rolle; erwartet: Anzahl bisheriger Anfragen, kein Fehler)
select count(*) as anfragen from public.shop_anfragen_liste('5b0bba2d-0000-4000-8000-000000000001');

-- ROLLBACK:
--   drop function if exists public.praemie_speichern(uuid, uuid, text, text, integer, boolean, text, integer, text, text);
--   drop function if exists public.praemie_loeschen(uuid);
--   drop function if exists public.shop_anfragen_liste(uuid);
