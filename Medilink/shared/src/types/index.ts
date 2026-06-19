// Generated Supabase DB types + domain types (extracted from HAMS, reused unchanged).
import type { Database as GeneratedDatabase, Json } from "./supabase";

/**
 * Additive MediLink tables that exist as migrations but aren't yet in the generated
 * types (see supabase/migrations/20260620000001_device_tokens.sql and
 * 20260620000002_notification_preferences.sql). After `npm run db:push` +
 * `npm run db:types` these fold into the generated file and this augmentation can go.
 */
type AdditiveTables = {
  device_tokens: {
    Row: {
      id: string;
      user_id: string;
      token: string;
      platform: string;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      user_id: string;
      token: string;
      platform: string;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      user_id?: string;
      token?: string;
      platform?: string;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  notification_preferences: {
    Row: {
      user_id: string;
      push: boolean;
      email: boolean;
      sms: boolean;
      categories: Json;
      updated_at: string;
    };
    Insert: {
      user_id: string;
      push?: boolean;
      email?: boolean;
      sms?: boolean;
      categories?: Json;
      updated_at?: string;
    };
    Update: {
      user_id?: string;
      push?: boolean;
      email?: boolean;
      sms?: boolean;
      categories?: Json;
      updated_at?: string;
    };
    Relationships: [];
  };
};

export type Database = GeneratedDatabase & {
  public: GeneratedDatabase["public"] & {
    Tables: GeneratedDatabase["public"]["Tables"] & AdditiveTables;
  };
};

export type { Json };
export * from "./facility";
