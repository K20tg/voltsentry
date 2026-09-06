import './globals.css';
import type { Metadata } from 'next';

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
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased selection:bg-cyan-500 selection:text-slate-950">
        {children}
      </body>
    </html>
  );
}
