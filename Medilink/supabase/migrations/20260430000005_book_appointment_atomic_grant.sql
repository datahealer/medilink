GRANT EXECUTE ON FUNCTION public.book_appointment_atomic(UUID, UUID, UUID, DATE, TIME, TEXT, BOOLEAN, UUID)
  TO authenticated, service_role;
