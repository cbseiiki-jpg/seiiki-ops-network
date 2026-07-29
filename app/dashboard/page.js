"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { normalizeRole, destinationFor } from "@/lib/roleRouting";
import { PortalHeader, PortalFooter } from "@/components/PortalChrome";
import { PhotoField } from "@/components/PhotoField";

const inputStyle =
  "w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 placeholder-stone-600 focus:border-emerald-500 focus:outline-none";
const textareaStyle = `${inputStyle} min-h-[72px]`;
const primaryButton =
  "bg-emerald-800 hover:bg-emerald-700 text-stone-100 font-medium py-2 px-4 rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/directory", label: "Directory" },
  { href: "/retreats", label: "Retreats" },
];

// Organisation Snapshot + Relationship Notes fields, from Ops/Templates/Organizer Template.md.
const ORG_FIELDS = [
  { key: "status", label: "Status", placeholder: "Prospect / Active / Past / On Hold" },
  { key: "location", label: "Location" },
  { key: "main_contact", label: "Main contact" },
  { key: "brand_identity", label: "Brand / Retreat identity" },
  { key: "ideal_retreat_types", label: "Ideal retreat types" },
  { key: "typical_audience", label: "Typical audience" },
  { key: "budget_profile", label: "Budget profile" },
  { key: "communication_channel", label: "Communication channel" },
  { key: "last_contact", label: "Last contact" },
];
const RELATIONSHIP_FIELDS = [
  { key: "trust_level", label: "Trust level" },
  { key: "response_style", label: "Response style" },
  { key: "decision_speed", label: "Decision speed" },
  { key: "special_considerations", label: "Special considerations" },
];

