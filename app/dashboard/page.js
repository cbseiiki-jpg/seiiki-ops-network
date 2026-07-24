"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function DashboardPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState(null);
  const [retreats, setRetreats] = useState([]);

  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");

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
      const existingId = snap.docs[0].id;
      setOrgId(existingId);
      return existingId;
    }
    const newOrg = await addDoc(collection(db, "organizations"), {
      name: "My Organization",
      created_by: uid,
      created_at: serverTimestamp(),
    });
    setOrgId(newOrg.id);
    return newOrg.id;
  }

  async function loadRetreats(orgIdToLoad) {
    if (!orgIdToLoad) return;
    const q = query(collection(db, "retreats"), where("org_id", "==", orgIdToLoad));
    const snap = await getDocs(q);
    setRetreats(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push("/login");
        return;
      }
      setUser(firebaseUser);
      const foundOrgId = await ensureOrganization(firebaseUser.uid);
      await loadRetreats(foundOrgId);
      setLoading(false);
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateRetreat(e) {
    e.preventDefault();
    await addDoc(collection(db, "retreats"), {
      org_id: orgId,
      owner_id: user.uid,
      title,
      location,
      status: "planning",
      visibility: "private",
      created_at: serverTimestamp(),
    });
    setTitle("");
    setLocation("");
    await loadRetreats(orgId);
  }

  async function handleCreateNeed(e) {
    e.preventDefault();
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
  }

  async function handleLogout() {
    await signOut(auth);
    router.push("/login");
  }

  if (loading) return <p style={{ padding: 40 }}>Loading...</p>;

  return (
    <main style={{ padding: 40 }}>
      <h1>Organiser Dashboard</h1>
      <button onClick={handleLogout}>Log out</button>

      <h2>Create a retreat</h2>
      <form onSubmit={handleCreateRetreat}>
        <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required /><br /><br />
        <input placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} /><br /><br />
        <button type="submit">Add retreat</button>
      </form>

      <h2>Your retreats</h2>
      <ul>
        {retreats.map((r) => (
          <li key={r.id}>{r.title} — {r.location} — {r.status}</li>
        ))}
      </ul>

      <h2>Post a need</h2>
      <form onSubmit={handleCreateNeed}>
        <select value={needRetreatId} onChange={(e) => setNeedRetreatId(e.target.value)} required>
          <option value="">Select a retreat</option>
          {retreats.map((r) => (
            <option key={r.id} value={r.id}>{r.title}</option>
          ))}
        </select><br /><br />
        <select value={needType} onChange={(e) => setNeedType(e.target.value)}>
          <option value="facilitator">Facilitator</option>
          <option value="venue">Venue</option>
          <option value="visa">Visa guidance</option>
          <option value="marketing">Marketing</option>
          <option value="other">Other</option>
        </select><br /><br />
        <textarea placeholder="Describe what you need" value={needDescription} onChange={(e) => setNeedDescription(e.target.value)} required /><br /><br />
        <button type="submit">Post need</button>
      </form>
    </main>
  );
}
