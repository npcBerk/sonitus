ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_category_id_fkey";
ALTER TABLE "assets" DROP COLUMN IF EXISTS "category_id";
DROP TABLE IF EXISTS "categories";
