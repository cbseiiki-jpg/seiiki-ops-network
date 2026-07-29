"use client";

// Browse page for facilitator + venue profiles — added 2026-07-29 so the
// photo/bio/social/website fields people fill in on /network actually have
// somewhere to be seen. Organisers, facilitators, and venues all see the
// same list (facilitators/venues browsing each other is deliberate — see
// the Decision note). Admin can view it too, though /admin already shows
// everyone.
//
// Reads from `public_profiles`, not `profiles` — only the Directory-safe
// subset (see lib/publicProfileFields.js) ever lives there. A profile's
// Snapshot/Operational/Text fields stay in `profiles/{uid}`, private by
// default, visible to their owner and admin only unless the owner approves
// a request (below). This split — not a rules trick on one collection — is
// the only way to do "some fields public, some private" in Firestore, since
// Security Rules can only allow or deny a whole document, never individual
// fields within it.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { normalizeRole } from "@/lib/roleRouting";
import { PortalHeader, PortalFooter } from "@/components/PortalChrome";
import { PUBLIC_PROFILE_FIELDS } from "@/lib/publicProfileFields";

const ROLE_LABELS = { facilitator: "Facilitator", venue: "Venue" };

function navItemsFor(role) {
  if (role === "admin") {
    return [
      { href: "/admin", label: "Admin" },
      { href: "/directory", label: "Directory" },
      { href: "/retreats", label: "Retreats" },
    ];
  }
  if (role === "organiser") {
    return [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/directory", label: "Directory" },
      { href: "/retreats", label: "Retreats" },
    ];
  }
  // facilitator / venue
  return [
    { href: "/network", label: "Network" },
    { href: "/directory", label: "Directory" },
  ];
}

