import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fequekmlticzqxtzucdh.supabase.co';
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlcXVla21sdGljenF4dHp1Y2RoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNjc4NzksImV4cCI6MjEwODg0Mzg3OX0.vEudO2U9X36LRdAGV69RPx7aJtrXt4xPAgMK4mOohwU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const BUCKET_NAME = 'tmj-media';
export const TMJ_MEDIA_BUCKET = 'tmj-media';
