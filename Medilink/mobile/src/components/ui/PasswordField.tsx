import React, { forwardRef, useState } from "react";
import { Pressable, type TextInput } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/i18n";
import { HIT_TARGET } from "@/theme/tokens";
import { Icon } from "./Icon";
import { TextField, type TextFieldProps } from "./TextField";

/**
 * Password input with a show/hide toggle. Reuses TextField so there is no
 * duplicated field/label/error logic.
 *
 * ── ICON vs ACCESSIBILITY LABEL: they intentionally disagree ──
 *
 * These two describe DIFFERENT things, and matching them up is the bug this component
 * used to have (QA MED-002).
 *
 *   • The ICON conveys the CURRENT STATE of the password:
 *       masked  → "eye-off" (slashed)  — the characters are hidden
 *       visible → "eye"     (open)     — the characters are readable
 *
 *   • The ACCESSIBILITY LABEL conveys the ACTION the button performs, because that is
 *     what a screen-reader user needs to hear before activating a control:
 *       masked  → "Show password"
 *       visible → "Hide password"
 *
 * So the two are deliberately inverted relative to each other. The previous code used
 * action semantics for BOTH, which left the icon contradicting what the field was doing.
 * If you "fix" the apparent mismatch below by aligning them, you reintroduce MED-002.
 *
 * `secureTextEntry={!visible}` is the actual masking and must not be touched.
 */
export const PasswordField = forwardRef<TextInput, Omit<TextFieldProps, "trailing" | "secureTextEntry">>(
  function PasswordField(props, ref) {
    const { colors } = useTheme();
    const { t } = useI18n();
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
            // ACTION, not state — see the block comment above.
            accessibilityLabel={visible ? t("common.hidePassword") : t("common.showPassword")}
            hitSlop={12}
            style={{ minWidth: HIT_TARGET / 2, minHeight: HIT_TARGET / 2, alignItems: "center", justifyContent: "center" }}
          >
            {/* STATE, not action — see the block comment above. */}
            <Icon name={visible ? "eye" : "eye-off"} size={20} tint={colors.textMuted} />
          </Pressable>
        }
        {...props}
      />
    );
  }
);
