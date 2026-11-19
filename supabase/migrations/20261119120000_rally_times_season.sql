-- Seasons on the shared board. Already applied to the live table; kept here so the schema is on record.
-- Times set before seasons began are season 1. The game sends and reads only its own season (`SEASON` in
-- src/game/leaderboard.ts): the top ten, the medal benchmark taken from it, and the stage-record ghost.

alter table public.rally_times add column if not exists season smallint not null default 1;