export default function DashboardPage() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState(null);
  const [orgForm, setOrgForm] = useState({ name: "My Organization" });
  const [savingOrg, setSavingOrg] = useState(false);
  const [orgSaved, setOrgSaved] = useState(false);
  const [retreats, setRetreats] = useState([]);
  const [myNeeds, setMyNeeds] = useState([]);
  const [responses, setResponses] = useState([]);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [dates, setDates] = useState("");
  const [capacity, setCapacity] = useState("");
  const [theme, setTheme] = useState("");
  const [audience, setAudience] = useState("");

  const [needRetreatId, setNeedRetreatId] = useState("");
  const [needType, setNeedType] = useState("facilitator");
  const [needDescription, setNeedDescription] = useState("");

  const router = useRouter();

  async function ensureOrganization(uid) {
    const q = query(
      collection(db, "organizations"),
      where("created_by", "==", uid)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const found = snap.docs[0];
      setOrgId(found.id);
      setOrgForm({ name: "My Organization", ...found.data() });
      return found.id;
    }
    const newOrg = await addDoc(collection(db, "organizations"), {
      name: "My Organization",
      created_by: uid,
      created_at: serverTimestamp(),
    });
    setOrgId(newOrg.id);
    setOrgForm({ name: "My Organization" });
    return newOrg.id;
  }

  async function loadRetreats(ownerUid) {
    if (!ownerUid) return;
    const q = query(collection(db, "retreats"), where("owner_id", "==", ownerUid));
    const snap = await getDocs(q);
    setRetreats(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  useEffect(() => {
    // "Your needs" and its responses are live (onSnapshot) — a response
    // from a facilitator/venue appears here the moment it's written,
    // without reloading the page. Posting a new need also shows up on its
    // own for the same reason, so there's no manual refresh call needed
    // after handleCreateNeed anymore.
    let unsubscribeNeeds = () => {};
    let unsubscribeResponses = () => {};

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
        const fetchedRole = normalizeRole(profileSnap.data().role);
        setRole(fetchedRole);
        if (fetchedRole !== "organiser") {
          // This page is organiser-only — everyone else belongs somewhere else.
          router.push(destinationFor(fetchedRole) || "/setup-profile");
          return;
        }
        await ensureOrganization(firebaseUser.uid);
        await loadRetreats(firebaseUser.uid);

        const needsQuery = query(collection(db, "needs"), where("owner_id", "==", firebaseUser.uid));
        unsubscribeNeeds = onSnapshot(
          needsQuery,
          (snap) => setMyNeeds(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
          (err) => setError(`Could not load your needs: ${err.code || err.message}`)
        );

        const responsesQuery = query(
          collection(db, "need_responses"),
          where("need_owner_id", "==", firebaseUser.uid)
        );
        unsubscribeResponses = onSnapshot(
          responsesQuery,
          (snap) => setResponses(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
          (err) => setError(`Could not load responses: ${err.code || err.message}`)
        );
      } catch (err) {
        setError(`Could not load your data: ${err.code || err.message}`);
      }
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeNeeds();
      unsubscribeResponses();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateOrgField(field, value) {
    setOrgForm((prev) => ({ ...prev, [field]: value }));
    setOrgSaved(false);
  }

  async function handleSaveOrgProfile(e) {
    e.preventDefault();
    setSavingOrg(true);
    try {
      await updateDoc(doc(db, "organizations", orgId), { ...orgForm });
      setOrgSaved(true);
    } catch (err) {
      setError(`Could not save your organisation profile: ${err.code || err.message}`);
    }
    setSavingOrg(false);
  }

  async function handleCreateRetreat(e) {
    e.preventDefault();
    try {
      await addDoc(collection(db, "retreats"), {
        org_id: orgId,
        owner_id: user.uid,
        title,
        location,
        dates,
        capacity,
        theme,
        audience,
        status: "Lead",
        visibility: "private",
        created_at: serverTimestamp(),
      });
      setTitle("");
      setLocation("");
      setDates("");
      setCapacity("");
      setTheme("");
      setAudience("");
      await loadRetreats(user.uid);
    } catch (err) {
      setError(`Could not create retreat: ${err.code || err.message}`);
    }
  }

  async function handleCreateNeed(e) {
    e.preventDefault();
    try {
      await addDoc(collection(db, "needs"), {
        retreat_id: needRetreatId,
        owner_id: user.uid,
        type: needType,
        description: needDescription,
        visibility: "network_visible",
        status: "open",
        created_at: serverTimestamp(),
      });
      setNeedDescription("");
      // No manual reload — the live listener above adds it automatically.
    } catch (err) {
      setError(`Could not post need: ${err.code || err.message}`);
    }
  }

  async function handleToggleNeedStatus(needId, currentStatus) {
    const nextStatus = currentStatus === "open" ? "closed" : "open";
    try {
      await updateDoc(doc(db, "needs", needId), { status: nextStatus });
      // No manual reload — the live listener above reflects it automatically.
    } catch (err) {
      setError(`Could not update need: ${err.code || err.message}`);
    }
  }

  function responsesFor(needId) {
    return responses.filter((r) => r.need_id === needId);
  }

  async function handleLogout() {
    await signOut(auth);
    router.push("/login");
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm text-stone-500">Loading...</p>
      </main>
    );
  }

  return (
    <>
      <PortalHeader email={user?.email} navItems={NAV_ITEMS} activeHref="/dashboard" onLogout={handleLogout} />
      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full fade-in space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-serif text-stone-100">Organiser Dashboard</h2>
            <p className="text-stone-500 text-sm mt-1">
              Manage your retreat vision. We handle the operational burden.
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
          {/* Organisation snapshot + relationship notes */}
          <div className="glass-panel rounded-xl p-6 lg:col-span-1 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-stone-800 overflow-hidden flex items-center justify-center text-stone-400 font-serif text-xl shrink-0">
                {orgForm.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={orgForm.photo_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  (orgForm.name || "O")[0]
                )}
              </div>
              <div>
                <h3 className="font-medium text-stone-100">{orgForm.name || "My Organization"}</h3>
                <p className="text-xs text-stone-500">Your organisation profile</p>
              </div>
            </div>

            <form onSubmit={handleSaveOrgProfile} className="space-y-3">
              <PhotoField
                label="Organisation photo / logo"
                photoUrl={orgForm.photo_url}
                storagePath={`org-photos/${user.uid}`}
                onUploaded={(url) => updateOrgField("photo_url", url)}
              />

              <div>
                <label className="field-label">Organisation name</label>
                <input
                  className={inputStyle}
                  value={orgForm.name || ""}
                  onChange={(e) => updateOrgField("name", e.target.value)}
                />
              </div>

              <div>
                <label className="field-label">Bio</label>
                <textarea
                  className={textareaStyle}
                  placeholder="A short introduction — shown on the Directory"
                  value={orgForm.bio || ""}
                  onChange={(e) => updateOrgField("bio", e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Social link</label>
                  <input
                    className={inputStyle}
                    placeholder="Instagram, Facebook, etc."
                    value={orgForm.social_link || ""}
                    onChange={(e) => updateOrgField("social_link", e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Website</label>
                  <input
                    className={inputStyle}
                    placeholder="https://..."
                    value={orgForm.website_link || ""}
                    onChange={(e) => updateOrgField("website_link", e.target.value)}
                  />
                </div>
              </div>

              {ORG_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="field-label">{f.label}</label>
                  <input
                    className={inputStyle}
                    placeholder={f.placeholder}
                    value={orgForm[f.key] || ""}
                    onChange={(e) => updateOrgField(f.key, e.target.value)}
                  />
                </div>
              ))}

              <div className="border-t border-white/10 pt-4">
                <h4 className="text-sm font-medium text-stone-300 mb-3">Relationship notes</h4>
                <div className="space-y-3">
                  {RELATIONSHIP_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className="field-label">{f.label}</label>
                      <input
                        className={inputStyle}
                        value={orgForm[f.key] || ""}
                        onChange={(e) => updateOrgField(f.key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <button type="submit" disabled={savingOrg} className={`w-full ${primaryButton}`}>
                {savingOrg ? "Saving..." : orgSaved ? "Saved" : "Save profile"}
              </button>
            </form>
          </div>

          {/* Retreats, needs, and responses */}
          <div className="glass-panel rounded-xl p-6 lg:col-span-2 space-y-8">
            <div>
              <h3 className="font-serif text-lg text-stone-100 mb-4">Create a retreat</h3>
              <form onSubmit={handleCreateRetreat} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input className={inputStyle} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
                <input className={inputStyle} placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
                <input className={inputStyle} placeholder="Dates (e.g. Nov 12-18, 2026)" value={dates} onChange={(e) => setDates(e.target.value)} />
                <input className={inputStyle} placeholder="Capacity" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
                <input className={inputStyle} placeholder="Theme" value={theme} onChange={(e) => setTheme(e.target.value)} />
                <input className={inputStyle} placeholder="Audience" value={audience} onChange={(e) => setAudience(e.target.value)} />
                <button type="submit" className={`${primaryButton} md:col-span-2`}>Add retreat</button>
              </form>
            </div>

            <div>
              <h3 className="font-serif text-lg text-stone-100 mb-4">Your retreats</h3>
              <div className="space-y-2">
                {retreats.length === 0 && <p className="text-sm text-stone-500">None yet.</p>}
                {retreats.map((r) => (
                  <Link
                    key={r.id}
                    href={`/retreats?id=${r.id}`}
                    className="glass-card rounded-lg p-4 flex items-center justify-between block hover:border-emerald-800/50"
                  >
                    <div>
                      <p className="text-sm font-medium text-stone-200">{r.title}</p>
                      <p className="text-xs text-stone-500">{r.location} {r.dates ? `• ${r.dates}` : ""}</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded bg-stone-800 text-stone-300 border border-stone-700">
                      {r.status}
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-serif text-lg text-stone-100 mb-4">Post a need</h3>
              <form onSubmit={handleCreateNeed} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select className={inputStyle} value={needRetreatId} onChange={(e) => setNeedRetreatId(e.target.value)} required>
                  <option value="">Select a retreat</option>
                  {retreats.map((r) => (
                    <option key={r.id} value={r.id}>{r.title}</option>
                  ))}
                </select>
                <select className={inputStyle} value={needType} onChange={(e) => setNeedType(e.target.value)}>
                  <option value="facilitator">Facilitator</option>
                  <option value="venue">Venue</option>
                  <option value="visa">Visa guidance</option>
                  <option value="marketing">Marketing</option>
                  <option value="other">Other</option>
                </select>
                <textarea
                  className={`${inputStyle} md:col-span-2`}
                  placeholder="Describe what you need"
                  value={needDescription}
                  onChange={(e) => setNeedDescription(e.target.value)}
                  required
                />
                <button type="submit" className={`${primaryButton} md:col-span-2`}>Post need</button>
              </form>
            </div>

            <div>
              <h3 className="font-serif text-lg text-stone-100 mb-4">Your needs</h3>
              <p className="text-xs text-stone-500 -mt-3 mb-4">
                Live — new responses from the network appear here automatically.
              </p>
              <div className="space-y-3">
                {myNeeds.length === 0 && <p className="text-sm text-stone-500">None posted yet.</p>}
                {myNeeds.map((n) => (
                  <div key={n.id} className="glass-card rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-amber-900/30 text-amber-400 border border-amber-800/50">
                        {n.type}
                      </span>
                      <span className="text-xs text-stone-500">status: {n.status}</span>
                      <button
                        onClick={() => handleToggleNeedStatus(n.id, n.status)}
                        className="text-xs text-stone-400 hover:text-stone-200 ml-auto cursor-pointer"
                      >
                        {n.status === "open" ? "Mark filled" : "Reopen"}
                      </button>
                    </div>
                    <p className="text-sm text-stone-300 mb-2 break-words">{n.description}</p>
                    <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">
                      Responses ({responsesFor(n.id).length})
                    </p>
                    {responsesFor(n.id).length === 0 && (
                      <p className="text-xs text-stone-600">No responses yet.</p>
                    )}
                    <div className="space-y-1">
                      {responsesFor(n.id).map((r) => (
                        <p key={r.id} className="text-xs text-stone-400 break-words">
                          <span className="text-stone-200">{r.responder_name || r.responder_id}:</span> {r.message}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
      <PortalFooter />
    </>
  );
}
