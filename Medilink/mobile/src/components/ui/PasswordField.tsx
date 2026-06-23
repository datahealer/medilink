import React, { forwardRef, useState } from "react";
import { Pressable, type TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/hooks/useTheme";
import { HIT_TARGET } from "@/theme/tokens";
import { TextField, type TextFieldProps } from "./TextField";

/**
 * Password input with a show/hide toggle. Reuses TextField so there is no
 * duplicated field/label/error logic.
 */
export const PasswordField = forwardRef<TextInput, Omit<TextFieldProps, "trailing" | "secureTextEntry">>(
  function PasswordField(props, ref) {
    const { colors } = useTheme();
    const [visible, setVisible] = useState(false);

    return (
      <TextField
        ref={ref}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
        trailing={
          <Pressable
            onPress={() => setVisible((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={visible ? "Hide password" : "Show password"}
            hitSlop={12}
            style={{ minWidth: HIT_TARGET / 2, minHeight: HIT_TARGET / 2, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
          </Pressable>
        }
        {...props}
      />
    );
  }
);
