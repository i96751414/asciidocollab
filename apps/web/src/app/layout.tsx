import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AsciiDocCollab",
  description: "Collaborative AsciiDoc editor for technical publishing",
};

/**
 * Root layout for the application.
 *
 * @param properties - The component properties.
 * @param properties.children - The child components to render.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
