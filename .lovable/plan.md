

## Problem

The full name is being saved to the `profiles` table, but the landing page and other features read from the `professionals` table, so the name doesn't appear. Adding a `full_name` column directly to `professionals` simplifies access.

## Plan

### Step 1: Database migration
Add a `full_name` column to the `professionals` table:
```sql
ALTER TABLE public.professionals ADD COLUMN full_name text;
```

### Step 2: Update AdminPerfil.tsx save logic
Include `full_name` in the professionals update call (can keep the profiles update too for backward compatibility).

### Step 3: Update AdminPerfil.tsx load logic
Load `fullName` from `professional.full_name` instead of `profile.full_name`.

### Step 4: Update TypeScript types usage
Since `professionals` table will now have `full_name`, the generated types will include it after migration — no `as any` cast needed.

### Step 5: Update landing page references
Anywhere the professional's name is displayed (e.g., `ProfessionalLanding.tsx`, `LandingHeader.tsx`), use `professional.full_name` directly instead of joining with profiles.

