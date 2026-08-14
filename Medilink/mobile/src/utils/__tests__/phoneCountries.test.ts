import fs from "fs";
import path from "path";

import {
  DEFAULT_PHONE_COUNTRY,
  PHONE_COUNTRIES,
  PHONE_COUNTRY_LIST,
  detectPhoneCountry,
  phoneCountryForDialCode,
  phoneE164,
  phoneInput,
  phoneLocal,
  searchPhoneCountries,
  type PhoneCountryIso,
} from "@medilink/shared/mobile";
import { phoneProblem } from "../validation";

/**
 * Multi-country phone entry.
 *
 * The rule this suite defends is the one that produced the G2 corruption: a number is only
 * ever interpreted against a country's OWN length, and a value that does not fit is
 * REJECTED rather than truncated into a plausible-looking wrong number. Widening from two
 * countries to fourteen multiplies the ways that can go wrong, so each new country is
 * exercised end to end (input → validate → E.164) rather than merely being present in a
 * record.
 */

const ISOS: PhoneCountryIso[] = [
  "OM", "IN", "US", "CA", "GB", "AU", "CN", "AE", "SA", "QA", "KW", "BH", "PK", "BD",
];

describe("registry integrity", () => {
  it("contains every requested country", () => {
    for (const iso of ISOS) expect(PHONE_COUNTRIES[iso]).toBeDefined();
    expect(Object.keys(PHONE_COUNTRIES)).toHaveLength(14);
  });

  it("every entry is internally consistent", () => {
    for (const c of Object.values(PHONE_COUNTRIES)) {
      expect(c.dialCode).toBe(`+${c.cc}`);
      expect(c.cc).toMatch(/^\d{1,3}$/);
      expect(c.localLength).toBeGreaterThanOrEqual(8);
      expect(c.localLength).toBeLessThanOrEqual(11);
      expect(c.name.length).toBeGreaterThan(1);
      expect(c.nameAr).toMatch(/[؀-ۿ]/); // a real Arabic name, not an English fallback
      expect(c.flag.length).toBeGreaterThan(0);
    }
  });

  it("Oman remains the default — nothing changes for an Omani patient", () => {
    expect(DEFAULT_PHONE_COUNTRY.iso).toBe("OM");
    expect(PHONE_COUNTRIES.OM.localLength).toBe(8);
    expect(PHONE_COUNTRIES.IN.localLength).toBe(10);
  });

  it("the display list puts the two real markets first, then sorts the rest", () => {
    expect(PHONE_COUNTRY_LIST[0]?.iso).toBe("OM");
    expect(PHONE_COUNTRY_LIST[1]?.iso).toBe("IN");
    expect(PHONE_COUNTRY_LIST).toHaveLength(14);
    const rest = PHONE_COUNTRY_LIST.slice(2).map((c) => c.name);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
  });
});

describe("E.164 per country — input, validation and assembly", () => {
  // [iso, a valid local number, a number that is one digit too short]
  const CASES: [PhoneCountryIso, string, string][] = [
    ["OM", "91234567", "9123456"],
    ["IN", "9845367812", "984536781"],
    ["US", "4155552671", "415555267"],
    ["CA", "4165551234", "416555123"],
    ["GB", "7911123456", "791112345"],
    ["AU", "412345678", "41234567"],
    ["CN", "13112345678", "1311234567"],
    ["AE", "501234567", "50123456"],
    ["SA", "512345678", "51234567"],
    ["QA", "33123456", "3312345"],
    ["KW", "51234567", "5123456"],
    ["BH", "36123456", "3612345"],
    ["PK", "3011234567", "301123456"],
    ["BD", "1712345678", "171234567"],
  ];

  it.each(CASES)("%s produces correct E.164 and rejects a short number", (iso, ok, short) => {
    const c = PHONE_COUNTRIES[iso];
    expect(phoneE164(ok, c)).toBe(`${c.dialCode}${ok}`);
    expect(phoneE164(short, c)).toBeNull();
    // One digit too LONG is rejected too — a validator must never truncate.
    expect(phoneE164(ok + "1", c)).toBeNull();
  });

  it.each(CASES)("%s accepts its own valid number in phoneProblem", (iso, ok) => {
    expect(phoneProblem(ok, PHONE_COUNTRIES[iso])).toBeNull();
  });

  it.each(CASES)("%s rejects a too-short number as a FORMAT problem", (iso, _ok, short) => {
    expect(phoneProblem(short, PHONE_COUNTRIES[iso])).toBe("format");
  });

  it("the input cap follows the selected country", () => {
    // Typing 12 digits gets capped to each country's own length, not to Oman's 8.
    expect(phoneInput("123456789012", PHONE_COUNTRIES.OM)).toHaveLength(8);
    expect(phoneInput("123456789012", PHONE_COUNTRIES.IN)).toHaveLength(10);
    expect(phoneInput("123456789012", PHONE_COUNTRIES.CN)).toHaveLength(11);
    expect(phoneInput("123456789012", PHONE_COUNTRIES.AU)).toHaveLength(9);
  });
});

