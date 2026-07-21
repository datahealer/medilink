import { useMutation } from "@tanstack/react-query";

import { queryClient } from "@/providers/QueryProvider";
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
      // The backend soft-delete does NOT revoke the current token, so end the local
      // session ourselves once the request is accepted.
      if (res.ok) await repositories.auth.signOut().catch(() => {});
      return res;
    },
    onSettled: (res) => {
      // Only tear down local state when deletion was actually accepted.
      if (res?.ok) {
        usePatientStore.getState().reset();
        queryClient.clear();
      }
    },
  });
}
