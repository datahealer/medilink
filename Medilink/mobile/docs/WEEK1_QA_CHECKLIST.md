# MediLink Mobile — Week 1 Manual QA Checklist

Scope: the 9 foundation/auth screens only. Run each section in **EN-light, EN-dark,
AR-light, AR-dark**, on a **small** and a **large** device.

## Devices / environments
- [ ] Android emulator (Pixel, API 34)
- [ ] Android physical phone via Expo Go (QR)
- [ ] iPhone via EAS dev build (when Mac/iPhone + Apple Developer account available)
- [ ] Small screen (iPhone SE / ~360dp Android)
- [ ] Large screen (iPhone 15/16 / large Android)

## Splash & routing
- [ ] Splash shows logo + animated progress bar
- [ ] First-ever launch → routes to **Welcome**
- [ ] After completing onboarding once → next launch routes to **Sign In**
- [ ] No flash of wrong language/theme before content (waits for hydration)

## Onboarding
- [ ] Exactly 3 slides: Find the right doctor · Book appointments easily · Manage your health records
- [ ] Swipe left/right changes slides; pagination dots track the active slide
- [ ] **Next** advances; **Back** appears from slide 2; **Skip** jumps to Language
- [ ] Slide 3 CTA = **Get Started** → Language selection
- [ ] Onboarding marked complete (relaunch skips it)

## Language selection
- [ ] English and Arabic cards selectable; selected card highlighted
- [ ] Arabic card shows Arabic script (العربية) and RTL hint
- [ ] Continue persists choice
- [ ] EN ↔ AR switch shows the **restart confirmation** dialog
- [ ] After relaunch the chosen language + direction persist

## Sign In
- [ ] Email + password fields; password show/hide toggle works
- [ ] Remember-me checkbox toggles
- [ ] Forgot password link → Forgot Password
- [ ] Validation: empty/invalid email + empty password show inline errors
- [ ] Sign In shows loading state on submit
- [ ] Continue with Google button present (UI-only; shows “coming soon”)
- [ ] Create account link → Sign Up

## Sign Up
- [ ] Full name, email, phone (+968 prefix), password, confirm password
- [ ] +968 prefix shown; phone accepts 8 digits
- [ ] Terms checkbox required; error if unchecked
- [ ] Password policy errors (length/upper/lower/number/special)
- [ ] Passwords-mismatch error on confirm
- [ ] Valid submit → OTP screen (target shows the phone)

## OTP
- [ ] 6 cells; first cell auto-focuses
- [ ] Typing a digit auto-advances to the next cell
- [ ] Backspace on an empty cell moves focus back
- [ ] Resend timer counts down (0:24 → 0:00); then **Resend** becomes tappable
- [ ] Verify with incomplete code shows “enter all 6 digits”
- [ ] Verify (full code) → success → Sign In

## Forgot / Reset Password
- [ ] Forgot: email/phone field + validation; submit → OTP
- [ ] Reset: new + confirm password; **strength meter** updates as you type
- [ ] Mismatch error on confirm
- [ ] Update password → Sign In

## Theme
- [ ] Dev-only theme toggle flips light/dark instantly
- [ ] All screens legible in both light and dark (no hardcoded colours)
- [ ] System theme respected when mode = system

## Arabic / RTL
- [ ] All copy translated (no English leaking through)
- [ ] Layout mirrors (back chevron flips, rows reverse, text right-aligned)
- [ ] OTP cells stay left-to-right (numerals)
- [ ] +968 prefix stays LTR

## Cross-cutting
- [ ] Keyboard never covers the focused input (KeyboardAvoidingView)
- [ ] Tapping outside an input dismisses the keyboard
- [ ] All form screens scroll; submit button reachable on small screens
- [ ] Larger accessibility font size: text wraps, **no overflow / clipping**
- [ ] **No horizontal scrolling** on any screen
- [ ] Touch targets feel ≥44pt (buttons, toggles, OTP cells, links)
- [ ] Back navigation works on every screen (hardware back on Android too)
- [ ] Screen-reader: buttons, inputs, OTP cells, and links are labelled
