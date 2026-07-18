DELETE FROM "assets"
WHERE "provider_id" IN (
  'alchemix-usd',
  'crvusd',
  'dai',
  'dola-usd',
  'ethena-usde',
  'first-digital-usd',
  'frax',
  'gemini-dollar',
  'global-dollar',
  'liquity-usd',
  'magic-internet-money',
  'pax-dollar',
  'paypal-usd',
  'resolv-usr',
  'ripple-usd',
  'sky-dollar',
  'tether',
  'true-usd',
  'usd-coin',
  'usd1-wlfi',
  'usdd',
  'usds',
  'usdx-money-usdx',
  'usual-usd'
)
OR "category_id" IN (
  SELECT "id"
  FROM "categories"
  WHERE lower(trim("provider_id")) ~ '(^|[^a-z0-9])stable[ -]?coins?$'
     OR lower(trim("name")) ~ '(^|[^a-z0-9])stable[ -]?coins?$'
);

DELETE FROM "categories"
WHERE (
  lower(trim("provider_id")) ~ '(^|[^a-z0-9])stable[ -]?coins?$'
  OR lower(trim("name")) ~ '(^|[^a-z0-9])stable[ -]?coins?$'
)
AND NOT EXISTS (
  SELECT 1
  FROM "assets"
  WHERE "assets"."category_id" = "categories"."id"
);
