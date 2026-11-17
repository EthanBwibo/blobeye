/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The Supabase project for the shared top ten. Without both, the live project named in leaderboard.ts is used. */
  readonly VITE_SUPABASE_URL?: string;
  /** Its publishable key. It is public: the table's rules allow reading and inserting only. */
  readonly VITE_SUPABASE_KEY?: string;
}
