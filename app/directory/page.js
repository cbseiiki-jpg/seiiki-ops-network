"use client";

// Browse page for facilitator + venue profiles — added 2026-07-29 so the
// photo/bio/social/website fields people fill in on /network actually have
// somewhere to be seen. Organisers, facilitators, and venues all see the
// same list (facilitators/venues browsing each other is deliberate — see
// the Decision note). Admin can view it too, though /admin already shows
// everyone.
//
// Needs a Firestore Security Rule allowing any signed-in member to read
// other members' /profiles documents — see the Decision note for the
// exact text to publish in the Firebase Console.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { normalizeRole } from "@/lib/roleRouting";
import { PortalHeader, PortalFooter } from "@/components/PortalChrome";

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

export default function DirectoryPage() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(undefined);
  const [profiles, setProfiles] = useState([]);
  const [filter, setFilter] = useState("all"); // all | facilitator | venue
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

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
        const fetchedRole = normalizeRole(profileSnap.data().role);
        if (!fetchedRole) {
          router.push("/setup-profile");
          return;
        }
        setRole(fetchedRole);

        const q = query(collection(db, "profiles"), where("role", "in", ["facilitator", "venue"]));
        const snap = await getDocs(q);
        setProfiles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        setError(`Could not load the directory: ${err.code || err.message}`);
      }
      setLoading(false);
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const visible = profiles.filter((p) => filter === "all" || normalizeRole(p.role) === filter);

  return (
    <>
      <PortalHeader email={user?.email} navItems={navItemsFor(role)} activeHref="/directory" onLogout={handleLogout} />
      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full fade-in space-y-6">
        <div>
          <h2 className="text-2xl font-serif text-stone-100">Directory</h2>
          <p className="text-stone-500 text-sm mt-1">
            Facilitators and venues in the network — photos, bios, and how to reach them.
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg p-3">
            {error}
            <br />
            If this says &quot;Missing or insufficient permissions&quot;, the profiles Security Rule
            that lets members browse each other hasn&apos;t been published yet — ask your admin.
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
            const location = p.base_location || p.area;
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
                      {p.full_name || "Unnamed"}{" "}
                      {p.id === user.uid && <span className="text-stone-600">(you)</span>}
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
              </div>
            );
          })}
        </div>
      </main>
      <PortalFooter />
    </>
  );
}
