"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

const ROLE_LABELS = {
  admin: "Admin",
  organizer: "Organiser",
  facilitator: "Facilitator",
  venue: "Venue",
};
const ROLE_ORDER = ["admin", "organizer", "facilitator", "venue"];

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [members, setMembers] = useState([]);
  const [retreats, setRetreats] = useState([]);
  const [needs, setNeeds] = useState([]);
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
        const role = profileSnap.exists() ? profileSnap.data().role : null;

        if (role !== "admin") {
          // Not an admin — send them to wherever they actually belong.
          if (role === "facilitator" || role === "venue") {
            router.push("/network");
          } else if (role === "organizer") {
            router.push("/dashboard");
          } else {
            router.push("/setup-profile");
          }
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
      } catch (err) {
        setError(`Could not load admin data: ${err.code || err.message}`);
      }
      setLoading(false);
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <p style={{ padding: 40 }}>Loading...</p>;

  function nameFor(uid) {
    const member = members.find((m) => m.id === uid);
    return member ? member.full_name : uid;
  }

  return (
    <main style={{ padding: 40 }}>
      <h1>Admin Overview</h1>
      <p style={{ fontSize: 12, color: "#666" }}>Signed in as {user?.email}</p>
      {error && (
        <p style={{ color: "red" }}>
          {error}
          <br />
          If this says &quot;Missing or insufficient permissions&quot;, the
          updated Firestore Security Rules haven&apos;t been published yet —
          see Step 20 in the build guide.
        </p>
      )}

      <h2>Members ({members.length})</h2>
      {ROLE_ORDER.map((r) => {
        const inRole = members.filter((m) => m.role === r);
        if (inRole.length === 0) return null;
        return (
          <div key={r} style={{ marginBottom: 16 }}>
            <strong>{ROLE_LABELS[r]}</strong>
            <ul>
              {inRole.map((m) => (
                <li key={m.id}>
                  {m.full_name || "(no name on file)"}
                  {m.email ? ` — ${m.email}` : " — (no email on file)"}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <p style={{ fontSize: 12, color: "#666" }}>
        Only members who set up their account after this page was added have
        an email on file. Older accounts show name and role only.
      </p>

      <h2>Retreats ({retreats.length})</h2>
      <ul>
        {retreats.length === 0 && <li>None yet.</li>}
        {retreats.map((r) => (
          <li key={r.id}>
            <strong>{r.title}</strong> — {r.location} — {r.status} —
            organiser: {nameFor(r.owner_id)}
          </li>
        ))}
      </ul>

      <h2>Needs ({needs.length})</h2>
      <ul>
        {needs.length === 0 && <li>None yet.</li>}
        {needs.map((n) => (
          <li key={n.id}>
            <strong>{n.type}</strong>: {n.description} — status: {n.status} —
            posted by: {nameFor(n.owner_id)}
          </li>
        ))}
      </ul>
    </main>
  );
}
