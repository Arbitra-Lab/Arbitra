-- Add moderation status enum type
CREATE TYPE review_moderation_status AS ENUM ('pending', 'approved', 'rejected');

-- Add moderation fields to guest_reviews table
ALTER TABLE guest_reviews
  ADD COLUMN IF NOT EXISTS moderation_status review_moderation_status DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS moderation_confidence FLOAT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT DEFAULT NULL;

-- Add moderation fields to host_reviews table
ALTER TABLE host_reviews
  ADD COLUMN IF NOT EXISTS moderation_status review_moderation_status DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS moderation_confidence FLOAT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT DEFAULT NULL;

-- Create indexes for moderation queries
CREATE INDEX IF NOT EXISTS idx_guest_reviews_moderation_status ON guest_reviews(moderation_status);
CREATE INDEX IF NOT EXISTS idx_host_reviews_moderation_status ON host_reviews(moderation_status);
CREATE INDEX IF NOT EXISTS idx_guest_reviews_created_at ON guest_reviews(created_at);
CREATE INDEX IF NOT EXISTS idx_host_reviews_created_at ON host_reviews(created_at);

-- Update existing reviews to be approved (retroactive compatibility)
UPDATE guest_reviews SET moderation_status = 'approved' WHERE moderation_status IS NULL;
UPDATE host_reviews SET moderation_status = 'approved' WHERE moderation_status IS NULL;
