// The exact fields mirrored from a facilitator/venue's private `profiles/{uid}`
// document into the public `public_profiles/{uid}` document that powers the
// Directory. One shared list — same reasoning as lib/roleRouting.js — so the
// mirror (app/network/page.js, on save) and the "everything else is private"
// filter (app/directory/page.js, in the internal-details reveal) can never
// silently drift apart.
//
// Everything NOT in this list (Snapshot fields like status/fee_range,
// Operational Notes, Strengths/Constraints/Risk notes, etc.) stays only in
// `profiles/{uid}`, which is private by default — see Ops/Decisions/Rich
// Profiles, Directory, and Live Needs.md for the full reasoning.
export const PUBLIC_PROFILE_FIELDS = [
  "full_name",
  "role",
  "photo_url",
  "bio",
  "social_link",
  "website_link",
  "base_location",
  "area",
  "last_minute_availability",
  "key_leaders",
];
