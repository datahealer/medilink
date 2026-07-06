"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@medilink/shared";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";

export interface MyIdentity {
  /** "Test Patient" — the full name from the `profiles` table. */
  fullName: string;
  /** "Test P." — compact form for the header (first name + last initial). */
  shortName: string;
  /** "TP" — avatar initials. */
  initials: string;
  /** Authenticated account email. */
  email: string;
  /** Account phone, when present. */
  phone: string;
  /** True until the profile row has been fetched at least once. */
  loading: boolean;
}

const EMPTY: MyIdentity = {
  fullName: "",
  shortName: "",
  initials: "",
  email: "",
  phone: "",
  loading: true,
};

function localPart(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

function deriveInitials(fullName: string, email: string): string {
  const words = fullName.split(/\s+/).filter((w) => w && !/^dr\.?$/i.test(w));
  const fromName = words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  if (fromName) return fromName;
  return (email[0] ?? "").toUpperCase();
}

function deriveShortName(fullName: string, email: string): string {
  const words = fullName.split(/\s+/).filter(Boolean);
  if (words.length === 0) return localPart(email);
  const first = words[0]!;
  const lastInitial = words.length > 1 ? words[words.length - 1]![0] : "";
  return lastInitial ? `${first} ${lastInitial.toUpperCase()}.` : first;
}

/**
 * The single source of truth for the logged-in user's display identity.
 *
 * Reads the authenticated session from `useAuth()` (so it re-fetches on
 * login / logout / account switch without a hard refresh) and hydrates the
 * canonical name/email from `api.profile.getMyProfile` — the same backend
 * source the dashboard greeting and profile page use. No hardcoded values.
 */
export function useMyProfile(): MyIdentity {
  const { user, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const userId = user?.id ?? null;
  const sessionEmail = user?.email ?? "";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Signed out → clear any previously loaded identity so the header never
    // shows the prior account's data.
    if (!userId) {
      setFullName("");
      setEmail("");
      setPhone("");
      setLoaded(!authLoading);
      return;
    }

    let active = true;
    setLoaded(false);
    api.profile
      .getMyProfile(supabase)
      .then((profile) => {
        if (!active) return;
        const acc = profile.account;
        setFullName((acc?.full_name ?? "").trim());
        setEmail(acc?.email ?? sessionEmail);
        setPhone(acc?.phone ?? "");
      })
      .catch(() => {
        // Fall back to the session email so we still show the *right* account.
        if (!active) return;
        setFullName("");
        setEmail(sessionEmail);
        setPhone("");
      })
      .finally(() => {
        if (active) setLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [userId, sessionEmail, authLoading, supabase]);

  return useMemo<MyIdentity>(() => {
    if (!userId && authLoading) return EMPTY;
    const effectiveEmail = email || sessionEmail;
    return {
      fullName,
      shortName: deriveShortName(fullName, effectiveEmail),
      initials: deriveInitials(fullName, effectiveEmail),
      email: effectiveEmail,
      phone,
      loading: !loaded,
    };
  }, [userId, authLoading, fullName, email, sessionEmail, phone, loaded]);
}
