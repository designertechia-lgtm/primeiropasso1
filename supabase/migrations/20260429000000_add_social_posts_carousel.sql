-- Add carousel post support (article slides as Instagram CAROUSEL_ALBUM)

-- 1. Make video_id nullable (carousel/feed posts may have no video)
ALTER TABLE social_posts ALTER COLUMN video_id DROP NOT NULL;

-- 2. Add article_id (optional, for carousel posts originated from articles)
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS article_id UUID REFERENCES articles(id) ON DELETE CASCADE;

-- 3. Add carousel_image_urls (rendered slide images, in order)
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS carousel_image_urls TEXT[];

-- 4. Update post_type CHECK to include 'carousel'
ALTER TABLE social_posts DROP CONSTRAINT IF EXISTS social_posts_post_type_check;
ALTER TABLE social_posts
  ADD CONSTRAINT social_posts_post_type_check
  CHECK (post_type IN ('reels', 'feed', 'carousel'));

-- 5. Ensure at least one media reference exists (video, image, or carousel)
ALTER TABLE social_posts DROP CONSTRAINT IF EXISTS social_posts_media_check;
ALTER TABLE social_posts
  ADD CONSTRAINT social_posts_media_check
  CHECK (
    video_id IS NOT NULL
    OR image_url IS NOT NULL
    OR (carousel_image_urls IS NOT NULL AND array_length(carousel_image_urls, 1) >= 2)
  );
