"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import SearchBar from "@/components/auth/searchBar";
import { defaultSearchFilters, type SearchFilters } from "@/lib/drive/drive-search";

const DriveSearchContext = createContext<{
  query: string;
  setQuery: (query: string) => void;
  searchFilters: SearchFilters;
  setSearchFilters: (filters: SearchFilters) => void;
  resetSearch: () => void;
} | null>(null);

export function DriveSearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({ ...defaultSearchFilters });
  const resetSearch = () => { setQuery(""); setSearchFilters({ ...defaultSearchFilters }); };
  return <DriveSearchContext.Provider value={{ query, setQuery, searchFilters, setSearchFilters, resetSearch }}>{children}</DriveSearchContext.Provider>;
}

export function useDriveSearch() {
  const context = useContext(DriveSearchContext);
  if (!context) throw new Error("DriveSearchProvider is required");
  return context;
}

export function DriveSearch() {
  const { query, setQuery, searchFilters, setSearchFilters, resetSearch } = useDriveSearch();
  return <SearchBar query={query} onQueryChange={setQuery} filters={searchFilters} onFiltersChange={setSearchFilters} onReset={resetSearch} />;
}
