-- =====================================================================
-- 04o: Event-Typen im Admin pflegen (AP 4.6 Rest)
--
--   event_typ_speichern(p_verein, p_key, p_label, p_icon, p_farbe, p_deko)
--       p_key null   -> neuer Typ, Schlüssel wird aus dem Namen gebildet (eindeutig je Verein)
--       p_key gesetzt -> Typ ändern. Der Schlüssel bleibt, weil Events und Vorlagen darauf zeigen.
--       p_farbe leer -> Farbe und Verlauf bleiben unverändert. Wird eine NEUE Farbe gesetzt, entfällt
--                       der alte feste Verlauf, das Banner nutzt dann die Farbe.
--   event_typ_loeschen(p_verein, p_key)
--       nur wenn kein Event und keine Vorlage den Typ nutzt und er nicht der letzte ist
--
-- Rein additiv, die laufende App ruft die Funktionen noch nicht auf. Keine Secrets. Wiederholbar.
-- =====================================================================

begin;

create or replace function public.event_typ_speichern(
  p_verein uuid, p_key text, p_label text, p_icon text, p_farbe text, p_deko boolean)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_label text := btrim(coalesce(p_label, ''));
  v_icon  text := nullif(btrim(coalesce(p_icon, '')), '');
  v_farbe text := nullif(btrim(coalesce(p_farbe, '')), '');
  v_key   text;
  v_basis text;
  v_n     integer := 1;
  v_alt   record;
begin
  if auth.uid() is not null and not public.ist_admin_von(p_verein) then
    raise exception 'nicht erlaubt';
  end if;
  if v_label = '' or length(v_label) > 40 then raise exception 'Name ist Pflicht (höchstens 40 Zeichen)'; end if;
  if v_icon is not null and length(v_icon) > 16 then raise exception 'Symbol ist zu lang'; end if;
  if v_farbe is not null and v_farbe !~* '^#[0-9a-f]{6}$' then raise exception 'Ungültige Farbe'; end if;

  if p_key is null then
    -- Schlüssel aus dem Namen: klein, Umlaute aufgelöst, nur a-z 0-9 und Bindestrich
    v_basis := lower(v_label);
    v_basis := replace(replace(replace(replace(v_basis, 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss');
    v_basis := regexp_replace(v_basis, '[^a-z0-9]+', '-', 'g');
    v_basis := btrim(v_basis, '-');
    if v_basis = '' then v_basis := 'typ'; end if;
    v_key := v_basis;
    while exists (select 1 from public.event_typen where verein_id = p_verein and key = v_key) loop
      v_n := v_n + 1;
      v_key := v_basis || '-' || v_n;
    end loop;

    insert into public.event_typen (verein_id, key, label, sort, farbe, icon, deko)
    values (p_verein, v_key, v_label,
            coalesce((select max(sort) from public.event_typen where verein_id = p_verein), 0) + 1,
            v_farbe, v_icon, coalesce(p_deko, false));
    return v_key;
  end if;

  select * into v_alt from public.event_typen where verein_id = p_verein and key = p_key for update;
  if not found then raise exception 'Typ nicht gefunden'; end if;

  update public.event_typen
     set label   = v_label,
         icon    = v_icon,
         deko    = coalesce(p_deko, false),
         farbe   = coalesce(v_farbe, v_alt.farbe),
         verlauf = case when v_farbe is not null and v_farbe is distinct from v_alt.farbe then null else v_alt.verlauf end
   where verein_id = p_verein and key = p_key;
  return p_key;
end;
$$;

create or replace function public.event_typ_loeschen(p_verein uuid, p_key text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.ist_admin_von(p_verein) then
    raise exception 'nicht erlaubt';
  end if;
  if not exists (select 1 from public.event_typen where verein_id = p_verein and key = p_key) then
    raise exception 'Typ nicht gefunden';
  end if;
  if (select count(*) from public.event_typen where verein_id = p_verein) <= 1 then
    raise exception 'Der letzte Typ kann nicht gelöscht werden';
  end if;
  if exists (select 1 from public.veranstaltungen where verein_id = p_verein and kategorie = p_key)
     or exists (select 1 from public.schicht_vorlagen where verein_id = p_verein and event_typ = p_key) then
    raise exception 'Der Typ wird noch von Events oder Vorlagen verwendet';
  end if;
  delete from public.event_typen where verein_id = p_verein and key = p_key;
end;
$$;

revoke execute on function public.event_typ_speichern(uuid, text, text, text, text, boolean) from public, anon;
revoke execute on function public.event_typ_loeschen(uuid, text) from public, anon;
grant  execute on function public.event_typ_speichern(uuid, text, text, text, text, boolean) to authenticated, service_role;
grant  execute on function public.event_typ_loeschen(uuid, text) to authenticated, service_role;

commit;

-- KONTROLLE (erwartet: 2 Zeilen, überall anon_darf = false)
select p.oid::regprocedure as funktion,
       has_function_privilege('anon', p.oid, 'execute') as anon_darf
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('event_typ_speichern', 'event_typ_loeschen')
 order by 1;

-- ROLLBACK:
--   drop function if exists public.event_typ_speichern(uuid, text, text, text, text, boolean);
--   drop function if exists public.event_typ_loeschen(uuid, text);
