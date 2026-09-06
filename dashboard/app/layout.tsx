import './globals.css';
import type { Metadata } from 'next';
import { Baloo_2, Nunito } from 'next/font/google';

// Playful, rounded display face for headings/brand…
const display = Baloo_2({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

// …and a friendly, highly-legible companion for body/UI text.
const sans = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'VoltSentry — Security NOC Dashboard',
  description: 'Inline OCPP security proxy threat detection and fleet monitoring',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${display.variable} ${sans.variable}`}>
      <body className="bg-slate-950 text-slate-100 antialiased selection:bg-volt-green selection:text-slate-950">
        {children}
      </body>
    </html>
  );
}
