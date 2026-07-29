-- MediLink additive migration: Arabic notification content.
-- `title`/`body` on in_app_notifications are always written in English; the
-- frontend previously mirrored that same English text into its Arabic display,
-- so Arabic-locale users saw English sentences inside Arabic-styled cards.
-- Nullable so existing rows and any call site not yet updated fall back to English.
alter table public.in_app_notifications
  add column if not exists title_ar text,
  add column if not exists body_ar  text;
