"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const profileSnap = await getDoc(doc(db, "profiles", cred.user.uid));
      if (!profileSnap.exists()) {
        router.push("/setup-profile");
        return;
      }
      const role = profileSnap.data().role;
      if (role === "facilitator" || role === "venue") {
        router.push("/network");
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError(`Login failed: ${err.code || err.message}`);
    }
  }

  return (
    <main style={{ padding: 40, maxWidth: 400 }}>
      <h1>Seiiki Ops Network — Login</h1>
      <form onSubmit={handleLogin}>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required /><br /><br />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required /><br /><br />
        <button type="submit">Log in</button>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </main>
  );
}
