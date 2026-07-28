"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { normalizeRole, destinationFor } from "@/lib/roleRouting";
import { PortalHeader, PortalFooter } from "@/components/PortalChrome";

const inputStyle =
  "w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 placeholder-stone-600 focus:border-emerald-500 focus:outline-none";
const textareaStyle = `${inputStyle} min-h-[72px]`;
const primaryButton =
  "bg-emerald-800 hover:bg-emerald-700 text-stone-100 font-medium py-2 px-4 rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer inline-block";

// Matches Ops/Templates/Retreat Template.md's Core Details status list exactly.
const STATUS_OPTIONS = ["Lead", "Active Planning", "Confirmed", "Completed", "Paused"];

const CORE_FIELDS = [
  { key: "location", label: "Location" },
  { key: "dates", label: "Dates" },
  { key: "venue_name", label: "Venue" },
  { key: "capacity", label: "Capacity" },
  { key: "theme", label: "Theme" },
  { key: "audience", label: "Audience" },
];
const OPERATIONAL_FIELDS = [
  { key: "decision_maker", label: "Decision-maker" },
  { key: "current_blockers", label: "Current blockers" },
  { key: "budget_notes", label: "Budget notes" },
  { key: "timeline_sensitivity", label: "Timeline sensitivity" },
  { key: "communication_channels", label: "Communication channels" },
];

