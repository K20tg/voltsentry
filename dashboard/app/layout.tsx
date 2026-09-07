import './globals.css';
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { AuthProvider } from '../context/AuthContext';

// Inter for all UI text (labels, headings, buttons, nav). --font-display is the
// same face at a heavier weight so existing heading styles keep working.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const interDisplay = Inter({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

// JetBrains Mono ONLY for telemetry: raw numbers, units, timestamps, ports, JSON.
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-mono',
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
    <html
      lang="en"
      className={`dark ${inter.variable} ${interDisplay.variable} ${mono.variable}`}
    >
      <body className="font-sans bg-volt-bg text-slate-200 antialiased selection:bg-volt-green/20 selection:text-slate-50">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
