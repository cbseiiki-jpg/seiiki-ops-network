import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pins the project root to this folder. Without this, Next.js guessed the
  // root from a stray package-lock.json sitting directly in the home folder
  // (unrelated to this project) instead of this one, which showed up as a
  // "multiple lockfiles" warning during `npm run build`.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
