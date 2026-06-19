export interface FacilityWithDistance {
  id: string;
  name: string;
  type: string;
  address: { city?: string; street?: string; country?: string; [key: string]: unknown } | null;
  services: string[] | null;
  rating: number | null;
  review_count: number | null;
  is_verified: boolean;
  cover_photo_url: string | null;
  phone: string | null;
  distance_km: number | null;
}

export interface AdminFacility {
  id: string;
  name: string;
  type: string;
  custom_type: string | null;
  description: string | null;
  address: { city?: string; state?: string; country?: string; pincode?: string; [key: string]: unknown } | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo_url: string | null;
  cover_photo_url: string | null;
  services: string[] | null;
  accepted_insurances: string[] | null;
  rating: number | null;
  review_count: number | null;
  status: string;
  is_verified: boolean;
  created_at: string;
  doctor_count: number;
}
