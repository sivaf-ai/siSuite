-- Eseguito da Postgres SOLO alla prima inizializzazione del volume.
-- GoTrue (Supabase Auth) si aspetta che lo schema `auth` esista già:
-- le sue migrazioni creano le tabelle dentro `auth.*` ma non lo schema.
CREATE SCHEMA IF NOT EXISTS auth;
