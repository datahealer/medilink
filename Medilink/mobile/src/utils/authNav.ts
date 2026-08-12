/**
 * Sign In ↔ Sign Up cross-link navigation (QA MED-023).
 *
 * THE BUG. Both cross-links used `router.replace()`. From the guest wall that produced:
 *
 *     welcome --push--> sign-in --replace--> sign-up      stack: [welcome, sign-up]
 *
 * `replace` drops sign-in from the stack, so Back on sign-up resolved to *welcome* and the
 * screen the user had just come from was gone. QA reported it as Back skipping Sign In.
 *
 * WHY NOT JUST `push` EVERYWHERE. `replace` was not arbitrary — it keeps the stack flat when
 * a user toggles Sign In ↔ Sign Up repeatedly looking for the right screen. Blanket-pushing
 * fixes Back but lets [welcome, sign-in, sign-up, sign-in, sign-up, …] accumulate, so Back
 * then walks the whole chain instead of returning to the guest wall.
 *
 * THE RULE. Both properties are satisfied by asking one question: is the screen I am
 * navigating to the one immediately below me?
 *
 *   • yes → `back()`  — we came from there; unwind instead of stacking a duplicate.
 *   • no  → `push()`  — a genuinely new destination; keep it on the stack so Back returns here.
 *
 * So `welcome → sign-in → sign-up` pushes (Back → sign-in ✓), and tapping "Sign in" from
 * there pops back to the *same* sign-in instance rather than pushing a second one. Depth is
 * bounded at [guest wall, sign-in|sign-up, other] no matter how long the user toggles.
 *
 * Pure and route-name-based (not URL-based) so it can be unit-tested without a navigator:
 * the caller passes `navigation.getState().routes.map(r => r.name)`, which for the auth
 * stack yields entries like "sign-in" / "sign-up".
 */

/** Route names as Expo Router derives them from `app/auth/*.tsx` filenames. */
export const AUTH_ROUTE_SIGN_IN = "sign-in";
export const AUTH_ROUTE_SIGN_UP = "sign-up";

export type CrossLinkAction = "back" | "push";

/**
 * Which navigation action moves to `target` without either losing Back or duplicating a
 * screen already on the stack.
 *
 * @param routeNames current stack, outermost first (`routes.map(r => r.name)`)
 * @param target     route name being navigated to
 */
export function crossLinkAction(
  routeNames: readonly string[],
  target: string
): CrossLinkAction {
  // The entry below the top of the stack. `length - 2` because the last entry is the
  // screen we are currently on, not somewhere we can go back to.
  const previous = routeNames.length >= 2 ? routeNames[routeNames.length - 2] : undefined;
  return previous === target ? "back" : "push";
}