export default function RetreatsPage() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [members, setMembers] = useState([]);
  const [retreats, setRetreats] = useState([]);
  const [needs, setNeeds] = useState([]);
  const [responses, setResponses] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newAction, setNewAction] = useState("");
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
        if (!profileSnap.exists()) {
          router.push("/setup-profile");
          return;
        }
        const fetchedRole = normalizeRole(profileSnap.data().role);
        setRole(fetchedRole);
        if (fetchedRole !== "organiser" && fetchedRole !== "admin") {
          // Retreat detail is organiser/admin only. Facilitators and venues
          // interact at the needs level on /network — a browsable retreat
          // list for them would be the "public marketplace browsing" the
          // Roadmap explicitly excludes from Phase 2, and no retreat is ever
          // marked network_visible by the app today, so this also matches
          // what the Security Rules already allow.
          router.push(destinationFor(fetchedRole) || "/setup-profile");
          return;
        }

        let retreatsData = [];
        let needsData = [];
        let responsesData = [];

        if (fetchedRole === "admin") {
          const [retreatsSnap, needsSnap, responsesSnap, membersSnap] = await Promise.all([
            getDocs(collection(db, "retreats")),
            getDocs(collection(db, "needs")),
            getDocs(collection(db, "need_responses")),
            getDocs(collection(db, "profiles")),
          ]);
          retreatsData = retreatsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          needsData = needsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          responsesData = responsesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setMembers(membersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        } else {
          // Filtering by owner_id here (not just fetching everything) matches
          // the existing Security Rule and the exact query shape the rule
          // can verify — see Memory Log 2026-07-23 for what happens when a
          // query's filter doesn't provably match the rule.
          const retreatsQ = query(collection(db, "retreats"), where("owner_id", "==", firebaseUser.uid));
          const needsQ = query(collection(db, "needs"), where("owner_id", "==", firebaseUser.uid));
          const responsesQ = query(collection(db, "need_responses"), where("need_owner_id", "==", firebaseUser.uid));
          const [retreatsSnap, needsSnap, responsesSnap] = await Promise.all([
            getDocs(retreatsQ),
            getDocs(needsQ),
            getDocs(responsesQ),
          ]);
          retreatsData = retreatsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          needsData = needsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          responsesData = responsesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        }

        setRetreats(retreatsData);
        setNeeds(needsData);
        setResponses(responsesData);

        const params = new URLSearchParams(window.location.search);
        const requestedId = params.get("id");
        const initialRetreat =
          retreatsData.find((r) => r.id === requestedId) || retreatsData[0] || null;
        if (initialRetreat) {
          setSelectedId(initialRetreat.id);
          setForm({ ...initialRetreat });
        }
      } catch (err) {
        setError(`Could not load retreats: ${err.code || err.message}`);
      }
      setLoading(false);
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedRetreat = retreats.find((r) => r.id === selectedId) || null;
  const isOwner = !!(selectedRetreat && user && selectedRetreat.owner_id === user.uid);

  // Called from a click handler (below) rather than an effect keyed on
  // selectedId — setting state directly from the event that changes the
  // selection is simpler and avoids an extra render, and it means `form`
  // never gets silently reset by something other than the person's own click.
  function selectRetreat(retreat) {
    setSelectedId(retreat.id);
    setForm({ ...retreat });
    setSaved(false);
  }

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateDoc(doc(db, "retreats", selectedRetreat.id), { ...form });
      setRetreats((prev) => prev.map((r) => (r.id === selectedRetreat.id ? { ...r, ...form } : r)));
      setSaved(true);
    } catch (err) {
      setError(`Could not save retreat: ${err.code || err.message}`);
    }
    setSaving(false);
  }

  async function handleAddAction() {
    if (!newAction.trim()) return;
    const updated = [...(form.actions || []), { text: newAction.trim(), done: false }];
    setNewAction("");
    setForm((prev) => ({ ...prev, actions: updated }));
    try {
      await updateDoc(doc(db, "retreats", selectedRetreat.id), { actions: updated });
      setRetreats((prev) => prev.map((r) => (r.id === selectedRetreat.id ? { ...r, actions: updated } : r)));
    } catch (err) {
      setError(`Could not save action: ${err.code || err.message}`);
    }
  }

  async function handleToggleAction(index) {
    const updated = (form.actions || []).map((a, i) => (i === index ? { ...a, done: !a.done } : a));
    setForm((prev) => ({ ...prev, actions: updated }));
    try {
      await updateDoc(doc(db, "retreats", selectedRetreat.id), { actions: updated });
      setRetreats((prev) => prev.map((r) => (r.id === selectedRetreat.id ? { ...r, actions: updated } : r)));
    } catch (err) {
      setError(`Could not update action: ${err.code || err.message}`);
    }
  }

  async function handleLogout() {
    await signOut(auth);
    router.push("/login");
  }

  function nameFor(uid) {
    const member = members.find((m) => m.id === uid);
    return member ? member.full_name : uid;
  }

  function needsFor(retreatId) {
    return needs.filter((n) => n.retreat_id === retreatId);
  }

  function responsesFor(needId) {
    return responses.filter((r) => r.need_id === needId);
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm text-stone-500">Loading...</p>
      </main>
    );
  }

  const navItems =
    role === "admin"
      ? [{ href: "/admin", label: "Admin" }, { href: "/retreats", label: "Retreats" }]
      : [{ href: "/dashboard", label: "Dashboard" }, { href: "/retreats", label: "Retreats" }];

  return (
    <>
      <PortalHeader email={user?.email} navItems={navItems} activeHref="/retreats" onLogout={handleLogout} />
      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full fade-in space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-serif text-stone-100">Retreat Operations</h2>
            <p className="text-stone-500 text-sm mt-1">
              Core details, needs, operational notes, and visa guidance.
            </p>
          </div>
          {role === "organiser" && (
            <Link href="/dashboard" className={primaryButton}>
              + New retreat
            </Link>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg p-3">
            {error}
          </p>
        )}

        {retreats.length === 0 && (
          <p className="text-sm text-stone-500">
            {role === "admin"
              ? "No retreats exist yet."
              : "You haven't created a retreat yet — add one from the Dashboard."}
          </p>
        )}

        {retreats.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {retreats.map((r) => (
              <button
                key={r.id}
                onClick={() => selectRetreat(r)}
                className={
                  r.id === selectedId
                    ? "text-xs px-3 py-1.5 rounded-full bg-emerald-900/30 text-emerald-400 border border-emerald-800/50 cursor-pointer"
                    : "text-xs px-3 py-1.5 rounded-full bg-stone-800 text-stone-300 border border-stone-700 cursor-pointer hover:border-stone-600"
                }
              >
                {r.title}
              </button>
            ))}
          </div>
        )}

        {selectedRetreat && form && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="glass-panel rounded-xl p-6 lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-4 flex-wrap gap-2">
                <h3 className="font-serif text-xl text-stone-100">{selectedRetreat.title}</h3>
                {isOwner ? (
                  <select
                    className="text-xs px-3 py-1 rounded-full bg-stone-800 text-stone-300 border border-stone-700 focus:border-emerald-500 focus:outline-none"
                    value={form.status || "Lead"}
                    onChange={(e) => updateField("status", e.target.value)}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs px-3 py-1 rounded-full bg-amber-900/30 text-amber-400 border border-amber-800/50">
                    Status: {selectedRetreat.status}
                  </span>
                )}
              </div>

              {!isOwner && (
                <p className="text-xs text-stone-500">
                  Organiser: {nameFor(selectedRetreat.owner_id)} — read-only admin view.
                </p>
              )}

              <form onSubmit={handleSave} className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {CORE_FIELDS.map((f) => (
                    <div key={f.key}>
                      <span className="field-label">{f.label}</span>
                      {isOwner ? (
                        <input
                          className={inputStyle}
                          value={form[f.key] || ""}
                          onChange={(e) => updateField(f.key, e.target.value)}
                        />
                      ) : (
                        <p className="field-value">{selectedRetreat[f.key] || "—"}</p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/10 pt-4">
                  <h4 className="text-sm font-medium text-stone-300 mb-3">Needs</h4>
                  <div className="flex flex-wrap gap-2">
                    {needsFor(selectedRetreat.id).length === 0 && (
                      <span className="text-xs text-stone-600">No needs posted for this retreat yet.</span>
                    )}
                    {needsFor(selectedRetreat.id).map((n) => (
                      <span
                        key={n.id}
                        className="text-xs px-3 py-1.5 rounded-full bg-stone-800 text-stone-300 border border-stone-700"
                      >
                        {n.type}: {n.status} — {responsesFor(n.id).length} response
                        {responsesFor(n.id).length === 1 ? "" : "s"}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-white/10 pt-4">
                  <div>
                    <h4 className="text-sm font-medium text-stone-300 mb-3">Operational notes</h4>
                    <div className="space-y-3">
                      {OPERATIONAL_FIELDS.map((f) => (
                        <div key={f.key}>
                          <span className="field-label">{f.label}</span>
                          {isOwner ? (
                            <input
                              className={inputStyle}
                              value={form[f.key] || ""}
                              onChange={(e) => updateField(f.key, e.target.value)}
                            />
                          ) : (
                            <p className="field-value">{selectedRetreat[f.key] || "—"}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-stone-300 mb-3">Risk points</h4>
                    {isOwner ? (
                      <textarea
                        className={textareaStyle}
                        placeholder="One per line"
                        value={form.risk_notes || ""}
                        onChange={(e) => updateField("risk_notes", e.target.value)}
                      />
                    ) : (
                      <ul className="text-xs text-stone-400 space-y-1 list-disc list-inside">
                        {(selectedRetreat.risk_notes || "")
                          .split("\n")
                          .filter(Boolean)
                          .map((line, i) => (
                            <li key={i}>{line}</li>
                          ))}
                        {!selectedRetreat.risk_notes && <li className="list-none text-stone-600">None on file.</li>}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="border-t border-white/10 pt-4">
                  <h4 className="text-sm font-medium text-stone-300 mb-3">
                    Suggested matches
                    <span className="text-xs text-stone-600 font-normal ml-2">(curated by hand — no automated matching yet)</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="glass-card rounded-lg p-3">
                      <p className="text-xs text-stone-500 uppercase tracking-wider mb-1">Facilitators</p>
                      {isOwner ? (
                        <textarea
                          className={textareaStyle}
                          placeholder="One name per line"
                          value={form.suggested_facilitators || ""}
                          onChange={(e) => updateField("suggested_facilitators", e.target.value)}
                        />
                      ) : (
                        <p className="text-sm text-stone-200">{selectedRetreat.suggested_facilitators || "None yet."}</p>
                      )}
                    </div>
                    <div className="glass-card rounded-lg p-3">
                      <p className="text-xs text-stone-500 uppercase tracking-wider mb-1">Venues</p>
                      {isOwner ? (
                        <textarea
                          className={textareaStyle}
                          placeholder="One name per line"
                          value={form.suggested_venues || ""}
                          onChange={(e) => updateField("suggested_venues", e.target.value)}
                        />
                      ) : (
                        <p className="text-sm text-stone-200">{selectedRetreat.suggested_venues || "None yet."}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/10 pt-4">
                  <h4 className="text-sm font-medium text-stone-300 mb-3">Open questions</h4>
                  {isOwner ? (
                    <textarea
                      className={textareaStyle}
                      placeholder="One per line"
                      value={form.open_questions || ""}
                      onChange={(e) => updateField("open_questions", e.target.value)}
                    />
                  ) : (
                    <p className="text-xs text-stone-400">{selectedRetreat.open_questions || "None on file."}</p>
                  )}
                </div>

                {isOwner && (
                  <button type="submit" disabled={saving} className={primaryButton}>
                    {saving ? "Saving..." : saved ? "Saved" : "Save changes"}
                  </button>
                )}
              </form>

              <div className="border-t border-white/10 pt-4">
                <h4 className="text-sm font-medium text-stone-300 mb-3">Actions</h4>
                <div className="space-y-2">
                  {(selectedRetreat.actions || []).length === 0 && (
                    <p className="text-xs text-stone-600">No actions logged yet.</p>
                  )}
                  {(selectedRetreat.actions || []).map((a, i) => (
                    <label key={i} className="flex items-center gap-3 text-sm text-stone-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!a.done}
                        disabled={!isOwner}
                        onChange={() => handleToggleAction(i)}
                        className="rounded bg-stone-800 border-stone-600 text-emerald-500"
                      />
                      <span className={a.done ? "line-through text-stone-500" : ""}>{a.text}</span>
                    </label>
                  ))}
                </div>
                {isOwner && (
                  <div className="flex gap-2 mt-3">
                    <input
                      className={inputStyle}
                      placeholder="Add an action"
                      value={newAction}
                      onChange={(e) => setNewAction(e.target.value)}
                    />
                    <button onClick={handleAddAction} type="button" className={primaryButton}>
                      Add
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Visa guidance sidebar — real vault content only. The Summary
                and Common Questions sections are genuinely blank in the vault
                (Ops/Wiki-Pages/Bali Visa Guidance Summary and Ops/Research/Bali
                Visa Research Notes both have no filled-in content yet), so
                this shows exactly that rather than inventing plausible-sounding
                visa rules. */}
            <div className="glass-panel rounded-xl p-6 lg:col-span-1 space-y-4 h-fit">
              <h3 className="font-serif text-lg text-stone-100">Bali Visa Guidance Summary</h3>
              <div className="bg-amber-900/20 border border-amber-800/50 rounded-lg p-3">
                <p className="text-xs text-amber-400 font-medium">Important:</p>
                <p className="text-xs text-amber-200/80 mt-1">
                  This is a guidance summary, not legal advice. Verify before sending externally.
                </p>
              </div>
              <div>
                <h4 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">Use in practice</h4>
                <ul className="text-sm text-stone-300 space-y-1 list-disc list-inside">
                  <li>An organiser asks what visa path may fit a retreat scenario.</li>
                  <li>A facilitator needs a starting-point explanation.</li>
                  <li>Seiiki needs consistent language before referring someone for verification.</li>
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">Internal rule</h4>
                <p className="text-sm text-stone-300">
                  Never send this out as final compliance advice without verifying the information is still current.
                </p>
              </div>
              <div>
                <h4 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">Summary</h4>
                <p className="text-sm text-stone-500 italic">
                  Needs verification — not yet researched in the vault.
                </p>
              </div>
              <div className="border-t border-white/10 pt-4">
                <p className="text-xs text-stone-600">
                  Source: Ops/Wiki-Pages/Bali Visa Guidance Summary — update that note first, this page reads from it by hand for now.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
      <PortalFooter />
    </>
  );
}
