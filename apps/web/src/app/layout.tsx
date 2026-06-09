import type { Metadata } from "next";
import { Inter, Urbanist } from "next/font/google";
import { cookies } from "next/headers";
import { ThemeProvider } from "@/components/theme-provider";
import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"] });
const urbanist = Urbanist({ subsets: ["latin"], weight: ["800"], variable: "--font-urbanist" });

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
      <body className={`${inter.className} ${urbanist.variable}`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
