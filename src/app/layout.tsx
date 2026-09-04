import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/components/toast";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Resolves to the real production domain automatically once deployed on
// Vercel (VERCEL_PROJECT_PRODUCTION_URL is the stable, custom-domain-aware
// one; VERCEL_URL is per-deployment as a fallback), or localhost in dev.
// Set NEXT_PUBLIC_SITE_URL in the Vercel project settings to pin this to a
// custom domain explicitly once one exists.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

const title = "Odentia";
const description = "Gestiona tu clínica odontológica y poténciala con un marketplace especializado.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title,
    description,
    url: "/",
    siteName: "Odentia",
    locale: "es_CO",
    type: "website",
    images: [{ url: "/branding/odentia-og-image.png", width: 1815, height: 844, alt: "Odentia" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/branding/odentia-og-image.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
