import type { ReactNode } from "react";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-surface-tint to-white flex flex-col">
      {/* Brand header */}
      <header className="w-full bg-brand-navy py-5 shadow-md">
        <div className="max-w-5xl mx-auto px-4 md:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="NextDay Biz Funding"
              className="h-10 md:h-12 object-contain"
            />
          </div>
          <div className="hidden sm:flex items-center gap-2 text-white/80 text-sm font-body">
            <span className="h-2 w-2 rounded-full bg-cta-orange shadow-[0_0_10px_rgba(255,102,0,0.9)]"></span>
            Secure Application
          </div>
        </div>
      </header>

      {/* Subheader band */}
      <div className="w-full bg-white border-b border-divider-soft">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-3 text-center">
          <h1 className="font-display font-bold text-brand-navy text-lg md:text-xl">
            Business Funding Application
          </h1>
          <p className="text-xs md:text-sm text-ink-muted mt-0.5">
            Fast &amp; flexible funding from $10K to $5M — approval in as little as 4 hours.
          </p>
        </div>
      </div>

      {/* Main card */}
      <main className="flex-1 w-full">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-10">
          <div className="bg-white rounded-2xl shadow-card border border-divider-soft/70 p-5 md:p-10">
            {children}
          </div>

          <footer className="mt-8 text-center text-xs text-ink-muted">
            <p>
              &copy; {new Date().getFullYear()} NextDay Biz Funding. Your information is
              encrypted and submitted securely.
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}
