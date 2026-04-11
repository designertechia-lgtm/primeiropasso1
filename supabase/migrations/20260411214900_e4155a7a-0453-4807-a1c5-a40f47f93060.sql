ALTER TABLE professionals
  ADD COLUMN color_status_pending text DEFAULT '#EAB308',
  ADD COLUMN color_status_confirmed text DEFAULT '#22C55E',
  ADD COLUMN color_status_completed text DEFAULT '#3B82F6',
  ADD COLUMN color_status_cancelled text DEFAULT '#EF4444',
  ADD COLUMN color_payment_pending text DEFAULT '#F97316',
  ADD COLUMN color_payment_paid text DEFAULT '#10B981';