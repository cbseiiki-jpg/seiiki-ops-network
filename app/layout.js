import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const metadata = {
  title: "Seiiki Ops Network",
  description: "Operations portal for Seiiki Ops Network — organisers, facilitators, venues, and admin in one private, invite-only workspace.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${playfairDisplay.variable}`}>
      <body className="bg-stone-950 text-stone-200 font-sans min-h-screen flex flex-col antialiased">
        {children}
      </body>
    </html>
  );
}
