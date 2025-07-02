import type React from "react"
import type { Metadata } from "next"
import { Plus_Jakarta_Sans, Playfair_Display, Inria_Serif } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/provider"

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
})

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
})

const inriaSerif = Inria_Serif({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-inria-serif",
})

export const metadata: Metadata = {
  title: "Qode Dashboard",
  description: "Client dashboard for Qode",
  generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body
        className={`${plusJakartaSans.variable} ${playfairDisplay.variable} ${inriaSerif.variable} font-sans antialiased bg-primary-bg min-h-screen`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}