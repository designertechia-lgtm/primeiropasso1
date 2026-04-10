

## Problem

Two issues identified:

1. **Name shows "Profissional"**: Both `PatientBuscar.tsx` and `PatientAgendar.tsx` fetch the name from the `profiles` table (`profile.full_name`), but the professional's name is stored in the `professionals` table (`full_name = "Fagnher Marques"`). The `profiles` table has no row for this user. The fix we did for the landing page and admin profile wasn't applied to these patient-facing pages.

2. **No time slots available**: The `availability` table is empty for this professional. The booking pages check `availability` for configured slots; when none exist, the fallback shows 07:00-20:00 (which should work). However, the real issue is that **the professional has no availability records configured**. The default fallback of 07:00-20:00 should still show slots -- let me verify this is actually working. Looking at the code again, the fallback IS there (line 133/139 in both files), so slots should appear. If the user says they don't, the issue might be on a different page or related to date selection.

**Wait** -- re-reading the user's message: "não tenho disponibilidade dos horários disponíveis para eu escolher". This could mean the availability management page (`AdminDisponibilidade`) isn't accessible/linked in the sidebar, OR the patient side isn't showing slots. Since the fallback logic exists, the patient side should show 07:00-20:00 slots. Let me focus on what's confirmed broken.

## Plan

### Step 1: Fix professional name in patient booking pages
In both `PatientBuscar.tsx` and `PatientAgendar.tsx`:
- Remove the `profiles` query
- Use `professional.full_name` (already available from the `professionals` table) instead of `profile?.full_name`

### Step 2: Ensure availability page is accessible
Verify `AdminDisponibilidade` is linked in the admin sidebar. If it's missing, add a link so the professional can configure their availability slots.

### Technical Details
- `PatientBuscar.tsx` line 220: change `profile?.full_name || "Profissional"` to `(professional as any).full_name || "Profissional"`
- `PatientAgendar.tsx` line 201: same change
- Remove the profile query blocks (lines 46-57 in PatientAgendar, lines 57-68 in PatientBuscar)
- Check `DashboardSidebar.tsx` for the availability link

