"use client";

interface PartnerLayoutProps {
  children: React.ReactNode;
}

export default function PartnerLayout({ children }: PartnerLayoutProps) {
  return (
    <div className="min-h-screen bg-primary-bg">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
