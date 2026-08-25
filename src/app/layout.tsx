import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { AnalyticsTracker } from "@/components/analytics-tracker";
import { SITE, siteUrl } from "@/lib/site";
import "./globals.css";

const sans = Inter({
  variable: "--font-brand-sans",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-brand-mono",
  subsets: ["latin"],
  display: "swap",
});

/*
 * There is deliberately NO display face any more. Three rounds of
 * matching a font to the founder's wordmark art ended with him
 * supplying the art itself ("Just put this everywhere", 2026-08-25),
 * so the name is drawn as his image - see components/brand/logo.tsx -
 * and no font can drift from it.
 */

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${SITE.name} | Find Cards and Trade at Local TCG Events`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    url: "/",
    title: `${SITE.name} | Find Cards and Trade at Local TCG Events`,
    description: SITE.description,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} | Find Cards and Trade at Local TCG Events`,
    description: SITE.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  category: "technology",
};

export const viewport: Viewport = {
  themeColor: "#0e1116",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-100 focus:rounded-[var(--radius-control)] focus:bg-accent focus:px-4 focus:py-2 focus:font-semibold focus:text-accent-contrast"
        >
          Skip to content
        </a>
        {children}
        <AnalyticsTracker />
      </body>
    </html>
  );
}
