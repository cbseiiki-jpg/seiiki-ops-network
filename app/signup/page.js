"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { destinationFor } from "@/lib/roleRouting";

const inputStyle =
  "w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 placeholder-stone-600 focus:border-emerald-500 focus:outline-none";

function BrandMark() {
  return (
    <div className="flex items-center gap-3 mb-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/seiiki-logo.png" alt="Seiiki" className="h-10 w-10 object-contain shrink-0" />
      <div>
        <p className="font-serif text-lg text-stone-100 leading-tight">Seiiki Ops Network</p>
        <p className="text-[10px] uppercase tracking-widest text-stone-500">Operations Portal</p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [invite, setInvite] = useState(null); // { role } once the code checks out
  const [codeError, setCodeError] = useState("");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const router = useRouter();

  useEffect(() => {
    // Plain browser API on purpose, not next/navigation's useSearchParams —
    // that hook needs a Suspense boundary around the page, this doesn't.
    const params = new URLSearchParams(window.location.search);
    const codeFromLink = params.get("code");
    if (codeFromLink) {
      checkCode(codeFromLink);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkCode(rawCode) {
    const cleaned = (rawCode ?? code).trim().toUpperCase();
    if (!cleaned) return;
    // Reflects the code in the input before the lookup resolves. This has to
    // live here rather than directly in the effect above — setState called
    // synchronously inside an effect body (instead of inside the async work
    // it kicks off) forces an avoidable extra render.
    setCode(cleaned);
    setChecking(true);
    setCodeError("");
    try {
      const snap = await getDoc(doc(db, "invites", cleaned));
      if (!snap.exists()) {
        setCodeError("That invite code doesn't exist. Check it and try again.");
      } else if (snap.data().used) {
        setCodeError("That invite code has already been used. Ask your admin for a new one.");
      } else {
        setInvite({ role: snap.data().role });
      }
    } catch (err) {
      setCodeError(
        `Could not check that code: ${err.code || err.message}. If this says "Missing or insufficient permissions", the invite codes feature hasn't been fully set up yet — ask your admin.`
      );
    }
    setChecking(false);
  }

  async function handleSignup(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, "profiles", cred.user.uid), {
        full_name: fullName,
        email: cred.user.email,
        role: invite.role,
        created_at: serverTimestamp(),
      });
      await updateDoc(doc(db, "invites", code), {
        used: true,
        used_by: cred.user.uid,
        used_at: serverTimestamp(),
      });
      router.push(destinationFor(invite.role) || "/dashboard");
    } catch (err) {
      setError(`Could not create your account: ${err.code || err.message}`);
      setSaving(false);
    }
  }

  if (!invite) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-12 fade-in">
        <div className="w-full max-w-md glass-panel rounded-xl p-8">
          <BrandMark />
          <h1 className="text-2xl font-serif text-stone-100 mb-2">Join Seiiki Ops Network</h1>
          <p className="text-sm text-stone-500 mb-6">Enter the invite code you were sent.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              checkCode();
            }}
            className="space-y-4"
          >
            <div>
              <label className="field-label">Invite code</label>
              <input
                className={inputStyle}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              disabled={checking}
              className="w-full bg-emerald-800 hover:bg-emerald-700 text-stone-100 font-medium py-2 rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {checking ? "Checking..." : "Continue"}
            </button>
          </form>
          {codeError && (
            <p className="mt-4 text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg p-3">
              {codeError}
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-12 fade-in">
      <div className="w-full max-w-md glass-panel rounded-xl p-8">
        <BrandMark />
        <h1 className="text-2xl font-serif text-stone-100 mb-2">Join Seiiki Ops Network</h1>
        <p className="text-xs px-2 py-1 inline-block rounded-full bg-emerald-900/30 text-emerald-400 border border-emerald-800/50 mb-6">
          Invite verified — joining as {invite.role}
        </p>
        <form onSubmit={handleSignup} className="space-y-4">
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
            <label className="field-label">Password (at least 6 characters)</label>
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
            disabled={saving}
            className="w-full bg-emerald-800 hover:bg-emerald-700 text-stone-100 font-medium py-2 rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {saving ? "Creating account..." : "Create account"}
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
