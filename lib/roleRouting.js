// Single source of truth for "which role goes where."
//
// Every page imports these two functions instead of re-writing its own
// if/else chain of role checks. That's the whole fix: before, five files
// each had their own copy of "if role === 'facilitator' ...", so a role
// value that wasn't spelled *exactly* right (wrong case, a stray space,
// "organiser" vs "organizer") silently fell through to the wrong page in
// some files and not others. Now there's exactly one place that decides,
// and it tolerates the small variations that caused that.

// Canonical spelling is "organiser" (British) everywhere in this app —
// stored value, code checks, and display text all match. "organizer" is
// still accepted here and mapped across, purely so any older account
// saved before this change doesn't get bounced to /setup-profile for no
// reason.
export function normalizeRole(rawRole) {
  if (!rawRole) return null;
  const value = String(rawRole).trim().toLowerCase();
  if (value === "organizer") return "organiser";
  return value;
}

// Returns the page a role belongs on, or null if the role is missing/
// unrecognized. Callers should send a null result to /setup-profile —
// that page overwrites whatever bad data was there with a clean value
// the person picks themselves, so broken accounts fix themselves on
// next login instead of needing anyone to dig through Firestore by hand.
export function destinationFor(rawRole) {
  const role = normalizeRole(rawRole);
  if (role === "admin") return "/admin";
  if (role === "facilitator" || role === "venue") return "/network";
  if (role === "organiser") return "/dashboard";
  return null;
}
