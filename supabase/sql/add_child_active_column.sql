-- Add active column to children table for soft delete functionality
-- This allows children to be "deleted" without actually removing them from the database

ALTER TABLE children ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- Set all existing children to active=true
UPDATE children SET active = true WHERE active IS NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_children_active ON children(active);

-- Add comment to document the column
COMMENT ON COLUMN children.active IS 'Soft delete flag: false means the child is deleted and should not be shown in UI';



