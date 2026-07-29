UPDATE public.site_rules
SET value = jsonb_set(value, '{limits,flash_deals}', '20', true)
WHERE key = 'homepage_collections';