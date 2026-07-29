"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { normalizeRole, destinationFor } from "@/lib/roleRouting";
import { PortalHeader, PortalFooter } from "@/components/PortalChrome";

const inputStyle =
  "w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 focus:border-emerald-500 focus:outline-none";
const primaryButton =
  "bg-emerald-800 hover:bg-emerald-700 text-stone-100 font-medium py-2 px-4 rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
const NAV_ITEMS = [
  { href: "/admin", label: "Admin" },
  { href: "/directory", label: "Directory" },
  { href: "/retreats", label: "Retreats" },
];

const ROLE_LABELS = {
  admin: "Admin",
  organiser: "Organiser",
  facilitator: "Facilitator",
  venue: "Venue",
};
const ROLE_ORDER = ["admin", "organiser", "facilitator", "venue"];

function generateInviteCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L — avoids mistyping
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [members, setMembers] = useState([]);
  const [retreats, setRetreats] = useState([]);
  const [needs, setNeeds] = useState([]);
  const [invites, setInvites] = useState([]);
  const [inviteRole, setInviteRole] = useState("organiser");
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [lastInvite, setLastInvite] = useState(null); // { code, link }
  const [copied, setCopied] = useState(false);
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
        const role = normalizeRole(profileSnap.exists() ? profileSnap.data().role : null);

        if (role !== "admin") {
          // Not an admin — send them to wherever they actually belong.
          router.push(destinationFor(role) || "/setup-profile");
          return;
        }

        // Admin can read every profile, retreat, and need — this only works
        // once the updated Firestore Security Rules (with the isAdmin()
        // check) have been published in the Firebase Console.
        const membersSnap = await getDocs(collection(db, "profiles"));
        setMembers(membersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

        const retreatsSnap = await getDocs(collection(db, "retreats"));
        setRetreats(retreatsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

        const needsSnap = await getDocs(collection(db, "needs"));
        setNeeds(needsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

        const invitesSnap = await getDocs(collection(db, "invites"));
        setInvites(invitesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        setError(`Could not load admin data: ${err.code || err.message}`);
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

  async function handleGenerateInvite(e) {
    e.preventDefault();
    setInviteError("");
    setCopied(false);
    setGeneratingInvite(true);
    try {
      const code = generateInviteCode();
      await setDoc(doc(db, "invites", code), {
        role: inviteRole,
        created_by: user.uid,
        created_at: serverTimestamp(),
        used: false,
        used_by: null,
      });
      setLastInvite({ code, link: `${window.location.origin}/signup?code=${code}` });
      const invitesSnap = await getDocs(collection(db, "invites"));
      setInvites(invitesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setInviteError(`Could not create invite: ${err.code || err.message}`);
    }
    setGeneratingInvite(false);
  }

  function handleCopyLink() {
    if (!lastInvite) return;
    navigator.clipboard.writeText(lastInvite.link);
    setCopied(true);
  }

  function nameFor(uid) {
    const member = members.find((m) => m.id === uid);
    return member ? member.full_name : uid;
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm text-stone-500">Loading...</p>
      </main>
    );
  }

  const counts = {
    organiser: members.filter((m) => m.role === "organiser").length,
    facilitator: members.filter((m) => m.role === "facilitator").length,
    venue: members.filter((m) => m.role === "venue").length,
    openNeeds: needs.filter((n) => n.status === "open").length,
  };

  return (
    <>
      <PortalHeader email={user?.email} navItems={NAV_ITEMS} activeHref="/admin" onLogout={handleLogout} />
      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full fade-in space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-serif text-stone-100">Admin Overview</h2>
            <p className="text-stone-500 text-sm mt-1">
              Manage roles, invite codes, and cross-platform operational needs.
            </p>
          </div>
          <span className="text-xs px-3 py-1 rounded-full bg-emerald-900/30 text-emerald-400 border border-emerald-800/50">
            Phase 2: Web App MVP
          </span>
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg p-3">
            {error}
            <br />
            If this says &quot;Missing or insufficient permissions&quot;, the Firestore
            Security Rules from the build guide haven&apos;t been published yet.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="glass-card rounded-xl p-5">
            <p className="text-stone-500 text-xs uppercase tracking-wider mb-1">Organisers</p>
            <p className="text-3xl font-serif text-stone-100">{counts.organiser}</p>
          </div>
          <div className="glass-card rounded-xl p-5">
            <p className="text-stone-500 text-xs uppercase tracking-wider mb-1">Facilitators</p>
            <p className="text-3xl font-serif text-stone-100">{counts.facilitator}</p>
          </div>
          <div className="glass-card rounded-xl p-5">
            <p className="text-stone-500 text-xs uppercase tracking-wider mb-1">Venues</p>
            <p className="text-3xl font-serif text-stone-100">{counts.venue}</p>
          </div>
          <div className="glass-card rounded-xl p-5">
            <p className="text-stone-500 text-xs uppercase tracking-wider mb-1">Open Needs</p>
            <p className="text-3xl font-serif text-amber-400">{counts.openNeeds}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="glass-panel rounded-xl p-6 lg:col-span-1">
            <h3 className="font-serif text-lg text-stone-100 mb-1">Invite someone</h3>
            <p className="text-xs text-stone-500 mb-4">
              You assign the role at generation time — the invitee never picks their own.
            </p>
            <form onSubmit={handleGenerateInvite} className="space-y-3">
              <select className={inputStyle} value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                <option value="organiser">Organiser</option>
                <option value="facilitator">Facilitator</option>
                <option value="venue">Venue</option>
              </select>
              <button type="submit" disabled={generatingInvite} className={`w-full ${primaryButton}`}>
                {generatingInvite ? "Generating..." : "Generate invite code"}
              </button>
            </form>
            {inviteError && <p className="mt-3 text-sm text-red-400">{inviteError}</p>}
            {lastInvite && (
              <div className="mt-4 p-3 rounded-lg bg-stone-900/50 border border-white/5">
                <p className="text-xs text-stone-500 mb-1">Send this link:</p>
                <code className="text-xs text-emerald-400 break-all">{lastInvite.link}</code>
                <button
                  onClick={handleCopyLink}
                  className="block mt-2 text-xs text-stone-300 hover:text-stone-100 cursor-pointer"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </div>

          <div className="glass-panel rounded-xl p-6 lg:col-span-2">
            <h3 className="font-serif text-lg text-stone-100 mb-4">Invites sent ({invites.length})</h3>
            <div className="space-y-2">
              {invites.length === 0 && <p className="text-sm text-stone-500">None yet.</p>}
              {invites.map((inv) => (
                <div key={inv.id} className="glass-card rounded-lg p-3 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-stone-400">{inv.id}</code>
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-stone-800 text-stone-300 border border-stone-700">
                      {ROLE_LABELS[inv.role] || inv.role}
                    </span>
                  </div>
                  <span className="text-xs text-stone-500">
                    {inv.used ? `used by ${nameFor(inv.used_by)}` : "not used yet"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-xl p-6">
          <h3 className="font-serif text-lg text-stone-100 mb-1">Members ({members.length})</h3>
          <p className="text-xs text-stone-500 mb-4">
            Only members who set up their account after the admin page was added have an email on file.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {ROLE_ORDER.map((r) => {
              const inRole = members.filter((m) => m.role === r);
              if (inRole.length === 0) return null;
              return (
                <div key={r}>
                  <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">
                    {ROLE_LABELS[r]}
                  </p>
                  <div className="space-y-1">
                    {inRole.map((m) => (
                      <p key={m.id} className="text-sm text-stone-300">
                        {m.full_name || "(no name on file)"}
                        {m.email ? ` — ${m.email}` : " — (no email on file)"}
                      </p>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass-panel rounded-xl p-6">
          <h3 className="font-serif text-lg text-stone-100 mb-4">Retreats ({retreats.length})</h3>
          <div className="space-y-2">
            {retreats.length === 0 && <p className="text-sm text-stone-500">None yet.</p>}
            {retreats.map((r) => (
              <Link
                key={r.id}
                href={`/retreats?id=${r.id}`}
                className="glass-card rounded-lg p-3 flex items-center justify-between block"
              >
                <div>
                  <p className="text-sm text-stone-200">{r.title}</p>
                  <p className="text-xs text-stone-500">{r.location} — organiser: {nameFor(r.owner_id)}</p>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-stone-800 text-stone-300 border border-stone-700">
                  {r.status}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="glass-panel rounded-xl p-6">
          <h3 className="font-serif text-lg text-stone-100 mb-4">Needs ({needs.length})</h3>
          <div className="space-y-2">
            {needs.length === 0 && <p className="text-sm text-stone-500">None yet.</p>}
            {needs.map((n) => (
              <div key={n.id} className="glass-card rounded-lg p-3">
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-amber-900/30 text-amber-400 border border-amber-800/50 mr-2">
                  {n.type}
                </span>
                <span className="text-sm text-stone-200">{n.description}</span>
                <p className="text-xs text-stone-500 mt-1">
                  status: {n.status} — posted by: {nameFor(n.owner_id)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>
      <PortalFooter />
    </>
  );
}
