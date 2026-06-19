CREATE POLICY "doctors_self_insert"
ON public.doctors
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());