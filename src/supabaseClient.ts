import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://kfawjltveddyoqewayzh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmYXdqbHR2ZWRkeW9xZXdheXpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNjY0NzMsImV4cCI6MjA4OTg0MjQ3M30._oCJg10y_0dyCalOsSiHQ9PZUwW2dZV-2IcseWrWg9k";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
