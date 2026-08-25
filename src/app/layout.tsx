import type { Metadata, Viewport } from "next";
import { Bruno_Ace, Inter, JetBrains_Mono } from "next/font/google";

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

/**
 * The wordmark's face, and the app's.
 *
 * Bruno Ace, matched to the new logo art the founder supplied with
 * "make cardflare all lowercase... and make it this font". Matched by
 * RENDERING, not by eye alone: fifteen squared techno faces were drawn
 * as "cardflare" side by side against the supplied art, and Bruno Ace
 * is the one with its monoline weight, squared-spiral a, and open
 * squared e. (Audiowide was the first guess and the founder rightly
 * called it off - too heavy, too round.) One weight, which is all a
 * wordmark needs. The name at the top of the site is TEXT beside the
 * mark; the mark image itself is untouched, as BRAND.md requires.
 */
const display = Bruno_Ace({
  variable: "--font-brand-display",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

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
      className={`${sans.variable} ${mono.variable} ${display.variable} h-full antialiased`}
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
