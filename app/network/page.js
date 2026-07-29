"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  addDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { normalizeRole, destinationFor } from "@/lib/roleRouting";
import { PortalHeader, PortalFooter } from "@/components/PortalChrome";
import { PhotoField } from "@/components/PhotoField";
import { PUBLIC_PROFILE_FIELDS } from "@/lib/publicProfileFields";

const inputStyle =
  "w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 placeholder-stone-600 focus:border-emerald-500 focus:outline-none";
const textareaStyle = `${inputStyle} min-h-[72px]`;
const primaryButton =
  "bg-emerald-800 hover:bg-emerald-700 text-stone-100 font-medium py-2 px-4 rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
const NAV_ITEMS = [
  { href: "/network", label: "Network" },
  { href: "/directory", label: "Directory" },
];

// Field sets from Ops/Templates/Facilitator Template.md and Venue Template.md.
const FACILITATOR_SNAPSHOT = [
  { key: "status", label: "Status", placeholder: "Prospect / Vetted / Active / Paused" },
  { key: "base_location", label: "Base location" },
  { key: "modality", label: "Modality" },
  { key: "experience_level", label: "Experience level" },
  { key: "best_fit_themes", label: "Best fit retreat themes" },
  { key: "work_style", label: "Works solo / co-facilitates" },
  { key: "availability_notes", label: "Availability notes" },
  { key: "fee_range", label: "Fee range" },
  { key: "contact_status", label: "Contact status" },
];
const FACILITATOR_FIT = [
  { key: "ideal_group_size", label: "Ideal group size" },
  { key: "ideal_audience", label: "Ideal audience" },
  { key: "tone_style", label: "Tone / style" },
  { key: "languages", label: "Languages" },
];
const FACILITATOR_TEXT = [
  { key: "strengths", label: "Strengths" },
  { key: "constraints", label: "Constraints" },
  { key: "past_placements", label: "Past placements / relevant work" },
  { key: "risk_notes", label: "Risk / friction notes" },
  { key: "open_questions", label: "Open questions" },
];

const VENUE_SNAPSHOT = [
  { key: "status", label: "Status", placeholder: "Researching / Vetted / Preferred / Paused" },
  { key: "area", label: "Area" },
  { key: "capacity", label: "Capacity" },
  { key: "accommodation_style", label: "Accommodation style" },
  { key: "best_retreat_types", label: "Best retreat types" },
  { key: "price_level", label: "Price level" },
  { key: "contact_person", label: "Contact person" },
  { key: "contact_status", label: "Contact status" },
];
const VENUE_OPERATIONAL = [
  { key: "accessibility", label: "Accessibility" },
  { key: "food_flexibility", label: "Food / dietary flexibility" },
  { key: "event_spaces", label: "Event spaces" },
  { key: "internet_reliability", label: "Internet / tech reliability" },
  { key: "noise_profile", label: "Noise profile" },
  { key: "transport_notes", label: "Transport notes" },
];
const VENUE_TEXT = [
  { key: "strengths", label: "Strengths" },
  { key: "constraints", label: "Constraints" },
  { key: "risk_notes", label: "Risk points" },
  { key: "open_questions", label: "Open questions" },
];

// Every place a need can come from. Order here doubles as display order —
// the viewer's own role gets moved to the front at render time so a
// facilitator sees facilitator-needs first without hunting through venue
// needs, and vice versa.
const NEED_TYPE_LABELS = {
  facilitator: "Facilitator needs",
  venue: "Venue needs",
  visa: "Visa guidance needs",
  marketing: "Marketing needs",
  other: "Other needs",
};
const NEED_TYPE_ORDER = ["facilitator", "venue", "visa", "marketing", "other"];

