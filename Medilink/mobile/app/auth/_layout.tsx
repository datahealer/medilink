import React from "react";
import { Stack } from "expo-router";

/** Auth flow stack (sign-in, sign-up, otp, forgot/reset). Headers handled per-screen. */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />;
}
