"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

// Accounts in this list skip the role picker entirely and self-provision as
// admin. Add more addresses here (comma-separated) if you ever need a second
// admin account.
const ADMIN_EMAILS = ["batinseiiki@gmail.com"];

export default function SetupProfilePage() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("organizer");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
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
        if (profileSnap.exists()) {
          // Already set up — this account doesn't need this page.
          const existingRole = profileSnap.data().role;
          if (existingRole === "admin") {
            router.push("/admin");
          } else if (existingRole === "facilitator" || existingRole === "venue") {
            router.push("/network");
          } else {
            router.push("/dashboard");
          }
          return;
        }
        if (ADMIN_EMAILS.includes(firebaseUser.email)) {
          // Known admin address — skip the picker, self-provision as admin.
          await setDoc(doc(db, "profiles", firebaseUser.uid), {
            full_name: "Admin",
            email: firebaseUser.email,
            role: "admin",
            created_at: serverTimestamp(),
          });
          router.push("/admin");
          return;
        }
      } catch (err) {
        setError(`Could not check your profile: ${err.code || err.message}`);
      }
      setChecking(false);
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      // Document ID = user.uid, set by the app itself — never typed by hand,
      // so it can never drift from the Authentication UID.
      await setDoc(doc(db, "profiles", user.uid), {
        full_name: fullName,
        email: user.email,
        role,
        created_at: serverTimestamp(),
      });
      if (role === "facilitator" || role === "venue") {
        router.push("/network");
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError(`Could not save your profile: ${err.code || err.message}`);
      setSaving(false);
    }
  }

  if (checking) return <p style={{ padding: 40 }}>Checking your account...</p>;

  return (
    <main style={{ padding: 40, maxWidth: 400 }}>
      <h1>Set up your account</h1>
      <p style={{ fontSize: 12, color: "#666" }}>Signed in as {user?.email}</p>
      <p>First time here — tell us who you are so we send you to the right place.</p>
      <form onSubmit={handleSubmit}>
        <input
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        /><br /><br />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="organizer">Organiser</option>
          <option value="facilitator">Facilitator</option>
          <option value="venue">Venue</option>
        </select><br /><br />
        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Continue"}
        </button>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </main>
  );
}
