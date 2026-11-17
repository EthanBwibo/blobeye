-- Each time on the shared board may carry its run's replay, for the ghost: the car's place and heading every
-- tenth of a second, packed by `packReplay` in src/game/ghost.ts. Older times have none.
--
-- The packing is a version letter and 8 letters for the first place, then 6 letters for each moment, so the
-- length alone says how many moments there are. A run of time_ms milliseconds has one at the start and one
-- each tenth of a second after it: floor(time_ms / 100) + 1. A replay more than 3 moments off that is refused
-- (`replayFits` and `REPLAY_SLACK` in ghost.ts apply the same rule before sending).

alter table public.rally_times add column replay text;

alter table public.rally_times add constraint rally_times_replay_check check (
  replay is null
  or (
    replay ~ '^1[A-Za-z0-9_-]+$'
    and (char_length(replay) - 9) % 6 = 0
    and (char_length(replay) - 9) / 6 >= 2
    and abs((char_length(replay) - 9) / 6 - (time_ms / 100 + 1)) <= 3
  )
);

-- The ghost's record is the fastest run on a stage that has a replay.
create index rally_times_stage_replay_time_idx on public.rally_times (stage, time_ms) where replay is not null;
