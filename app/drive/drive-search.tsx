"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import styles from "./drive.module.css";

const DriveSearchContext = createContext<{
  query: string;
  setQuery: (query: string) => void;
} | null>(null);

export function DriveSearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  return (
    <DriveSearchContext.Provider value={{ query, setQuery }}>
      {children}
    </DriveSearchContext.Provider>
  );
}

export function useDriveSearch() {
  const context = useContext(DriveSearchContext);
  if (!context) throw new Error("DriveSearchProvider is required");
  return context;
}

export function DriveSearch() {
  const { query, setQuery } = useDriveSearch();
  return (
    <div className={styles.search}>
      <Search size={20} aria-hidden="true" />
      <input
        type="search"
        aria-label="드라이브에서 검색"
        placeholder="드라이브에서 검색"
        value={query}
        onChange={event => setQuery(event.target.value)}
      />
      {query && (
        <button className={styles.iconButton} aria-label="검색 지우기" onClick={() => setQuery("")}>
          <X size={17} />
        </button>
      )}
    </div>
  );
}
