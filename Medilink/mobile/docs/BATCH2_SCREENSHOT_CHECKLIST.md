# Batch 2 — Android screenshot checklist (for approval)

9 real screens (doctor discovery + notifications). Capture on your Android phone in Expo Go and
send back. Until you approve, these stay **BUILT BUT INCOMPLETE** in `FULL_SCREEN_INVENTORY.md`.

## Setup
1. `cd D:\Medilink\Medilink\mobile` → `npx expo start` → open in Expo Go.
2. `.env`: `EXPO_PUBLIC_DATA_MODE=mock`, `EXPO_PUBLIC_APP_ENV=development`.
3. Sign in: **demo@medilink.test** / **Demo1234!**.
4. Fastest: Dashboard → **grid icon** (top-right, dev) → Screen Gallery → open any screen. Or use
   the in-app paths below.
5. Toggle **dark mode** (moon/sun control); switch **Arabic** via Settings → Language (restart to apply RTL).

## Capture
Columns: **Route** · **How to reach** · **Mock state** · **Theme** · **Lang** · **Compare to PDF** · **Send?**

| # | Route | How to reach | Mock state | Theme | Lang | Compare PDF | Send? |
|--:|---|---|---|---|---|---|---|
| 16 | `/search` | Bottom nav → Search | 5 doctors listed | Light | EN | p17 Search & Results (search, All/Available today/Top rated, "N doctors · Sort: Rating", cards w/ Book/Profile) | ✅ |
| 16b | `/search` | type "cardio" | filtered to 2 | Light | EN | p17 (search filters live) | ✅ |
| 16c | `/search` | apply filter that excludes all (e.g. fee ≤10) | **empty state** | Light | EN | p17 — no-results state | ✅ |
| 16d | `/search` | — | populated | Dark | AR | p43 Search (RTL mirrored) | ✅ |
| 17 | `/search/filters` | Search → funnel icon | specialty/gender/fee/rating | Light | EN | p18 Filters (chips + "Show N results") | ✅ |
| 18 | `/search/specialties` | Dashboard → Top specialties "See all" | 9-tile grid | Light | EN | p18 Specialty Categories (grid + search) | ✅ |
| 19 | `/search/map` | Search → map icon | 3 fee pins + bottom card | Light | EN | p19 Map View (price pins, user dot, bottom doctor card) | ✅ |
| 20 | `/doctors/doc-khalid` | Search → tap a card / Profile | Dr. Khalid | Light | EN | p19 Doctor Details (stats 12y/4.9★/OMR 25, About, Languages, slots, sticky Book) | ✅ |
| 20b | `/doctors/doc-khalid` | — | — | Dark | EN | p43 Doctor Details | ✅ |
| 21 | `/doctors/doc-khalid/reviews` | Doctor Details → "See all reviews" | 3 reviews | Light | EN | p20 Reviews (4.9 + distribution bars + list) | ✅ |
| 44 | `/notifications` | Dashboard → bell | 5 notifications (Today/Earlier) | Light | EN | p31 Notification Center (groups, icons, unread, Mark all) | ✅ |
| 44b | `/notifications` | — | — | Dark | AR | p45 Notifications (RTL) | ✅ |
| 45 | `/notifications/messages` | Notifications → mail icon | 4 messages | Light | EN | p32 Facility Messages | ✅ |
| 46 | `/settings/notifications` | Settings → Notifications | toggles + channels | Light | EN | p32 Notification Preferences (Switches + Push/Email/SMS) | ✅ |

## Known approximations to note (not bugs)
- **Filters fee** uses chip caps (≤10 / ≤20 / ≤30 / Any) instead of a drag slider — no slider
  dependency is installed. Functionally filters the list.
- **Map View** is a branded static map surface with positioned fee pins + a bottom doctor card —
  no live map provider (`react-native-maps` not installed). Pins are tappable and update the card.

Send the ✅ rows. Flag anything off vs the PDF (by screen #) and I'll fix before we mark
`BUILT AND MATCHES`. Booking, payments, appointments, AI, vault, labs, prescriptions, ratings and
appearance (25 screens) remain **NOT BUILT** (preview routes) — those are later batches.
