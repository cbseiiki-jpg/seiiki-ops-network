"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { destinationFor } from "@/lib/roleRouting";

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
      <main style={{ padding: 40, maxWidth: 400 }}>
        <h1>Join Seiiki Ops Network</h1>
        <p>Enter the invite code you were sent.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            checkCode();
          }}
        >
          <input
            placeholder="Invite code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          /><br /><br />
          <button type="submit" disabled={checking}>
            {checking ? "Checking..." : "Continue"}
          </button>
        </form>
        {codeError && <p style={{ color: "red" }}>{codeError}</p>}
      </main>
    );
  }

  return (
    <main style={{ padding: 40, maxWidth: 400 }}>
      <h1>Join Seiiki Ops Network</h1>
      <p style={{ fontSize: 12, color: "#666" }}>
        Invite verified — joining as {invite.role}.
      </p>
      <form onSubmit={handleSignup}>
        <input
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        /><br /><br />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        /><br /><br />
        <input
          type="password"
          placeholder="Password (at least 6 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        /><br /><br />
        <button type="submit" disabled={saving}>
          {saving ? "Creating account..." : "Create account"}
        </button>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </main>
  );
}
