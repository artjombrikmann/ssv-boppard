-- =====================================================================
-- 04g: Registrierung serverseitig absichern (AP 4, Teil 3a)
--
-- WICHTIG: Diese Datei VOR dem Test der Preview und VOR dem Merge ausführen.
-- Das neue Frontend prüft den Freischaltcode nicht mehr im Browser.
--
--  1. Abgleich vereins_geheimnisse <- einstellungen (der Code kann seit 04a
--     in der Verwaltung geändert worden sein, die Verwaltung schreibt noch in
--     einstellungen)
--  2. Brücke: Änderungen an einstellungen.freischaltcode / admin_email werden
--     in vereins_geheimnisse gespiegelt (bis AP 6)
--  3. handle_new_user(): prüft den Freischaltcode, schreibt die Einwilligungen
--     in die Mitgliedschaft
--  4. verein_beitreten(): Datenschutz-Zeitstempel nur bei tatsächlicher Zustimmung
--
-- Verträglich mit der AKTUELLEN Produktions-App: Sendet ein Client keinen
-- Freischaltcode in den Metadaten (alte App-Version, prüft selbst im Browser),
-- wird NICHT serverseitig geprüft. Diese Toleranz wird in AP 6 entfernt, sobald
-- keine alte App-Version mehr läuft. Bis dahin ist ein direkter signUp-Aufruf
-- ohne Code weiter möglich (wie bisher).
--
-- Keine Platzhalter, keine Secrets. Wiederholbar.
-- =====================================================================

-- VORAB (nur lesen, Rollback-Vorlage):
--   select pg_get_functiondef('public.handle_new_user'::regproc);
--   select pg_get_functiondef('public.verein_beitreten(text,text,jsonb)'::regprocedure);

begin;

-- 1) Abgleich (einstellungen ist bis AP 6 die Quelle der Verwaltung)
update public.vereins_geheimnisse g
   set freischaltcode = e.freischaltcode,
       admin_email    = e.admin_email
  from public.einstellungen e
 where e.verein_id = g.verein_id
   and (g.freischaltcode is distinct from e.freischaltcode
        or g.admin_email is distinct from e.admin_email);

-- 2) Brücke einstellungen -> vereins_geheimnisse (nur bei UPDATE; neue Vereine legt
--    verein_anlegen() selbst an)
create or replace function public.trg_einstellungen_geheimnisse()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.vereins_geheimnisse (verein_id, freischaltcode, admin_email)
  values (new.verein_id, new.freischaltcode, new.admin_email)
  on conflict (verein_id) do update
     set freischaltcode = excluded.freischaltcode,
         admin_email    = excluded.admin_email;
  return new;
end;
$$;

drop trigger if exists trigger_einstellungen_geheimnisse on public.einstellungen;
create trigger trigger_einstellungen_geheimnisse
  after update of freischaltcode, admin_email on public.einstellungen
  for each row
  when (old.freischaltcode is distinct from new.freischaltcode
        or old.admin_email is distinct from new.admin_email)
  execute function public.trg_einstellungen_geheimnisse();

-- 3) Neues Konto: Code prüfen, Profil und Mitgliedschaft mit Einwilligungen anlegen.
--    Metadaten (signUp -> options.data):
--      name, display_name, verein_slug (Standard: boppard), freischaltcode,
--      consents = { rangliste, datenschutz, erinnerung }
--    Ein Fehler hier bricht die Registrierung ab. Supabase zeigt dem Client dann
--    nur "Database error saving new user".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta     jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  v_slug     text  := coalesce(nullif(v_meta->>'verein_slug', ''), 'boppard');
  v_hat_cons boolean := (v_meta ? 'consents') and jsonb_typeof(v_meta->'consents') = 'object';
  v_consents jsonb := case when (v_meta ? 'consents') and jsonb_typeof(v_meta->'consents') = 'object'
                           then v_meta->'consents' else '{}'::jsonb end;
  v_verein   uuid;
  v_soll     text;
  v_rangl    boolean;
  v_erinn    boolean;
  v_dsgvo    boolean;
  v_quelle   text;
