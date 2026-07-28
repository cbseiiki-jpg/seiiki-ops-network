"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { normalizeRole, destinationFor } from "@/lib/roleRouting";

export default function NetworkPage() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(undefined);
  const [needs, setNeeds] = useState([]);
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
        const fetchedRole = normalizeRole(profileSnap.data().role);
        setRole(fetchedRole);
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
        message: "Interested — please share more details.",
        status: "interested",
        created_at: serverTimestamp(),
      });
      alert("Response sent.");
    } catch (err) {
      setError(`Could not send response: ${err.code || err.message}`);
    }
  }

  if (loading) return <p style={{ padding: 40 }}>Loading...</p>;

  return (
    <main style={{ padding: 40 }}>
      <h1>Network — Open Needs</h1>
      <p style={{ fontSize: 12, color: "#666" }}>
        Signed in as {user?.email} — role on file: {JSON.stringify(role)}
      </p>
      <button onClick={handleLogout}>Log out</button>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <ul>
        {needs.map((n) => (
          <li key={n.id} style={{ marginBottom: 16 }}>
            <strong>{n.type}</strong>: {n.description}
            <br />
            <button onClick={() => handleRespond(n.id, n.owner_id)}>Respond</button>
          </li>
        ))}
      </ul>
    </main>
  );
}
