import { createClient } from '@supabase/supabase-js';

// Supabase PostgreSQL client. The connection values come from .env (see .env.example).
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY,
  {
    // Persist the auth session: the supabase-js default (localStorage), stated explicitly against regressions.
    // With row-level security limited to authenticated users, this session token is attached to every query.
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);
