// Single place that knows how to upload a photo to Firebase Storage and
// hand back a public URL — same reasoning as lib/roleRouting.js: one copy,
// not hand-copied into every page that needs a photo (profile photo, org
// photo, venue key-leader photos all call this).

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB — must match storage.rules

// Uploads one image file to `path` (e.g. "profile-photos/<uid>") and
// returns its public download URL. Uploading to the same path again simply
// replaces the old photo, so Storage never fills up with abandoned files.
export async function uploadPhoto(file, path) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("That image is larger than 5MB — please choose a smaller one.");
  }
  const photoRef = ref(storage, path);
  await uploadBytes(photoRef, file);
  return await getDownloadURL(photoRef);
}
