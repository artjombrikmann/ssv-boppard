-- =====================================================================
-- 04_vorab_schema_pruefung.sql  –  NUR LESEN (AP 3, Vorbereitung)
--
-- Ändert nichts. Liefert genau EIN Ergebnis (eine Zelle, JSON), das
-- Claude braucht, um sql/04a_… und 04b_… passend zum echten Schema zu
-- schreiben (Spalten von preise, shop_anfragen, schicht_vorlagen,
-- CHECK-Constraints, vorhandene Werte, Trigger, Policies).
--
-- Enthält KEINE Geheimnisse: freischaltcode und admin_email werden
-- aus der einstellungen-Zeile entfernt. Es werden keine E-Mails,
-- Namen oder Punktestände einzelner Personen ausgegeben.
--
-- Ausführen: Supabase SQL Editor -> alles einfügen -> Run.
-- Ergebnis: auf die Zelle "ergebnis" klicken, Wert kopieren, an Claude schicken.
-- =====================================================================

select jsonb_build_object(

  -- 1) Spalten der relevanten Tabellen
  'spalten', (
    select jsonb_object_agg(table_name, cols) from (
      select table_name,
             jsonb_agg(jsonb_build_object(
               'spalte', column_name, 'typ', data_type,
               'null', is_nullable, 'default', column_default)
               order by ordinal_position) as cols
        from information_schema.columns
       where table_schema = 'public'
         and table_name in ('preise','shop_anfragen','gutschein_anfragen',
                            'schicht_vorlagen','schicht_vorlagen_positionen',
                            'veranstaltungen','schichten','schichtbelegungen',
                            'kategorien','einstellungen','profiles',
                            'mitgliedschaften','vereine','benachrichtigungen',
                            'push_subscriptions','punkteregeln')
       group by table_name) s),

  -- 2) Constraints (CHECK, FK, UNIQUE, PK)
  'constraints', (
    select jsonb_agg(jsonb_build_object(
             'tabelle', conrelid::regclass::text,
             'name', conname,
             'def', pg_get_constraintdef(oid))
             order by conrelid::regclass::text, conname)
      from pg_constraint
     where connamespace = 'public'::regnamespace
       and conrelid::regclass::text in (
         'preise','shop_anfragen','gutschein_anfragen','schicht_vorlagen',
         'schicht_vorlagen_positionen','veranstaltungen','schichten',
         'schichtbelegungen','kategorien','einstellungen','profiles',
         'push_subscriptions','benachrichtigungen')),

  -- 3) Trigger auf diesen Tabellen
  'trigger', (
    select jsonb_agg(jsonb_build_object(
             'tabelle', tgrelid::regclass::text,
             'name', tgname,
             'def', pg_get_triggerdef(oid))
             order by tgrelid::regclass::text, tgname)
      from pg_trigger
     where not tgisinternal
       and tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)),

  -- 4) Policies (Stand vor dem Switch, nützlich für Rollback und AP 5)
  'policies', (
    select jsonb_agg(jsonb_build_object(
             'tabelle', tablename, 'name', policyname, 'cmd', cmd,
             'using', qual, 'check', with_check)
             order by tablename, policyname)
      from pg_policies where schemaname = 'public'),

  -- 5) Vorhandene Werte (nur Zählungen, keine Personendaten)
  'werte', jsonb_build_object(
    'gutschein_typ_status', (
      select jsonb_agg(jsonb_build_object('typ', typ, 'status', status, 'anzahl', n))
        from (select typ, status, count(*) n from public.gutschein_anfragen
               group by 1, 2) g),
    'shop_anfragen_status', (
      select jsonb_agg(jsonb_build_object('status', status, 'anzahl', n))
        from (select status, count(*) n from public.shop_anfragen group by 1) s),
    'veranstaltungen_kategorie', (
      select jsonb_agg(jsonb_build_object('kategorie', kategorie, 'anzahl', n))
        from (select kategorie, count(*) n from public.veranstaltungen group by 1) v),
    'vorlagen_event_typ', (
      select jsonb_agg(jsonb_build_object('event_typ', event_typ, 'anzahl', n))
        from (select event_typ, count(*) n from public.schicht_vorlagen group by 1) v),
    'gaeste', (select count(*) from public.profiles where is_temp),
    'profile_gesamt', (select count(*) from public.profiles)
  ),

  -- 6) Einstellungen OHNE Geheimnisse (food_pts, food_val, shop_pts, ...)
  'einstellungen', (
    select jsonb_agg(to_jsonb(e) - 'freischaltcode' - 'admin_email')
      from public.einstellungen e),

  -- 7) Preise komplett (Shop-Katalog, keine Personendaten)
  'preise', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from public.preise p),

  -- 8) Gibt es schon Objekte, die AP 3 anlegen würde? (Namenskollisionen)
  'vorhandene_objekte', (
    select jsonb_agg(distinct proname)
      from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname in ('meine_vereine','ist_admin_von','ist_plattform_admin',
                       'verein_beitreten','rangliste','vereins_mitglieder',
                       'temp_user_anlegen','gast_vorschlaege',
                       'gast_zusammenfuehren','shop_einloesen',
                       'shop_anfrage_bearbeiten','verein_anlegen',
                       'verein_der_schicht','ist_admin_ueber_nutzer',
                       'teilt_verein_mit','add_punkte','punkte_abziehen',
                       'increment_schichten_count')),

  -- 9) Funktionssignaturen der Punkte-Funktionen (Überladungen?)
  'punkte_funktionen', (
    select jsonb_agg(oid::regprocedure::text)
      from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname in ('add_punkte','punkte_abziehen','increment_schichten_count')),

  -- 10) Fremdschlüssel auf profiles / auth.users (Gäste ohne Auth-Konto?)
  'fk_auf_profiles_und_auth', (
    select jsonb_agg(jsonb_build_object(
             'tabelle', conrelid::regclass::text, 'name', conname,
             'def', pg_get_constraintdef(oid)))
      from pg_constraint
     where contype = 'f'
       and confrelid in ('public.profiles'::regclass, 'auth.users'::regclass))

) as ergebnis;
