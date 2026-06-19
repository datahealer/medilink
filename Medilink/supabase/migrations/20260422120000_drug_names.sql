CREATE TABLE public.drug_names (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  generic_name TEXT,
  category TEXT
);

ALTER TABLE public.drug_names ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read drug_names"
  ON public.drug_names FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO public.drug_names (name, generic_name, category) VALUES
  ('Metformin', 'Metformin HCl', 'Antidiabetic'),
  ('Paracetamol', 'Acetaminophen', 'Analgesic'),
  ('Amoxicillin', 'Amoxicillin', 'Antibiotic'),
  ('Ibuprofen', 'Ibuprofen', 'NSAID'),
  ('Omeprazole', 'Omeprazole', 'Proton pump inhibitor'),
  ('Atorvastatin', 'Atorvastatin', 'Statin'),
  ('Amlodipine', 'Amlodipine', 'Calcium channel blocker'),
  ('Lisinopril', 'Lisinopril', 'ACE inhibitor'),
  ('Aspirin', 'Acetylsalicylic acid', 'Antiplatelet/NSAID'),
  ('Cetirizine', 'Cetirizine HCl', 'Antihistamine'),
  ('Azithromycin', 'Azithromycin', 'Antibiotic'),
  ('Ciprofloxacin', 'Ciprofloxacin HCl', 'Antibiotic'),
  ('Prednisolone', 'Prednisolone', 'Corticosteroid'),
  ('Salbutamol', 'Albuterol', 'Bronchodilator'),
  ('Losartan', 'Losartan potassium', 'ARB'),
  ('Metoprolol', 'Metoprolol succinate', 'Beta blocker'),
  ('Pantoprazole', 'Pantoprazole', 'Proton pump inhibitor'),
  ('Vitamin D3', 'Cholecalciferol', 'Supplement'),
  ('Zinc Sulphate', 'Zinc sulfate', 'Supplement'),
  ('Doxycycline', 'Doxycycline hyclate', 'Antibiotic'),
  ('Ranitidine', 'Ranitidine HCl', 'H2 blocker'),
  ('Metronidazole', 'Metronidazole', 'Antibiotic'),
  ('Diclofenac', 'Diclofenac sodium', 'NSAID'),
  ('Fluconazole', 'Fluconazole', 'Antifungal'),
  ('Levocetirizine', 'Levocetirizine HCl', 'Antihistamine'),
  ('Clopidogrel', 'Clopidogrel bisulfate', 'Antiplatelet'),
  ('Furosemide', 'Furosemide', 'Diuretic'),
  ('Warfarin', 'Warfarin sodium', 'Anticoagulant'),
  ('Insulin', 'Insulin', 'Antidiabetic'),
  ('Levothyroxine', 'Levothyroxine sodium', 'Thyroid hormone');
