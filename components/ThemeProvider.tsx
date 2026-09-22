'use client'

import { createContext, useContext, type ReactNode } from 'react'

const ThemeContext = createContext<'dark' | 'light'>('dark')

export function ThemeProvider({ theme, children }: { theme: 'dark' | 'light'; children: ReactNode }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}

export function useTheme(): 'dark' | 'light' {
  return useContext(ThemeContext)
}