function newLeaderId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function NetworkPage() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(undefined);
  const [needs, setNeeds] = useState([]);
  const [myResponses, setMyResponses] = useState([]);
  const [respondingTo, setRespondingTo] = useState(null);
  const [accessRequests, setAccessRequests] = useState([]);
  const [profileForm, setProfileForm] = useState({ full_name: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    // Both listeners below are "live" (onSnapshot, not a one-time getDocs)
    // so the needs board and your own responses update automatically —
    // no manual page reload needed to see a new need or confirm a response
    // went through.
    let unsubscribeNeeds = () => {};
    let unsubscribeMyResponses = () => {};
    let unsubscribeAccessRequests = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push("/login");
        return;
      }
      setUser(firebaseUser);
      try {
        const profileSnap = await getDoc(doc(db, "profiles", firebaseUser.uid));
        if (!profileSnap.exists()) {
          router.push("/setup-profile");
          return;
        }
        const data = profileSnap.data();
        const fetchedRole = normalizeRole(data.role);
        setRole(fetchedRole);
        setProfileForm({ full_name: "", ...data });
        if (fetchedRole !== "facilitator" && fetchedRole !== "venue") {
          // This page is facilitator/venue-only — everyone else belongs somewhere else.
          router.push(destinationFor(fetchedRole) || "/setup-profile");
          return;
        }

        const needsQuery = query(
          collection(db, "needs"),
          where("visibility", "==", "network_visible"),
          where("status", "==", "open")
        );
        unsubscribeNeeds = onSnapshot(
          needsQuery,
          (snap) => setNeeds(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
          (err) => setError(`Could not load needs: ${err.code || err.message}`)
        );

        // Used only to show "Responded" instead of the button again — if
        // this listener can't read (a rules gap), the page still works,
        // it just won't grey out needs you've already responded to.
        const myResponsesQuery = query(
          collection(db, "need_responses"),
          where("responder_id", "==", firebaseUser.uid)
        );
        unsubscribeMyResponses = onSnapshot(
          myResponsesQuery,
          (snap) => setMyResponses(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
          () => {} // non-critical — fail silently, button just stays active
        );

        // Incoming requests from other members asking to see your private
        // Snapshot/Operational/Text fields — see the Firestore rule note in
        // the Decision doc for why those fields are private by default now.
        const accessRequestsQuery = query(
          collection(db, "profile_access_requests"),
          where("profile_uid", "==", firebaseUser.uid)
        );
        unsubscribeAccessRequests = onSnapshot(
          accessRequestsQuery,
          (snap) => setAccessRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
          (err) => setError(`Could not load access requests: ${err.code || err.message}`)
        );
      } catch (err) {
        setError(`Could not load needs: ${err.code || err.message}`);
      }
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeNeeds();
      unsubscribeMyResponses();
      unsubscribeAccessRequests();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateProfileField(field, value) {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
    setProfileSaved(false);
  }

  function addKeyLeader() {
    const leader = { id: newLeaderId(), name: "", role: "", photo_url: "" };
    setProfileForm((prev) => ({ ...prev, key_leaders: [...(prev.key_leaders || []), leader] }));
    setProfileSaved(false);
  }

  function updateKeyLeader(id, field, value) {
    setProfileForm((prev) => ({
      ...prev,
      key_leaders: (prev.key_leaders || []).map((l) => (l.id === id ? { ...l, [field]: value } : l)),
    }));
    setProfileSaved(false);
  }

  function removeKeyLeader(id) {
    setProfileForm((prev) => ({
      ...prev,
      key_leaders: (prev.key_leaders || []).filter((l) => l.id !== id),
    }));
    setProfileSaved(false);
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateDoc(doc(db, "profiles", user.uid), { ...profileForm });
      // Mirror only the Directory-safe subset into public_profiles — this is
      // what makes the Snapshot/Operational/Text fields above private by
      // default. See lib/publicProfileFields.js.
      const publicSubset = {};
      PUBLIC_PROFILE_FIELDS.forEach((key) => {
        if (profileForm[key] !== undefined) publicSubset[key] = profileForm[key];
      });
      await setDoc(doc(db, "public_profiles", user.uid), publicSubset);
      setProfileSaved(true);
    } catch (err) {
      setError(`Could not save your profile: ${err.code || err.message}`);
    }
    setSavingProfile(false);
  }

  async function handleRequestDecision(requestId, decision) {
    try {
      await updateDoc(doc(db, "profile_access_requests", requestId), { status: decision });
      // No manual reload — the live listener above reflects it automatically.
    } catch (err) {
      setError(`Could not update that request: ${err.code || err.message}`);
    }
  }

  async function handleLogout() {
    await signOut(auth);
    router.push("/login");
  }

  function hasResponded(needId) {
    return myResponses.some((r) => r.need_id === needId);
  }

  async function handleRespond(needId, needOwnerId) {
    setRespondingTo(needId);
    try {
      await addDoc(collection(db, "need_responses"), {
        need_id: needId,
        need_owner_id: needOwnerId,
        responder_id: user.uid,
        responder_name: profileForm.full_name || user?.email || "Someone",
        message: "Interested — please share more details.",
        status: "interested",
        created_at: serverTimestamp(),
      });
      // No alert() — the "Responded" tag appears on its own once the live
      // myResponses listener above picks up the new document.
    } catch (err) {
      setError(`Could not send response: ${err.code || err.message}`);
    }
    setRespondingTo(null);
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm text-stone-500">Loading...</p>
      </main>
    );
  }

  const isVenue = role === "venue";
  const snapshotFields = isVenue ? VENUE_SNAPSHOT : FACILITATOR_SNAPSHOT;
  const textFields = isVenue ? VENUE_TEXT : FACILITATOR_TEXT;

  const pendingAccessRequests = accessRequests.filter((r) => r.status === "pending");

  // Viewer's own need-type first, so it's the first thing they see.
  const orderedTypes = [role, ...NEED_TYPE_ORDER.filter((t) => t !== role)];
  const groupedNeeds = orderedTypes
    .map((type) => ({ type, items: needs.filter((n) => n.type === type) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <PortalHeader email={user?.email} navItems={NAV_ITEMS} activeHref="/network" onLogout={handleLogout} />
      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full fade-in space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-serif text-stone-100">
              {isVenue ? "Sanctuary Partner Profile" : "Facilitator Profile"}
            </h2>
            <p className="text-stone-500 text-sm mt-1">
              Your profile, and the open needs currently visible to the network.
            </p>
          </div>
          <p className="text-xs text-stone-600">
            Signed in as {user?.email} — role on file: {JSON.stringify(role)}
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg p-3">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* My profile */}
          <div className="glass-panel rounded-xl p-6 lg:col-span-1 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-stone-800 overflow-hidden flex items-center justify-center text-stone-400 font-serif text-xl shrink-0">
                {profileForm.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profileForm.photo_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  (profileForm.full_name || "?")[0]
                )}
              </div>
              <div>
                <h3 className="font-medium text-stone-100">{profileForm.full_name || "Unnamed"}</h3>
                <p className="text-xs text-stone-500">{isVenue ? "Venue" : "Facilitator"}</p>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-3">
              <PhotoField
                label="Profile photo"
                photoUrl={profileForm.photo_url}
                storagePath={`profile-photos/${user.uid}`}
                onUploaded={(url) => updateProfileField("photo_url", url)}
              />

              <div>
                <label className="field-label">{isVenue ? "Venue name" : "Full name"}</label>
                <input
                  className={inputStyle}
                  value={profileForm.full_name || ""}
                  onChange={(e) => updateProfileField("full_name", e.target.value)}
                />
              </div>

              <div>
                <label className="field-label">Bio</label>
                <textarea
                  className={textareaStyle}
                  placeholder="A short introduction — shown on the Directory"
                  value={profileForm.bio || ""}
                  onChange={(e) => updateProfileField("bio", e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Social link</label>
                  <input
                    className={inputStyle}
                    placeholder="Instagram, Facebook, etc."
                    value={profileForm.social_link || ""}
                    onChange={(e) => updateProfileField("social_link", e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Website</label>
                  <input
                    className={inputStyle}
                    placeholder="https://..."
                    value={profileForm.website_link || ""}
                    onChange={(e) => updateProfileField("website_link", e.target.value)}
                  />
                </div>
              </div>

              {snapshotFields.map((f) => (
                <div key={f.key}>
                  <label className="field-label">{f.label}</label>
                  <input
                    className={inputStyle}
                    placeholder={f.placeholder}
                    value={profileForm[f.key] || ""}
                    onChange={(e) => updateProfileField(f.key, e.target.value)}
                  />
                </div>
              ))}

              {!isVenue && (
                <div className="border-t border-white/10 pt-4">
                  <h4 className="text-sm font-medium text-stone-300 mb-3">Retreat fit notes</h4>
                  <div className="space-y-3">
                    {FACILITATOR_FIT.map((f) => (
                      <div key={f.key}>
                        <label className="field-label">{f.label}</label>
                        <input
                          className={inputStyle}
                          value={profileForm[f.key] || ""}
                          onChange={(e) => updateProfileField(f.key, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isVenue && (
                <div className="border-t border-white/10 pt-4">
                  <h4 className="text-sm font-medium text-stone-300 mb-3">Operational notes</h4>
                  <div className="space-y-3">
                    {VENUE_OPERATIONAL.map((f) => (
                      <div key={f.key}>
                        <label className="field-label">{f.label}</label>
                        <input
                          className={inputStyle}
                          value={profileForm[f.key] || ""}
                          onChange={(e) => updateProfileField(f.key, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isVenue && (
                <div className="border-t border-white/10 pt-4">
                  <h4 className="text-sm font-medium text-amber-400 mb-1">Last-minute availability</h4>
                  <p className="text-xs text-stone-500 mb-2">
                    Shown to organisers on the Directory — use it to advertise open dates.
                  </p>
                  <textarea
                    className={textareaStyle}
                    placeholder="e.g. Open Aug 10-20, 2026 — 30% off short-notice bookings"
                    value={profileForm.last_minute_availability || ""}
                    onChange={(e) => updateProfileField("last_minute_availability", e.target.value)}
                  />
                </div>
              )}

              {isVenue && (
                <div className="border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-stone-300">Key leaders</h4>
                    <button
                      type="button"
                      onClick={addKeyLeader}
                      className="text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer"
                    >
                      + Add leader
                    </button>
                  </div>
                  <div className="space-y-3">
                    {(profileForm.key_leaders || []).length === 0 && (
                      <p className="text-xs text-stone-600">
                        No key leaders added yet — add the people organisers should know are behind the venue.
                      </p>
                    )}
                    {(profileForm.key_leaders || []).map((leader) => (
                      <div key={leader.id} className="glass-card rounded-lg p-3 space-y-2">
                        <PhotoField
                          photoUrl={leader.photo_url}
                          storagePath={`venue-leaders/${user.uid}/${leader.id}`}
                          onUploaded={(url) => updateKeyLeader(leader.id, "photo_url", url)}
                          size="w-14 h-14"
                        />
                        <input
                          className={inputStyle}
                          placeholder="Name"
                          value={leader.name}
                          onChange={(e) => updateKeyLeader(leader.id, "name", e.target.value)}
                        />
                        <input
                          className={inputStyle}
                          placeholder="Role (e.g. Owner, Head Chef)"
                          value={leader.role}
                          onChange={(e) => updateKeyLeader(leader.id, "role", e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => removeKeyLeader(leader.id)}
                          className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-white/10 pt-4 space-y-3">
                {textFields.map((f) => (
                  <div key={f.key}>
                    <label className="field-label">{f.label}</label>
                    <textarea
                      className={textareaStyle}
                      placeholder="One per line"
                      value={profileForm[f.key] || ""}
                      onChange={(e) => updateProfileField(f.key, e.target.value)}
                    />
                  </div>
                ))}
              </div>

              <button type="submit" disabled={savingProfile} className={`w-full ${primaryButton}`}>
                {savingProfile ? "Saving..." : profileSaved ? "Saved" : "Save profile"}
              </button>
            </form>

            <div className="border-t border-white/10 pt-4">
              <h4 className="text-sm font-medium text-stone-300 mb-1">Access requests</h4>
              <p className="text-xs text-stone-500 mb-3">
                Your Snapshot, Operational, and other internal notes are private by default — only
                you and admin see them. Other members can ask to see them; approve or deny below.
              </p>
              {pendingAccessRequests.length === 0 && (
                <p className="text-xs text-stone-600">No pending requests.</p>
              )}
              <div className="space-y-2">
                {pendingAccessRequests.map((r) => (
                  <div key={r.id} className="glass-card rounded-lg p-3 flex items-center justify-between gap-2">
                    <span className="text-xs text-stone-300 min-w-0 break-words">
                      {r.requester_name || r.requester_id} wants to see your internal notes
                    </span>
                    <div className="flex gap-3 shrink-0">
                      <button
                        onClick={() => handleRequestDecision(r.id, "approved")}
                        className="text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleRequestDecision(r.id, "denied")}
                        className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Open needs board — grouped by type, live */}
          <div className="glass-panel rounded-xl p-6 lg:col-span-2 space-y-6">
            <div>
              <h3 className="font-serif text-lg text-stone-100">Network — Open Needs</h3>
              <p className="text-xs text-stone-500 mt-1">
                Grouped by type so {isVenue ? "venue" : "facilitator"} needs are easy to find. Updates live —
                a need disappears here once the organiser marks it filled.
              </p>
            </div>

            {needs.length === 0 && <p className="text-sm text-stone-500">No open needs right now.</p>}

            {groupedNeeds.map((group) => (
              <div key={group.type}>
                <h4 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  {NEED_TYPE_LABELS[group.type] || group.type}
                  {group.type === role && (
                    <span className="text-[10px] normal-case tracking-normal px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400 border border-emerald-800/50">
                      for you
                    </span>
                  )}
                </h4>
                <div className="space-y-3">
                  {group.items.map((n) => (
                    <div
                      key={n.id}
                      className="glass-card rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-amber-900/30 text-amber-400 border border-amber-800/50 mr-2 inline-block mb-1">
                          {n.type}
                        </span>
                        <span className="text-sm text-stone-200 break-words">{n.description}</span>
                      </div>
                      {hasResponded(n.id) ? (
                        <span className="text-xs text-stone-500 shrink-0">Responded</span>
                      ) : (
                        <button
                          onClick={() => handleRespond(n.id, n.owner_id)}
                          disabled={respondingTo === n.id}
                          className="text-xs text-emerald-400 hover:text-emerald-300 shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-left sm:text-right"
                        >
                          {respondingTo === n.id ? "Sending..." : "Respond"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
      <PortalFooter />
    </>
  );
}