describe("country switching never silently reinterprets a number", () => {
  it("REGRESSION: an Indian number is not truncated into an Oman one", () => {
    // The G2 defect: `digits.slice(-8)` turned +919845367812 into +96845367812 and
    // silently rewrote 12 production patient records.
    expect(phoneE164("9845367812", PHONE_COUNTRIES.OM)).toBeNull();
    expect(phoneProblem("9845367812", PHONE_COUNTRIES.OM)).toBe("format");
  });

  it("an Oman number is rejected under every longer-format country", () => {
    for (const iso of ["IN", "US", "GB", "CN", "PK", "BD"] as PhoneCountryIso[]) {
      expect(phoneE164("91234567", PHONE_COUNTRIES[iso])).toBeNull();
    }
  });

  it("same-length countries interchange cleanly — the digits are the number", () => {
    // US/CA/GB/IN/PK/BD are all 10. Switching between them keeps a 10-digit value valid,
    // which is why the UI clears on switch as a product decision rather than a data rule.
    for (const iso of ["IN", "US", "CA", "GB", "PK", "BD"] as PhoneCountryIso[]) {
      expect(phoneE164("4155552671", PHONE_COUNTRIES[iso])).toBe(
        `${PHONE_COUNTRIES[iso].dialCode}4155552671`
      );
    }
  });

  it("both call sites CLEAR the number when the country changes", () => {
    const root = path.join(__dirname, "..", "..", "..");
    const signUp = fs.readFileSync(path.join(root, "app", "auth", "sign-up.tsx"), "utf8");
    const edit = fs.readFileSync(path.join(root, "app", "(app)", "edit-profile.tsx"), "utf8");
    expect(signUp).toMatch(/onCountryChange=\{\(c\) => \{[\s\S]{0,400}setValue\("phone", ""/);
    expect(edit).toMatch(/onCountryChange=\{\(c\) => \{[\s\S]{0,400}setPhone\(""\)/);
  });
});

describe("detecting the country of an EXISTING stored number", () => {
  it("detects +91 India", () => {
    expect(detectPhoneCountry("+919845367812")?.iso).toBe("IN");
    expect(detectPhoneCountry("919845367812")?.iso).toBe("IN"); // bare, no plus
  });

  it("detects +968 Oman", () => {
    expect(detectPhoneCountry("+96891234567")?.iso).toBe("OM");
    expect(detectPhoneCountry("96891234567")?.iso).toBe("OM");
  });

  it.each([
    ["+447911123456", "GB"],
    ["+61412345678", "AU"],
    ["+8613112345678", "CN"],
    ["+971501234567", "AE"],
    ["+966512345678", "SA"],
    ["+97433123456", "QA"],
    ["+96551234567", "KW"],
    ["+97336123456", "BH"],
    ["+923011234567", "PK"],
    ["+8801712345678", "BD"],
  ])("detects %s as %s", (stored, iso) => {
    expect(detectPhoneCountry(stored)?.iso).toBe(iso);
  });

  it("a longer calling code is never shadowed by a shorter one", () => {
    // "968" must win over any "96"-style prefix, and "880" over "88". The registry sorts
    // longest-code-first precisely for this.
    expect(detectPhoneCountry("+96891234567")?.iso).toBe("OM"); // not KW/SA
    expect(detectPhoneCountry("+96551234567")?.iso).toBe("KW");
    expect(detectPhoneCountry("+966512345678")?.iso).toBe("SA");
    expect(detectPhoneCountry("+8801712345678")?.iso).toBe("BD"); // not CN (+86)
    expect(detectPhoneCountry("+8613112345678")?.iso).toBe("CN");
  });

  it("+1 resolves DETERMINISTICALLY to the United States — a documented limitation", () => {
    // US and Canada share +1 with the same length, so their E.164 is identical and only the
    // FLAG is ambiguous. Telling them apart needs an NANP area-code table. Pinned here so
    // the behaviour is a known decision rather than a surprise.
    expect(detectPhoneCountry("+14155552671")?.iso).toBe("US");
    expect(phoneCountryForDialCode("+1")?.iso).toBe("US");
    // …and both still produce the identical stored value, which is what actually matters.
    expect(phoneE164("4155552671", PHONE_COUNTRIES.US)).toBe("+14155552671");
    expect(phoneE164("4155552671", PHONE_COUNTRIES.CA)).toBe("+14155552671");
  });

  it("an UNSUPPORTED country returns null — never a silent fallback to Oman", () => {
    expect(detectPhoneCountry("+4915112345678")).toBeNull(); // Germany
    expect(detectPhoneCountry("+33612345678")).toBeNull(); // France
    expect(phoneCountryForDialCode("+49")).toBeNull();
  });

  it("a malformed number returns null rather than being forced into a country", () => {
    // The 4 malformed +91 rows in production: 91 followed by 9, 11 and 12 digits.
    expect(detectPhoneCountry("+91984536781")).toBeNull();
    expect(detectPhoneCountry("+9198453678123")).toBeNull();
  });

  it("the local digits shown come from the DETECTED country", () => {
    expect(phoneLocal("+919845367812", PHONE_COUNTRIES.IN)).toBe("9845367812");
    expect(phoneLocal("+96891234567", PHONE_COUNTRIES.OM)).toBe("91234567");
    expect(phoneLocal("+447911123456", PHONE_COUNTRIES.GB)).toBe("7911123456");
    // Read under the WRONG country it yields "" rather than a truncation.
    expect(phoneLocal("+919845367812", PHONE_COUNTRIES.OM)).toBe("");
  });

  it("edit-profile flags an unmappable stored number instead of assuming Oman", () => {
    const edit = fs.readFileSync(
      path.join(__dirname, "..", "..", "..", "app", "(app)", "edit-profile.tsx"),
      "utf8"
    );
    expect(edit).toMatch(/storedCountryUnknown/);
    expect(edit).toContain("phoneCountry.unknown");
  });
});

describe("picker search", () => {
  it("matches the English name", () => {
    expect(searchPhoneCountries("india").map((c) => c.iso)).toEqual(["IN"]);
    expect(searchPhoneCountries("united").map((c) => c.iso).sort()).toEqual(["AE", "GB", "US"]);
  });

  it("matches the Arabic name", () => {
    expect(searchPhoneCountries("الهند").map((c) => c.iso)).toEqual(["IN"]);
    expect(searchPhoneCountries("عُمان").map((c) => c.iso)).toEqual(["OM"]);
  });

  it("matches the dial code with or without a plus", () => {
    expect(searchPhoneCountries("968").map((c) => c.iso)).toEqual(["OM"]);
    expect(searchPhoneCountries("+968").map((c) => c.iso)).toEqual(["OM"]);
    // A prefix search: "9" matches every +9xx code.
    expect(searchPhoneCountries("9").length).toBeGreaterThan(1);
  });

  it("matches the ISO code, and name substrings still count", () => {
    // "om" is Oman's ISO code AND a substring of "United Kingdom", so both are legitimate
    // hits — a name search that ignored substrings would be worse. What matters is that
    // Oman comes FIRST, which it does because the list is ordered OM/IN before the rest
    // and `filter` preserves order.
    const isos = searchPhoneCountries("om").map((c) => c.iso);
    expect(isos).toContain("OM");
    expect(isos[0]).toBe("OM");
    expect(isos).toContain("GB");
  });

  it("an empty query returns the whole list; nonsense returns none", () => {
    expect(searchPhoneCountries("")).toHaveLength(14);
    expect(searchPhoneCountries("   ")).toHaveLength(14);
    expect(searchPhoneCountries("zzzz")).toHaveLength(0);
  });
});

describe("EN/AR and RTL", () => {
  const root = path.join(__dirname, "..", "..");
  const en = fs.readFileSync(path.join(root, "i18n", "en.ts"), "utf8");
  const ar = fs.readFileSync(path.join(root, "i18n", "ar.ts"), "utf8");
  const field = fs.readFileSync(
    path.join(root, "components", "ui", "CountryPhoneField.tsx"),
    "utf8"
  );

  it.each(["title", "searchPlaceholder", "noResults", "selectLabel", "unknown"])(
    "phoneCountry.%s exists in both catalogs",
    (key) => {
      expect(en).toContain(`${key}:`);
      expect(ar).toContain(`${key}:`);
    }
  );

  it("the Arabic strings are Arabic", () => {
    for (const key of ["title", "searchPlaceholder", "noResults", "unknown"]) {
      // Key line + the next one, so a value wrapped by the formatter is still seen.
      const lines = ar.split(/\r?\n/);
      const i = lines.findIndex((l) => l.trim().startsWith(`${key}:`));
      expect(i).toBeGreaterThan(-1);
      expect(`${lines[i]}\n${lines[i + 1] ?? ""}`).toMatch(/[؀-ۿ]/);
    }
  });

  it("the picker shows the Arabic country name when the locale is Arabic", () => {
    expect(field).toMatch(/locale === "ar" \? c\.nameAr : c\.name/);
  });

  it("the field, trigger and list rows all mirror for RTL", () => {
    const rtlRows = field.match(/isRTL \? "row-reverse" : "row"/g) ?? [];
    expect(rtlRows.length).toBeGreaterThanOrEqual(3);
  });

  it("the dial code is forced LTR so it never reverses in an Arabic UI", () => {
    expect(field).toMatch(/writingDirection: "ltr"/);
  });

  it("touch targets clear the 44dp minimum", () => {
    expect(field).toMatch(/height: 48/);
    expect(field).toMatch(/minHeight: 48/);
  });
});

describe("the OTP architecture is untouched", () => {
  const root = path.join(__dirname, "..", "..", "..");
  const strip = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const files = {
    signUp: strip(fs.readFileSync(path.join(root, "app", "auth", "sign-up.tsx"), "utf8")),
    edit: strip(fs.readFileSync(path.join(root, "app", "(app)", "edit-profile.tsx"), "utf8")),
    field: strip(
      fs.readFileSync(path.join(root, "src", "components", "ui", "CountryPhoneField.tsx"), "utf8")
    ),
  };

  it("no screen reintroduces updateUser({phone}), phone_change or linkIdentity", () => {
    for (const [name, src] of Object.entries(files)) {
      expect({ name, hit: /updateUser\(\s*\{\s*phone|phone_change|linkIdentity/.test(src) }).toEqual({
        name,
        hit: false,
      });
    }
  });

  it("no Twilio credential appears in any of these files", () => {
    for (const [name, src] of Object.entries(files)) {
      expect({ name, hit: /TWILIO/.test(src) }).toEqual({ name, hit: false });
    }
  });

  it("signup still sends the picked country's dial code to the existing signUp service", () => {
    expect(files.signUp).toMatch(/dialCode: country\.dialCode/);
  });

  it("edit-profile still writes E.164 and only when the number actually changed", () => {
    // The G2 guarantee: an untouched number is structurally unwritable.
    expect(files.edit).toMatch(/phone !== initialPhone \? \{ phone: phoneE164\(phone, phoneCountry\)/);
  });

  it("editing a number does NOT mark it verified", () => {
    // profiles.phone_verified is never set TRUE from a client. Only the backend link route
    // does that, under the service role, after Twilio returns `approved`.
    expect(files.edit).not.toMatch(/phone_verified:\s*true/);
  });
});

describe("phone_verified lifecycle — verification belongs to a NUMBER, not an account", () => {
  const repoRoot = path.join(__dirname, "..", "..", "..", "..");
  const strip = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const profileApi = strip(
    fs.readFileSync(path.join(repoRoot, "shared", "src", "api", "profile.ts"), "utf8")
  );
  const checkRoute = strip(
    fs.readFileSync(
      path.join(repoRoot, "backend", "src", "app", "api", "auth", "phone", "check", "route.ts"),
      "utf8"
    )
  );
  const editScreen = strip(
    fs.readFileSync(path.join(repoRoot, "mobile", "app", "(app)", "edit-profile.tsx"), "utf8")
  );

  /**
   * CONTRACT CHANGE (20260814020000_lock_phone_verified).
   *
   * These two cases previously asserted `accountPatch.phone_verified = false` inside the
   * phone branch of `updateMyProfile`. That rule has not been dropped — it MOVED into a
   * BEFORE UPDATE trigger, and the column was revoked from `authenticated`.
   *
   * The move makes the guarantee strictly stronger. The old rule only held for callers
   * that went through `updateMyProfile`; the trigger holds for every writer, including a
   * raw PostgREST PATCH that never mentions the column. It also closes the hole the old
   * arrangement left wide open: a client could assert `phone_verified = true` directly.
   *
   * The client must now NOT name the column at all — PostgREST rejects an entire statement
   * that references a column the role cannot write, even to set it false. So the assertion
   * inverts: absence from the payload is the correct state.
   */
  const lockMigration = fs.readFileSync(
    path.join(repoRoot, "supabase", "migrations", "20260814020000_lock_phone_verified.sql"),
    "utf8"
  );

  it("the client never writes phone_verified at all — naming it would fail the UPDATE", () => {
    expect(profileApi).not.toMatch(/accountPatch\.phone_verified\s*=/);
  });

  it("CHANGING the phone still clears verification — now enforced by a database trigger", () => {
    expect(lockMigration).toMatch(/CREATE TRIGGER trg_profiles_phone_verified_trust/);
    expect(lockMigration).toMatch(/BEFORE UPDATE OF phone, phone_verified ON public\.profiles/);
    // The clear is conditional on the number actually changing.
    expect(lockMigration).toMatch(/NEW\.phone IS DISTINCT FROM OLD\.phone[\s\S]*?NEW\.phone_verified := FALSE/);
  });

  it("the clear is conditional, so unrelated profile edits keep verification", () => {
    // Trigger fires only on UPDATE OF phone/phone_verified, and even then the assignment
    // is guarded by `NEW.phone IS DISTINCT FROM OLD.phone` — saving a name or DOB cannot
    // reach it. This is the same invariant the old in-code branch provided.
    expect(lockMigration).toMatch(/IS DISTINCT FROM OLD\.phone AND NOT v_trusted/);
  });

  it("only service_role may assert TRUE", () => {
    expect(lockMigration).toMatch(/NEW\.phone_verified IS TRUE AND OLD\.phone_verified IS DISTINCT FROM TRUE AND NOT v_trusted/);
    expect(lockMigration).toMatch(/REVOKE UPDATE \(phone_verified\) ON public\.profiles FROM authenticated/);
    expect(lockMigration).toMatch(/GRANT UPDATE \(phone_verified\) ON public\.profiles TO service_role/);
  });

  it("the three dead OTP routes that blocked this revoke are gone", () => {
    for (const r of ["send-otp", "resend-otp", "verify-otp"]) {
      const p = path.join(repoRoot, "backend", "src", "app", "api", "auth", r, "route.ts");
      expect({ route: r, exists: fs.existsSync(p) }).toEqual({ route: r, exists: false });
    }
  });

  it("an UNCHANGED phone is never written, so verification survives a plain save", () => {
    // The G2 guarantee doing double duty: edit-profile omits `phone` from the patch unless
    // the value actually changed, so opening the screen and saving a DOB cannot clear
    // verification — the phone branch above is never entered.
    expect(editScreen).toMatch(/phone !== initialPhone \? \{ phone: phoneE164\(phone, phoneCountry\)/);
    // …and `updateMyProfile` only writes keys that are PRESENT.
    expect(profileApi).toMatch(/if \(patch\.phone !== undefined\)/);
    expect(profileApi).toMatch(/if \(Object\.keys\(accountPatch\)\.length > 0\)/);
  });

  it("verification is granted ONLY after Twilio approves, server-side", () => {
    // `approved` is the only success (checkVerification), then the Admin API link, THEN the
    // mirror. The ordering matters: a mirror written before the link would claim
    // verification for a number that was never attached.
    const linkIdx = checkRoute.indexOf("admin.updateUserById");
    const mirrorIdx = checkRoute.indexOf("phone_verified: true");
    expect(linkIdx).toBeGreaterThan(-1);
    expect(mirrorIdx).toBeGreaterThan(linkIdx);
  });

  it("a FAILED or non-approved verification returns before anything is written", () => {
    // The early return on `!result.ok` must precede both writes, or a wrong code could
    // still mark the number verified.
    const guardIdx = checkRoute.indexOf("if (!result.ok)");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(checkRoute.indexOf("admin.updateUserById"));
    expect(guardIdx).toBeLessThan(checkRoute.indexOf("phone_verified: true"));
  });

  it("no client-side code ever sets phone_verified TRUE", () => {
    const clientFiles = {
      profileApi,
      editScreen,
      authService: strip(
        fs.readFileSync(path.join(repoRoot, "mobile", "src", "services", "authService.ts"), "utf8")
      ),
      signUp: strip(
        fs.readFileSync(path.join(repoRoot, "mobile", "app", "auth", "sign-up.tsx"), "utf8")
      ),
    };
    for (const [name, src] of Object.entries(clientFiles)) {
      expect({ name, hit: /phone_verified:\s*true/.test(src) }).toEqual({ name, hit: false });
    }
  });

  it("the badge reads auth.users, not the mirror it might contradict", () => {
    const phoneScreen = strip(
      fs.readFileSync(path.join(repoRoot, "mobile", "app", "(app)", "settings", "phone.tsx"), "utf8")
    );
    expect(phoneScreen).toMatch(/getPhoneConfirmation\(\)/);
    expect(phoneScreen).not.toMatch(/phone_verified/);
  });
});

describe("OTP linking scope stays Oman + India", () => {
  const repoRoot = path.join(__dirname, "..", "..", "..", "..");
  const phoneLink = fs.readFileSync(
    path.join(repoRoot, "backend", "src", "lib", "twilio", "phoneLink.ts"),
    "utf8"
  );

  it("the backend allow-list is exactly OM and IN — widening it is a compliance decision", () => {
    // A patient may STORE any of the 14 supported countries on their profile. SMS
    // VERIFICATION is a different question: each country carries its own telecom
    // registration and per-message cost (US A2P 10DLC, UK sender IDs, India DLT).
    expect(phoneLink).toMatch(/ALLOWED_PHONE_COUNTRIES[^=]*=\s*\[\s*PHONE_COUNTRIES\.OM,\s*PHONE_COUNTRIES\.IN,?\s*\]/);
  });

  it("+968 and +91 normalise for linking", () => {
    // Mirrors the backend's own normalisePhone contract, which iterates the allow-list.
    expect(phoneE164("91234567", PHONE_COUNTRIES.OM)).toBe("+96891234567");
    expect(phoneE164("9845367812", PHONE_COUNTRIES.IN)).toBe("+919845367812");
  });

  it("a supported-but-not-verifiable country is REFUSED, not silently coerced", () => {
    // normalisePhone only matches the allow-list's dial codes; anything else starting with
    // "+" is reported as unsupported_country rather than being read as Oman.
    expect(phoneLink).toMatch(/if \(raw\.startsWith\("\+"\)\) return \{ ok: false, reason: "unsupported_country" \}/);
    expect(phoneLink).not.toMatch(/DEFAULT_PHONE_COUNTRY/); // no Oman fallback in the parser
  });

  it("the client maps that refusal to a country-scoped message, not a generic error", () => {
    const authService = fs.readFileSync(
      path.join(repoRoot, "mobile", "src", "services", "authService.ts"),
      "utf8"
    );
    expect(authService).toMatch(/reason === "unsupported_country"\) return "phone\.errorUnsupportedCountry"/);
    const en = fs.readFileSync(path.join(repoRoot, "mobile", "src", "i18n", "en.ts"), "utf8");
    expect(en).toMatch(/Phone verification isn't available for this country yet/);
  });

  it("the verification screen only offers the two verifiable countries", () => {
    const phoneScreen = fs.readFileSync(
      path.join(repoRoot, "mobile", "app", "(app)", "settings", "phone.tsx"),
      "utf8"
    );
    expect(phoneScreen).toMatch(/PHONE_COUNTRIES\.OM,\s*PHONE_COUNTRIES\.IN/);
  });
});
