-- Adds brand color columns to companies for white label PDF customization
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS brand_header_color text,
  ADD COLUMN IF NOT EXISTS brand_accent_color  text;
