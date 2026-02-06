-- [Fix] Allow anonymous access for login check
-- Problem: 'Found=[0]' on mobile implies RLS blocks SELECT for 'anon' role.
-- PC might have worked due to cached admin session.

-- 1. Reset Policies for applicant_pool
ALTER TABLE public.applicant_pool ENABLE ROW LEVEL SECURITY;

-- Drop existing restrictive policies if any
DROP POLICY IF EXISTS "Anonymous student application" ON public.applicant_pool;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.applicant_pool;
DROP POLICY IF EXISTS "Public read access" ON public.applicant_pool;

-- 2. Create Permissive Policy for Login (SELECT only)
-- We allow 'anon' to SELECT to verify student_id/name.
CREATE POLICY "Public read access" ON public.applicant_pool
FOR SELECT
TO anon, authenticated
USING (true);

-- 3. Grant Permissions
GRANT SELECT ON public.applicant_pool TO anon, authenticated;

-- 4. Also Ensure Profiles are readable if needed (for Teacher login)
GRANT SELECT ON public.profiles TO anon, authenticated;
