"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  addDoc,
  doc,
  getDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { normalizeRole, destinationFor } from "@/lib/roleRouting";

export default function DashboardPage() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState(null);
  const [retreats, setRetreats] = useState([]);
  const [myNeeds, setMyNeeds] = useState([]);
  const [responses, setResponses] = useState([]);
  const [error, setError] = useState("");

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

  async function loadRetreats(ownerUid) {
    if (!ownerUid) return;
    const q = query(collection(db, "retreats"), where("owner_id", "==", ownerUid));
    const snap = await getDocs(q);
    setRetreats(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadMyNeeds(ownerUid) {
    if (!ownerUid) return;
    const q = query(collection(db, "needs"), where("owner_id", "==", ownerUid));
    const snap = await getDocs(q);
    setMyNeeds(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadResponses(ownerUid) {
    if (!ownerUid) return;
    const q = query(collection(db, "need_responses"), where("need_owner_id", "==", ownerUid));
    const snap = await getDocs(q);
    setResponses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
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
        if (fetchedRole !== "organiser") {
          // This page is organiser-only — everyone else belongs somewhere else.
          router.push(destinationFor(fetchedRole) || "/setup-profile");
          return;
        }
        await ensureOrganization(firebaseUser.uid);
        await loadRetreats(firebaseUser.uid);
        await loadMyNeeds(firebaseUser.uid);
        await loadResponses(firebaseUser.uid);
      } catch (err) {
        setError(`Could not load your data: ${err.code || err.message}`);
      }
      setLoading(false);
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateRetreat(e) {
    e.preventDefault();
    try {
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
      await loadMyNeeds(user.uid);
    } catch (err) {
      setError(`Could not post need: ${err.code || err.message}`);
    }
  }

  function responsesFor(needId) {
    return responses.filter((r) => r.need_id === needId);
  }

  async function handleLogout() {
    await signOut(auth);
    router.push("/login");
  }

  if (loading) return <p style={{ padding: 40 }}>Loading...</p>;

  return (
    <main style={{ padding: 40 }}>
      <h1>Organiser Dashboard</h1>
      <p style={{ fontSize: 12, color: "#666" }}>
        Signed in as {user?.email} — role on file: {JSON.stringify(role)}
      </p>
      <button onClick={handleLogout}>Log out</button>
      {error && <p style={{ color: "red" }}>{error}</p>}

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

      <h2>Your needs</h2>
      <ul>
        {myNeeds.length === 0 && <li>None posted yet.</li>}
        {myNeeds.map((n) => (
          <li key={n.id} style={{ marginBottom: 16 }}>
            <strong>{n.type}</strong>: {n.description} — status: {n.status}
            <ul>
              {responsesFor(n.id).length === 0 && (
                <li style={{ color: "#666" }}>No responses yet.</li>
              )}
              {responsesFor(n.id).map((r) => (
                <li key={r.id}>
                  {r.responder_name || r.responder_id}: {r.message}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </main>
  );
}