// Free-text link fields don't always include "https://" — without this, a
// value like "instagram.com/seiiki" would render as a broken relative link
// instead of an outside link.
function toHref(url) {
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

// Shown once a profile owner has approved your request — fetches the
// private `profiles/{uid}` document on demand (never eagerly, and never as
// a list query) and displays whatever fields aren't already public.
function InternalDetails({ profileUid }) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState("");

  async function handleToggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (details) return; // already fetched once, no need to re-fetch
    setLoadingDetails(true);
    setDetailsError("");
    try {
      const snap = await getDoc(doc(db, "profiles", profileUid));
      setDetails(snap.exists() ? snap.data() : {});
    } catch (err) {
      setDetailsError(`Could not load internal details: ${err.code || err.message}`);
    }
    setLoadingDetails(false);
  }

  const hiddenKeys = new Set([...PUBLIC_PROFILE_FIELDS, "created_at", "email"]);
  const entries = details
    ? Object.entries(details).filter(([key, value]) => !hiddenKeys.has(key) && value)
    : [];

  return (
    <div>
      <button onClick={handleToggle} className="text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer">
        {open ? "Hide internal details" : "View internal details"}
      </button>
      {open && (
        <div className="mt-2 space-y-1 bg-stone-900/60 border border-stone-800 rounded-lg p-2">
          {loadingDetails && <p className="text-xs text-stone-500">Loading...</p>}
          {detailsError && <p className="text-xs text-red-400">{detailsError}</p>}
          {details && entries.length === 0 && (
            <p className="text-xs text-stone-600">Nothing else on file.</p>
          )}
          {entries.map(([key, value]) => (
            <p key={key} className="text-xs text-stone-400 break-words">
              <span className="text-stone-300">{key.replace(/_/g, " ")}:</span>{" "}
              {typeof value === "string" ? value : JSON.stringify(value)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DirectoryPage() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(undefined);
  const [myName, setMyName] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [requestingFor, setRequestingFor] = useState(null);
  const [filter, setFilter] = useState("all"); // all | facilitator | venue
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    let unsubscribeMyRequests = () => {};

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
        const fetchedRole = normalizeRole(profileSnap.data().role);
        if (!fetchedRole) {
          router.push("/setup-profile");
          return;
        }
        setRole(fetchedRole);
        setMyName(profileSnap.data().full_name || "");

        const q = query(collection(db, "public_profiles"), where("role", "in", ["facilitator", "venue"]));
        const snap = await getDocs(q);
        setProfiles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));

        const myRequestsQuery = query(
          collection(db, "profile_access_requests"),
          where("requester_id", "==", firebaseUser.uid)
        );
        unsubscribeMyRequests = onSnapshot(
          myRequestsQuery,
          (reqSnap) => setMyRequests(reqSnap.docs.map((d) => ({ id: d.id, ...d.data() }))),
          () => {} // non-critical — worst case the request button just stays active
        );
      } catch (err) {
        setError(`Could not load the directory: ${err.code || err.message}`);
      }
      setLoading(false);
    });
    return () => {
      unsubscribe();
      unsubscribeMyRequests();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    await signOut(auth);
    router.push("/login");
  }

  function requestStatusFor(profileUid) {
    const req = myRequests.find((r) => r.profile_uid === profileUid);
    return req ? req.status : null; // null | "pending" | "approved" | "denied"
  }

  async function handleRequestAccess(profileUid) {
    setRequestingFor(profileUid);
    try {
      await setDoc(doc(db, "profile_access_requests", `${profileUid}_${user.uid}`), {
        profile_uid: profileUid,
        requester_id: user.uid,
        requester_name: myName || user?.email || "Someone",
        status: "pending",
        created_at: serverTimestamp(),
      });
      // No manual reload — the live myRequests listener above picks it up.
    } catch (err) {
      setError(`Could not send that request: ${err.code || err.message}`);
    }
    setRequestingFor(null);
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm text-stone-500">Loading...</p>
      </main>
    );
  }

  const visible = profiles.filter((p) => filter === "all" || normalizeRole(p.role) === filter);

  return (
    <>
      <PortalHeader email={user?.email} navItems={navItemsFor(role)} activeHref="/directory" onLogout={handleLogout} />
      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full fade-in space-y-6">
        <div>
          <h2 className="text-2xl font-serif text-stone-100">Directory</h2>
          <p className="text-stone-500 text-sm mt-1">
            Facilitators and venues in the network — photos, bios, and how to reach them. Internal
            notes (fees, risk points, and similar) are private — request access below to see them.
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg p-3">
            {error}
            <br />
            If this says &quot;Missing or insufficient permissions&quot;, the Security Rules for the
            new profiles collections haven&apos;t been published yet — ask your admin.
          </p>
        )}

        <div className="flex gap-2">
          {["all", "facilitator", "venue"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                filter === f
                  ? "text-xs px-3 py-1.5 rounded-full bg-emerald-900/30 text-emerald-400 border border-emerald-800/50 cursor-pointer"
                  : "text-xs px-3 py-1.5 rounded-full bg-stone-800 text-stone-300 border border-stone-700 cursor-pointer hover:border-stone-600"
              }
            >
              {f === "all" ? "All" : f === "facilitator" ? "Facilitators" : "Venues"}
            </button>
          ))}
        </div>

        {visible.length === 0 && <p className="text-sm text-stone-500">Nobody to show here yet.</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visible.map((p) => {
            const isVenueProfile = normalizeRole(p.role) === "venue";
            const isSelf = p.id === user.uid;
            const location = p.base_location || p.area;
            const status = requestStatusFor(p.id);
            return (
              <div key={p.id} className="glass-card rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-stone-800 overflow-hidden flex items-center justify-center text-stone-400 font-serif text-lg shrink-0">
                    {p.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (p.full_name || "?")[0]
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-stone-100 truncate">
                      {p.full_name || "Unnamed"} {isSelf && <span className="text-stone-600">(you)</span>}
                    </p>
                    <p className="text-xs text-stone-500">
                      {ROLE_LABELS[normalizeRole(p.role)] || p.role}
                      {location ? ` • ${location}` : ""}
                    </p>
                  </div>
                </div>

                {isVenueProfile && p.last_minute_availability && (
                  <div className="bg-amber-900/20 border border-amber-800/50 rounded-lg p-2">
                    <p className="text-[10px] uppercase tracking-wider text-amber-400 font-medium mb-0.5">
                      Last-minute availability
                    </p>
                    <p className="text-xs text-amber-200/80 break-words">{p.last_minute_availability}</p>
                  </div>
                )}

                {p.bio && <p className="text-sm text-stone-300 break-words">{p.bio}</p>}

                {isVenueProfile && (p.key_leaders || []).length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">Key leaders</p>
                    <div className="flex flex-wrap gap-2">
                      {p.key_leaders.map((leader) => (
                        <div
                          key={leader.id}
                          className="flex items-center gap-1.5 bg-stone-900/60 border border-stone-800 rounded-full pl-1 pr-2 py-1"
                        >
                          <div className="w-5 h-5 rounded-full bg-stone-800 overflow-hidden flex items-center justify-center shrink-0">
                            {leader.photo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={leader.photo_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-stone-600 text-[9px]">{(leader.name || "?")[0]}</span>
                            )}
                          </div>
                          <span className="text-[11px] text-stone-300">
                            {leader.name}
                            {leader.role ? ` · ${leader.role}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(p.social_link || p.website_link) && (
                  <div className="flex gap-3 text-xs pt-1 border-t border-white/10">
                    {p.social_link && (
                      <a href={toHref(p.social_link)} target="_blank" rel="noopener noreferrer" className="wikilink">
                        Social
                      </a>
                    )}
                    {p.website_link && (
                      <a href={toHref(p.website_link)} target="_blank" rel="noopener noreferrer" className="wikilink">
                        Website
                      </a>
                    )}
                  </div>
                )}

                {!isSelf && (
                  <div className="pt-2 border-t border-white/10">
                    {status === "approved" ? (
                      <InternalDetails profileUid={p.id} />
                    ) : status === "pending" ? (
                      <span className="text-xs text-stone-500">Internal details requested — awaiting approval</span>
                    ) : (
                      <button
                        onClick={() => handleRequestAccess(p.id)}
                        disabled={requestingFor === p.id}
                        className="text-xs text-stone-400 hover:text-stone-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {requestingFor === p.id
                          ? "Sending..."
                          : status === "denied"
                            ? "Request denied — ask again"
                            : "Request internal details"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
      <PortalFooter />
    </>
  );
}
