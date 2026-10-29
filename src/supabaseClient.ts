import { createClient } from '@supabase/supabase-js';

// Supabase configuration for TMJ Media Storage
export const SUPABASE_URL = 'https://fequekmlticzqxtzucdh.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlcXVla21sdGljenF4dHp1Y2RoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNjc4NzksImV4cCI6MjEwODg0Mzg3OX0.vEudO2U9X36LRdAGV69RPx7aJtrXt4xPAgMK4mOohwU';

export const TMJ_MEDIA_BUCKET = 'tmj-media';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
});
