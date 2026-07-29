// Single place that knows how to upload a photo and hand back a public URL —
// same reasoning as lib/roleRouting.js: one copy, not hand-copied into every
// page that needs a photo (profile photo, org photo, venue key-leader photos
// all call this).
//
// Uses Cloudinary, not Firebase Storage. Since 2026-02-03 Firebase requires
// a Blaze (pay-as-you-go) billing account linked before Storage can even be
// turned on, regardless of how little is stored. Johann asked for a way to
// avoid that — Cloudinary's free plan needs no card at all and gives far
// more room (25GB/month) than a handful of profile pictures will ever use.
// See the Build Guide ("Photo uploads via Cloudinary") for the exact
// Console setup steps and the two env vars this needs.

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

// Uploads one image file into `folder` (e.g. "profile-photos/<uid>") and
// returns its public URL.
export async function uploadPhoto(file, folder) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("That image is larger than 5MB — please choose a smaller one.");
  }
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error("Photo upload isn't set up yet — missing Cloudinary settings.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("folder", folder);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Could not upload photo — please try again.");
  }
  return data.secure_url;
}
