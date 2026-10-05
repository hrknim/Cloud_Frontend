"use client";

import { useTheme } from "next-themes"
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react"

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export default function ModeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  // Keep the server and initial hydration render identical before showing the theme.
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);

  if (!mounted) {
    return (<button className="h-9 w-9 flex items-center justify-center rounded-full" />)
  }

  const toggleTheme = () => {
    if (theme === "system") {
      setTheme(resolvedTheme === "dark" ? "light" : "dark")
    } else {
      setTheme("system")
    }
  }

  return (
    <button
      onClick={toggleTheme}
      className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
      aria-label="Toggle theme"
    >
      {resolvedTheme === "dark" ? (
        <Moon className="h-4 w-4" />
      ) : (
        <Sun className="h-4 w-4" />
      )}
    </button>
  )
}
