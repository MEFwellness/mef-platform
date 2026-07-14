-- Loader for Supabase CLI versions that read a single supabase/seed.sql
-- rather than config.toml's [db.seed] sql_paths glob. Keep files in
-- supabase/seed/ in this exact order — later files depend on earlier ones
-- (users before assignments, assessment questions before submissions).
\i seed/01_onboarding_questions.sql
\i seed/02_users.sql
\i seed/03_assignments_and_data.sql
\i seed/04_ai_agents_and_rules.sql
\i seed/05_safety_message_templates.sql
\i seed/06_mef_content_library.sql