begin
  select id into v_verein from public.vereine where slug = v_slug and aktiv;
  if v_verein is null then
    raise exception 'Unbekannter Verein: %', v_slug;
  end if;

  -- Freischaltcode: nur prüfen, wenn der Client einen mitschickt (siehe Kopfkommentar).
  -- Vergleich wie bisher im Frontend: Eingabe getrimmt, sonst exakt.
  if v_meta ? 'freischaltcode' then
    select freischaltcode into v_soll from public.vereins_geheimnisse where verein_id = v_verein;
    if coalesce(v_soll, '') <> ''
       and btrim(coalesce(v_meta->>'freischaltcode', '')) is distinct from v_soll then
      raise exception 'Ungültiger Freischaltcode';
    end if;
  end if;

  if v_hat_cons then
    v_rangl  := coalesce((v_consents->>'rangliste')::boolean, false);
    v_erinn  := coalesce((v_consents->>'erinnerung')::boolean, false);
    v_dsgvo  := coalesce((v_consents->>'datenschutz')::boolean, false);
    v_quelle := 'registrierung';
  else
    -- Alte App-Version: Die Checkboxen waren im UI Pflicht, wurden aber nicht übertragen.
    v_rangl := true; v_erinn := true; v_dsgvo := true;
    v_quelle := 'registrierung-alt-ui-pflicht';
  end if;

  insert into public.profiles (
    id, name, email, display_name,
    punkte, schichten_count, is_admin,
    consent_rangliste, consent_dsgvo, consent_erinnerung,
    datenschutz_akzeptiert, nutzungsbedingungen_akzeptiert,
    newsletter_akzeptiert, einwilligung_datum, created_at
  ) values (
    NEW.id,
    coalesce(v_meta->>'name', 'Unbekannt'),
    NEW.email,
    coalesce(v_meta->>'display_name',
             split_part(coalesce(v_meta->>'name', 'Unbekannt'), ' ', 1)),
    0, 0, false, false, false, false, false, false, false,
    now(), now()
  );

  insert into public.mitgliedschaften
         (user_id, verein_id, consent_rangliste, consent_erinnerung,
          datenschutz_akzeptiert_am, einwilligung_quelle)
  values (NEW.id, v_verein, v_rangl, v_erinn,
          case when v_dsgvo then now() end, v_quelle)
  on conflict (user_id, verein_id) do nothing;

  return NEW;
end;
$$;

-- 4) verein_beitreten: wie in 04b, aber Datenschutz-Zeitstempel nur bei Zustimmung
--    (die Nutzungsbedingungen haben im UI keine eigene Checkbox, Zeitstempel bleibt leer).
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
          datenschutz_akzeptiert_am, einwilligung_quelle)
  values (v_uid, v_verein,
          coalesce((p_consents->>'rangliste')::boolean, false),
          coalesce((p_consents->>'erinnerung')::boolean, false),
          case when coalesce((p_consents->>'datenschutz')::boolean, false) then now() end,
          'beitritt')
  on conflict (user_id, verein_id) do nothing;

  return 'ok';
end;
$$;

commit;

-- KONTROLLE 1: Funktionen und Trigger vorhanden, Code gespiegelt (erwartet: 1, 1, 0)
select
  (select count(*) from pg_trigger where tgname = 'trigger_einstellungen_geheimnisse') as bruecke_trigger,
  (select count(*) from pg_proc where proname = 'handle_new_user'
      and prosrc like '%Ungültiger Freischaltcode%')                                   as code_pruefung,
  (select count(*) from public.vereins_geheimnisse g
     join public.einstellungen e on e.verein_id = g.verein_id
    where g.freischaltcode is distinct from e.freischaltcode)                          as abweichungen;

-- KONTROLLE 2 (separat): Ist der Auth-Trigger noch angehängt? (erwartet: 1 Zeile)
--   select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;

-- ROLLBACK:
--   * handle_new_user und verein_beitreten: Definition aus den VORAB-Abfragen wiederherstellen
--   * drop trigger trigger_einstellungen_geheimnisse on public.einstellungen;
--     drop function public.trg_einstellungen_geheimnisse();
