"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { destinationFor } from "@/lib/roleRouting";

const inputStyle =
  "w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 placeholder-stone-600 focus:border-emerald-500 focus:outline-none";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const profileSnap = await getDoc(doc(db, "profiles", cred.user.uid));
      if (!profileSnap.exists()) {
        router.push("/setup-profile");
        return;
      }
      const destination = destinationFor(profileSnap.data().role);
      router.push(destination || "/setup-profile");
    } catch (err) {
      setError(`Login failed: ${err.code || err.message}`);
      setSubmitting(false);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-12 fade-in">
      <div className="w-full max-w-md glass-panel rounded-xl p-8">
        <div className="flex items-center gap-3 mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/seiiki-logo.png" alt="Seiiki" className="h-10 w-10 object-contain shrink-0" />
          <div>
            <p className="font-serif text-lg text-stone-100 leading-tight">Seiiki Ops Network</p>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Operations Portal</p>
          </div>
        </div>

        <h1 className="text-2xl font-serif text-stone-100 mb-6">Log in</h1>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="field-label">Email</label>
            <input
              type="email"
              className={inputStyle}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="field-label">Password</label>
            <input
              type="password"
              className={inputStyle}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-emerald-800 hover:bg-emerald-700 text-stone-100 font-medium py-2 rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {submitting ? "Logging in..." : "Log in"}
          </button>
        </form>

        {error && (
          <p className="mt-4 text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg p-3">
            {error}
          </p>
        )}

        <p className="mt-6 text-xs text-stone-500">
          Invited but no account yet?{" "}
          <Link href="/signup" className="wikilink">
            Use your invite link
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
