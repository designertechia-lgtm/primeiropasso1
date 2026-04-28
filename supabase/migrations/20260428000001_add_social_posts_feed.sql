-- Add feed post support (image posts) to social_posts
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL DEFAULT 'reels'
  CHECK (post_type IN ('reels', 'feed'));

ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS image_url TEXT;
