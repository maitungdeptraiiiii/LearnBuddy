import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'LearnMate Demo',
  description: 'LLM-powered personalized learning planner and tutor demo'
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  )
}
