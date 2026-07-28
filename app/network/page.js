"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  updateDoc,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { normalizeRole, destinationFor } from "@/lib/roleRouting";
import { PortalHeader, PortalFooter } from "@/components/PortalChrome";

const inputStyle =
  "w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 placeholder-stone-600 focus:border-emerald-500 focus:outline-none";
const textareaStyle = `${inputStyle} min-h-[72px]`;
const primaryButton =
  "bg-emerald-800 hover:bg-emerald-700 text-stone-100 font-medium py-2 px-4 rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
const NAV_ITEMS = [{ href: "/network", label: "Network" }];

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

export default function NetworkPage() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(undefined);
  const [needs, setNeeds] = useState([]);
  const [profileForm, setProfileForm] = useState({ full_name: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  async function loadNeeds() {
    const q = query(
      collection(db, "needs"),
      where("visibility", "==", "network_visible")
    );
    const snap = await getDocs(q);
    setNeeds(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
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
        await loadNeeds();
      } catch (err) {
        setError(`Could not load needs: ${err.code || err.message}`);
      }
      setLoading(false);
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateProfileField(field, value) {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
    setProfileSaved(false);
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateDoc(doc(db, "profiles", user.uid), { ...profileForm });
      setProfileSaved(true);
    } catch (err) {
      setError(`Could not save your profile: ${err.code || err.message}`);
    }
    setSavingProfile(false);
  }

  async function handleLogout() {
    await signOut(auth);
    router.push("/login");
  }

  async function handleRespond(needId, needOwnerId) {
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
      alert("Response sent.");
    } catch (err) {
      setError(`Could not send response: ${err.code || err.message}`);
    }
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
              <div className="w-12 h-12 rounded-full bg-stone-800 flex items-center justify-center text-stone-400 font-serif text-xl shrink-0">
                {(profileForm.full_name || "?")[0]}
              </div>
              <div>
                <h3 className="font-medium text-stone-100">{profileForm.full_name || "Unnamed"}</h3>
                <p className="text-xs text-stone-500">{isVenue ? "Venue" : "Facilitator"}</p>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-3">
              <div>
                <label className="field-label">{isVenue ? "Venue name" : "Full name"}</label>
                <input
                  className={inputStyle}
                  value={profileForm.full_name || ""}
                  onChange={(e) => updateProfileField("full_name", e.target.value)}
                />
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
          </div>

          {/* Open needs board */}
          <div className="glass-panel rounded-xl p-6 lg:col-span-2 space-y-4">
            <h3 className="font-serif text-lg text-stone-100">Network — Open Needs</h3>
            <div className="space-y-3">
              {needs.length === 0 && <p className="text-sm text-stone-500">No open needs right now.</p>}
              {needs.map((n) => (
                <div key={n.id} className="glass-card rounded-lg p-4 flex items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-amber-900/30 text-amber-400 border border-amber-800/50 mr-2">
                      {n.type}
                    </span>
                    <span className="text-sm text-stone-200">{n.description}</span>
                  </div>
                  <button
                    onClick={() => handleRespond(n.id, n.owner_id)}
                    className="text-xs text-emerald-400 hover:text-emerald-300 shrink-0 cursor-pointer"
                  >
                    Respond
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
      <PortalFooter />
    </>
  );
}
