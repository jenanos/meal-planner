import "./globals.css";
import { Providers } from "./providers";
import { DynamicNav } from "./components/DynamicNav";
import { AuthGuard } from "./components/AuthGuard";

export const metadata = {
  title: "Butta – Måltidsplanlegger",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers>
          <AuthGuard>
            <header className="app-header border-b">
              <nav>
                <DynamicNav />
              </nav>
            </header>
            <main className="app-shell mx-auto w-full max-w-6xl px-4 py-10 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-12 sm:pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-8 md:py-10 md:pb-10">
              {children}
            </main>
          </AuthGuard>
        </Providers>
      </body>
    </html>
  );
}
