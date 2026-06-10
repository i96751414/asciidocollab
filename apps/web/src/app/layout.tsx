import type { Metadata } from "next";
import { Inter, Urbanist, Open_Sans, Noto_Serif, Ubuntu_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { ThemeProvider } from "@/components/theme-provider";
import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"] });
const urbanist = Urbanist({ subsets: ["latin"], weight: ["800"], variable: "--font-urbanist" });

// Fonts for the Asciidoctor preview style. The vendored stylesheet expects Open Sans,
// Noto Serif, and a monospace; Droid Sans Mono is unavailable on Google Fonts so Ubuntu
// Mono stands in. Exposed as CSS variables, applied only inside the scoped preview surface.
const openSans = Open_Sans({ subsets: ["latin"], variable: "--font-asciidoctor-sans" });
const notoSerif = Noto_Serif({ subsets: ["latin"], variable: "--font-asciidoctor-serif" });
const ubuntuMono = Ubuntu_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-asciidoctor-mono" });

export const metadata: Metadata = {
  title: "AsciiDoCollab",
  description: "Collaborative AsciiDoc editor for technical publishing",
};

/**
 * Root layout for the application.
 *
 * @param properties - App shell and global providers wrapping all pages.
 * @param properties.children - The child components to render.
 */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get('asciidocollab-theme');
  const initialTheme = themeCookie?.value ?? 'system';
  const isDark = initialTheme === 'dark';

  return (
    <html lang="en" className={isDark ? 'dark' : ''}>
      <body className={`${inter.className} ${urbanist.variable} ${openSans.variable} ${notoSerif.variable} ${ubuntuMono.variable}`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
