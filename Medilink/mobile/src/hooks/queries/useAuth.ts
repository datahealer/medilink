import { useMutation, useQuery } from "@tanstack/react-query";

import { queryClient, clearPersistedCache } from "@/providers/QueryProvider";
import { repositories } from "@/data";
import type { SignInInput, SignUpInput } from "@/data/types";
import { useAuthStore } from "@/stores/authStore";
import { usePatientStore } from "@/stores/patientStore";

/**
 * Auth hooks. Transport lives behind the active AuthRepository (mock or real);
 * these wrap it as TanStack mutations and expose the session status from authStore.
 */

export function useSession() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  return { status, user, isAuthed: status === "authed" };
}

export function useSignIn() {
  return useMutation({ mutationFn: (input: SignInInput) => repositories.auth.signIn(input) });
}

export function useSignUp() {
  return useMutation({ mutationFn: (input: SignUpInput) => repositories.auth.signUp(input) });
}

export function useSendOtp() {
  return useMutation({ mutationFn: (phone?: string) => repositories.auth.sendOtp(phone) });
}

export function useVerifyOtp() {
  return useMutation({
    mutationFn: (args: { code: string; phone?: string }) =>
      repositories.auth.verifyOtp(args.code, args.phone),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (identifier: string) => repositories.auth.requestPasswordReset(identifier),
  });
}

export function useResetPassword() {
  return useMutation({ mutationFn: (password: string) => repositories.auth.resetPassword(password) });
}

/**
 * Sign out everywhere: end the session, drop the local active-patient selection,
 * and clear all cached patient data so the next user starts clean.
 */
export function useSignOut() {
  return useMutation({
    mutationFn: () => repositories.auth.signOut(),
    onSettled: () => {
      usePatientStore.getState().reset();
      queryClient.clear();
      void clearPersistedCache(); // don't retain patient data at rest after logout
    },
  });
}

/**
 * Request account deletion, then tear down the local session exactly like sign-out
 * (drop the active patient + clear cached data) so the app returns to a clean signed-out
 * state. The backend performs a soft-delete with a 30-day grace window; medical/legal
 * records are retained and PII is anonymized by a scheduled job (F57 GDPR).
 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: async () => {
      const res = await repositories.auth.deleteAccount();
      // The backend now revokes every refresh token itself (MED-016), so the local sign-out
      // that used to live here is gone. Signing out client-side would also have been the
      // wrong shape: it left the account reachable by simply signing back in, and it hid the
      // deletion_pending state instead of surfacing the restore screen.
      return res;
    },
    onSettled: (res) => {
      // Cached PHI must not survive the request — RLS already denies the server copy, but
      // the on-device cache was fetched while the account was still active.
      if (res?.ok) {
        usePatientStore.getState().reset();
        queryClient.clear();
        void clearPersistedCache();
      }
    },
  });
}

/** Query key for the account lifecycle status (MED-016). */
export const accountStatusKey = ["auth", "account-status"] as const;

/**
 * Account lifecycle status, used by the `(app)` gate to divert a deletion_pending user to
 * the restore-only screen.
 *
 * `staleTime: 0` and a refetch on mount are deliberate: a stale "active" would let a
 * deletion_pending user render app chrome for a frame. The screens behind it would be empty
 * anyway (RLS denies the data), but the correct destination is the restore screen, not a
 * dashboard full of failed queries.
 */
export function useAccountStatus(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: accountStatusKey,
    queryFn: () => repositories.auth.getAccountStatus(),
    enabled: options?.enabled ?? true,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

/**
 * Cancel a pending deletion, then bring the app back to a healthy signed-in state.
 *
 * The cache was cleared when deletion was requested and every query since has been denied
 * by RLS, so those failures are cached as errors. Clearing again after a successful restore
 * forces a clean refetch rather than replaying the denials.
 */
export function useCancelDeletion() {
  return useMutation({
    mutationFn: () => repositories.auth.cancelDeletion(),
    onSuccess: (res) => {
      if (res.ok) queryClient.clear();
    },
  });
}
