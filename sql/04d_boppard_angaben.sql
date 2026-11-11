-- =====================================================================
-- 04d: Boppard-Angaben für den Datenschutztext (AP 3, Nachtrag)
--
-- Trägt die Vertretung und die Anschrift ein, die in 04a leer geblieben sind.
-- Quelle: Angabe von Artjom (Vertretung SSV Boppard: Leon Stuckert,
-- Gartenstraße 29, 56154 Boppard).
--
-- Hinweis: Die Adresse des Geschäftsführers ist beim SSV Boppard zugleich die
-- Vereinsadresse (bestätigt von Artjom). Sie erscheint im Datenschutztext.
--
-- Nur Daten, keine Struktur. Läuft in einer Transaktion. Keine Secrets.
-- =====================================================================

begin;

update public.vereine
   set vertretung = 'Leon Stuckert',
       anschrift  = 'Gartenstraße 29',
       plz_ort    = '56154 Boppard'
 where id = '5b0bba2d-0000-4000-8000-000000000001';

commit;

-- KONTROLLE (erwartet: eine Zeile mit den drei Werten, rechtsname 'SSV Boppard 1920 e.V.')
select slug, rechtsname, vertretung, anschrift, plz_ort, land, kontakt_email
  from public.vereine where slug = 'boppard';

-- ROLLBACK:
--   update public.vereine set vertretung = null, anschrift = null, plz_ort = null
--    where slug = 'boppard';
