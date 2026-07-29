"use client";

// Reusable "upload a photo" control: preview circle + file picker + upload
// state. Used for facilitator/venue/organiser profile photos and for each
// venue key-leader photo — one component instead of rebuilding this in
// every form that needs a picture.

import { useState } from "react";
import { uploadPhoto } from "@/lib/uploadPhoto";

export function PhotoField({ label, photoUrl, storagePath, onUploaded, size = "w-20 h-20" }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be picked again later if needed
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const url = await uploadPhoto(file, storagePath);
      onUploaded(url);
    } catch (err) {
      setError(err.message || `Could not upload photo: ${err.code || "unknown error"}`);
    }
    setUploading(false);
  }

  return (
    <div>
      {label && <label className="field-label">{label}</label>}
      <div className="flex items-center gap-4">
        <div
          className={`${size} rounded-full bg-stone-800 border border-stone-700 overflow-hidden flex items-center justify-center shrink-0`}
        >
          {photoUrl ? (
            // Plain <img>, not next/image — photo URLs come from Firebase
            // Storage at upload time, an external host next/image would
            // need explicitly allow-listing in next.config.mjs for no
            // benefit here.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-stone-600 text-[10px] text-center px-1">No photo</span>
          )}
        </div>
        <div className="min-w-0">
          <label className="inline-block text-xs bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium py-1.5 px-3 rounded-lg cursor-pointer transition-colors border border-stone-700">
            {uploading ? "Uploading..." : photoUrl ? "Replace photo" : "Upload photo"}
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={uploading}
              className="hidden"
            />
          </label>
          <p className="text-[11px] text-stone-600 mt-1">JPG or PNG, up to 5MB.</p>
          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
        </div>
      </div>
    </div>
  );
}
