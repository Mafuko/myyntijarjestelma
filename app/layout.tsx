import type { Metadata } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { cookies } from 'next/headers';
import { ThemeProvider } from '@/components/ThemeProvider';
import "./globals.css";

const sora = Sora({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Myyntijärjestelmä",
  description: "Myynninhallinta pihakirppis-tapahtumille",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const cookieStore = await cookies();
  const theme = cookieStore.get('THEME')?.value === 'light' ? 'light' : 'dark';

  return (
    <html
      lang={locale}
      data-theme={theme === 'light' ? 'light' : undefined}
      className={`${sora.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>
          <ThemeProvider theme={theme}>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
