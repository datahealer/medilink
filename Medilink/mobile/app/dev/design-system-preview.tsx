import React, { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import {
  AppCard,
  AppScreen,
  AppText,
  AppointmentCard,
  BrandIcon,
  Button,
  Checkbox,
  Chip,
  ClinicCard,
  CtaButton,
  DoctorCard,
  FamilyMemberCard,
  HubActionTile,
  Icon,
  Logo,
  PatternCard,
  Text,
  TextField,
} from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useThemeContext } from "@/theme/ThemeProvider";
import { useI18n } from "@/i18n";
import { useLocaleStore } from "@/stores/localeStore";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ marginTop: spacing.lg }}>
      <AppText role="sectionTitle" color="textMuted">{title}</AppText>
      <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>{children}</View>
    </View>
  );
}

/**
 * DEV-ONLY design-system preview (/dev/design-system-preview). Shows every shared
 * component + official assets with an EN/AR · Light/Dark switcher, for approval
 * screenshots BEFORE rolling the components into production screens.
 */
export default function DesignSystemPreview() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { setMode } = useThemeContext();
  const { locale } = useI18n();
  const setLocale = useLocaleStore((s) => s.setLocale);
  const { m } = useLocalSearchParams<{ m?: string }>();

  const modes: { key: string; label: string; mode: "light" | "dark"; loc: "en" | "ar" }[] = [
    { key: "enl", label: "EN Light", mode: "light", loc: "en" },
    { key: "end", label: "EN Dark", mode: "dark", loc: "en" },
    { key: "arl", label: "AR Light", mode: "light", loc: "ar" },
    { key: "ard", label: "AR Dark", mode: "dark", loc: "ar" },
  ];

  // Allow ?m=enl|end|arl|ard to preset the mode (used for headless screenshots).
  useEffect(() => {
    const sel = modes.find((x) => x.key === m);
    if (sel) { setMode(sel.mode); setLocale(sel.loc); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m]);

  return (
    <AppScreen headerVariant="none">
      <AppText role="screenTitle">Design System</AppText>

      {/* Mode switcher */}
      <View style={[styles.switcher, { marginTop: spacing.md }]}>
        {modes.map((m) => {
          const active = m.loc === locale && (m.mode === "dark") === (colors.background === "#160E26");
          return (
            <Pressable
              key={m.key}
              onPress={() => { setMode(m.mode); setLocale(m.loc); }}
              style={[styles.switchBtn, { borderColor: colors.border, backgroundColor: active ? colors.primary : colors.surfaceAlt }]}
            >
              <Text variant="label" weight="700" color={active ? "textOnPrimary" : "text"}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Logos */}
      <Section title="Official logo (light vs dark surface)">
        <View style={[styles.logoRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={[styles.logoSwatch, { backgroundColor: "#F9F4FA" }]}><Logo variant="full" size="md" /></View>
          <View style={[styles.logoSwatch, { backgroundColor: "#2E1A47" }]}><Logo variant="full" size="md" onDark /></View>
        </View>
      </Section>

      {/* Highlights icon set */}
      <Section title="Highlights icons — Care · Reviews · Book · Tips · Doctors">
        <View style={[styles.iconRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {(["care", "reviews", "book", "tips", "doctors"] as const).map((n) => (
            <View key={n} style={[styles.iconCell, { backgroundColor: colors.accent, borderRadius: radii.md }]}>
              <BrandIcon name={n} size={28} color="primary" />
            </View>
          ))}
        </View>
      </Section>

      {/* Typography */}
      <Section title="Typography (AppText roles)">
        <AppCard variant="detail">
          <AppText role="screenTitle">Screen title</AppText>
          <AppText role="cardTitle">Card title</AppText>
          <AppText role="sectionTitle" color="textMuted">Section title</AppText>
          <AppText role="body">Body — connect with trusted healthcare simply.</AppText>
          <AppText role="caption" color="textMuted">Caption · muted</AppText>
        </AppCard>
      </Section>

      {/* Buttons / CTA / chips / inputs */}
      <Section title="Buttons, CTA, chips, inputs">
        <Button label="Primary button" />
        <Button label="Outline button" variant="outline" />
        <CtaButton label="Find your care" mirror={isRTL} />
        <View style={[styles.wrap, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Chip label="Selected" selected />
          <Chip label="Default" />
          <Chip label="Removable" onRemove={() => {}} />
        </View>
        <TextField label="Email" placeholder="name@example.com" />
        <Checkbox checked label="Remember me" onChange={() => {}} />
      </Section>

      {/* Appointment card */}
      <Section title="AppointmentCard (violet + official orb pattern)">
        <AppointmentCard
          statusLabel="Upcoming"
          relativeLabel="in 2 days"
          doctorName="Dr. Aisha Al Harthy"
          subtitle="General Care · Today 4:30 PM"
          initials="AH"
          primaryLabel="Check in"
          secondaryLabel="Reschedule"
          isRTL={isRTL}
        />
      </Section>

      {/* Doctor + clinic cards */}
      <Section title="Doctor & clinic cards">
        <DoctorCard variant="detail" name="Dr. Khalid Al Balushi" specialty="Cardiologist" facility="Royal Hospital" initials="KB" availableTodayLabel="Available today" />
        <DoctorCard name="Dr. Khalid Al Balushi" specialty="Cardiologist" facility="Royal Hospital" metaText="★ 4.9   OMR 25 · 2.1 km" availableTodayLabel="Available today" />
        <DoctorCard variant="recent" name="Dr. Sara Nasser" specialty="Dermatologist" facility="DermaCare" metaText="★ 4.8   OMR 20" visitedLabel="Visited" />
        <ClinicCard name="Aster Clinic — Al Khuwair" meta="Al Khuwair · 24 doctors · 0.8 km" tagLabel="★ 4.7 · Featured" isRTL={isRTL} />
      </Section>

      {/* Orb pattern variants */}
      <Section title="Orb pattern variants (violet hero surfaces only)">
        <View style={[styles.tiles, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {(["large", "medium", "corner", "subtle"] as const).map((v) => (
            <View key={v} style={styles.orbCell}>
              <PatternCard variant="specialty" surface="primary" pattern="orbs" orbVariant={v}>
                <Text variant="caption" style={{ color: "#FFFFFF" }} align="center">{v}</Text>
              </PatternCard>
            </View>
          ))}
        </View>
      </Section>

      {/* Hub + specialty tiles */}
      <Section title="Me Care Hub & specialty tiles">
        <View style={[styles.tiles, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={styles.tileCell}><HubActionTile label="Care" brandIcon="care" /></View>
          <View style={styles.tileCell}><HubActionTile label="Book" brandIcon="book" /></View>
          <View style={styles.tileCell}><HubActionTile label="Doctors" brandIcon="doctors" /></View>
          <View style={styles.tileCell}><HubActionTile label="Reviews" brandIcon="reviews" /></View>
        </View>
      </Section>

      {/* Family member card */}
      <Section title="Family member card">
        <FamilyMemberCard name="Aisha Al Harthy" subtitle="Primary account" active activeLabel="Active" />
        <FamilyMemberCard name="Salim Al Harthy" subtitle="Spouse · 37" />
      </Section>

      {/* Bottom nav preview (static) */}
      <Section title="Bottom navigation">
        <View style={[styles.nav, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.navInner, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <View style={styles.navItem}><Icon name="home" size={24} tint={colors.primary} /><Text variant="caption" color="primary">Home</Text></View>
            <View style={styles.navItem}><Icon name="search" size={24} tint={colors.textMuted} /><Text variant="caption" color="textMuted">Search</Text></View>
            <View style={styles.navItem}><View style={[styles.me, { backgroundColor: colors.primary, borderColor: colors.surface }]}><Logo variant="mark" size="sm" onDark={colors.background !== "#F9F4FA"} /></View></View>
            <View style={styles.navItem}><Icon name="records" size={24} tint={colors.textMuted} /><Text variant="caption" color="textMuted">Records</Text></View>
            <View style={styles.navItem}><Icon name="profile" size={24} tint={colors.textMuted} /><Text variant="caption" color="textMuted">Profile</Text></View>
          </View>
        </View>
        <View style={{ height: spacing.xl }} />
      </Section>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  switcher: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  switchBtn: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  logoRow: { gap: 12 },
  logoSwatch: { flex: 1, height: 96, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  iconRow: { gap: 10, flexWrap: "wrap" },
  iconCell: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  wrap: { flexWrap: "wrap", gap: 8 },
  tiles: { flexWrap: "wrap", gap: 8 },
  tileCell: { width: "23%" },
  orbCell: { width: "23%", height: 72 },
  nav: { borderWidth: 1, borderRadius: 16, paddingVertical: 8 },
  navInner: { alignItems: "flex-start", justifyContent: "space-between" },
  navItem: { flex: 1, alignItems: "center", gap: 2 },
  me: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", borderWidth: 4, marginTop: -16 },
});
