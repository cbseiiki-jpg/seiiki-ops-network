"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { destinationFor } from "@/lib/roleRouting";

// Accounts in this list skip the role picker entirely and self-provision as
// admin. Add more addresses here (comma-separated) if you ever need a second
// admin account.
const ADMIN_EMAILS = ["batinseiiki@gmail.com"];

const inputStyle =
  "w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 placeholder-stone-600 focus:border-emerald-500 focus:outline-none";

export default function SetupProfilePage() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("organiser");
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
          const destination = destinationFor(profileSnap.data().role);
          if (destination) {
            router.push(destination);
            return;
          }
          // Existing profile, but its role doesn't match anything recognised
          // (old data, a typo, different casing) — fall through and show the
          // picker below so this account fixes itself, instead of guessing.
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
      router.push(destinationFor(role) || "/dashboard");
    } catch (err) {
      setError(`Could not save your profile: ${err.code || err.message}`);
      setSaving(false);
    }
  }

  if (checking) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <p className="text-sm text-stone-500">Checking your account...</p>
      </main>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-12 fade-in">
      <div className="w-full max-w-md glass-panel rounded-xl p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-full bg-emerald-900 flex items-center justify-center border border-emerald-700/50 shrink-0">
            <span className="text-emerald-400 font-serif font-bold text-xl">S</span>
          </div>
          <div>
            <p className="font-serif text-lg text-stone-100 leading-tight">Seiiki Ops Network</p>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Operations Portal</p>
          </div>
        </div>

        <h1 className="text-2xl font-serif text-stone-100 mb-1">Set up your account</h1>
        <p className="text-xs text-stone-500 mb-4">Signed in as {user?.email}</p>
        <p className="text-sm text-stone-400 mb-6">
          First time here — tell us who you are so we send you to the right place.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="field-label">Full name</label>
            <input
              className={inputStyle}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="field-label">I am a...</label>
            <select
              className={inputStyle}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="organiser">Organiser</option>
              <option value="facilitator">Facilitator</option>
              <option value="venue">Venue</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-emerald-800 hover:bg-emerald-700 text-stone-100 font-medium py-2 rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {saving ? "Saving..." : "Continue"}
          </button>
        </form>

        {error && (
          <p className="mt-4 text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg p-3">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
