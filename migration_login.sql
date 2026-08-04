-- ΑΝΑΒΑΘΜΙΣΗ ΣΥΝΔΕΣΗΣ (email ανάκτησης PIN) — τρέξε το ΜΙΑ φορά.
alter table stations add column if not exists email text;
alter table stations add column if not exists reset_token text;
alter table stations add column if not exists reset_expires timestamptz;
create index if not exists stations_reset_token_idx on stations (reset_token);

-- Βάλε το δικό σου email στο υπάρχον κατάστημα (ΑΛΛΑΞΕ το παρακάτω):
-- update stations set email = 'to-email-sou@gmail.com' where name ilike 'ΚΑΛΥΨΩ 024';
