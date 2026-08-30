import ClientApp from "./ClientApp";
import { Inter, Hind, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "@/index.css";
import "@/App.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const hind = Hind({
  subsets: ["latin", "devanagari"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hind",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata = {
  title: "DukanSaathi — Bill banao, stock sambhalo",
  description: "DukanSaathi — keyboard-first stock, billing, and udhari for local shops.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "DukanSaathi",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#2563EB",
};

const themeBoot = `(function(){try{if(localStorage.getItem("ds-theme")==="dark"){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark";}}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${hind.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Script id="ds-theme-boot" strategy="beforeInteractive">
          {themeBoot}
        </Script>
        <ClientApp />
        <div hidden>{children}</div>
      </body>
    </html>
  );
}
