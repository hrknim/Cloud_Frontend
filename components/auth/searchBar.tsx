"use client";

import { useState } from "react";
import { CalendarRange, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { defaultSearchFilters, hasSearchFilters, type SearchFilters } from "@/lib/drive/drive-search";
import { fileCategories } from "@/lib/files/file-types";

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  onReset: () => void;
};

export default function SearchBar({ query, onQueryChange, filters, onFiltersChange, onReset }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const active = hasSearchFilters(filters);
  const invalidDates = !!draft.modifiedFrom && !!draft.modifiedTo && draft.modifiedFrom > draft.modifiedTo;
  return <div className="w-full max-w-4xl mx-auto">
    <div className="relative">
      <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none text-muted-foreground" aria-hidden="true" />
      <input type="search" aria-label="Cloud 파일 및 폴더 검색" placeholder="파일 및 폴더 검색"
        value={query} onChange={event => onQueryChange(event.target.value)}
        className="selection:bg-primary selection:text-primary-foreground border border-input w-full bg-transparent h-12 pl-10 pr-24 shadow-xs rounded-full text-sm transition-[color,box-shadow] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:appearance-none" />
      <div className="flex items-center absolute right-1 top-1/2 -translate-y-1/2">
        {(query || active) && <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-full" aria-label="검색어와 필터 초기화" onClick={onReset}><X className="h-4 w-4" /></Button>}
        <Dialog open={open} onOpenChange={next => { if (next) setDraft({ ...filters }); setOpen(next); }}>
          <DialogTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label="상세 검색" className={`h-10 w-10 rounded-full ${active ? "bg-primary/10 text-primary" : ""}`}><SlidersHorizontal className="h-4 w-4" /></Button></DialogTrigger>
          <DialogContent className="sm:max-w-[560px] rounded-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5" />파일 상세 검색</DialogTitle>
              <DialogDescription>현재 메뉴의 파일·폴더를 검색합니다. 전체 폴더를 선택하면 하위 항목도 검색하며, 내 드라이브에서는 공유받은 항목도 포함합니다.</DialogDescription>
            </DialogHeader>
            <form className="space-y-5" onSubmit={event => { event.preventDefault(); if (!invalidDates) { onFiltersChange({ ...draft }); setOpen(false); } }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label htmlFor="cloud-search-scope">검색 범위</Label><select id="cloud-search-scope" value={draft.scope} onChange={event => setDraft({ ...draft, scope: event.target.value as SearchFilters["scope"] })} className="w-full rounded-xl border border-input bg-background px-3 h-10 text-sm"><option value="current">현재 위치</option><option value="all">전체 폴더</option></select></div>
                <div className="space-y-2"><Label htmlFor="cloud-search-kind">파일 종류</Label><select id="cloud-search-kind" value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as SearchFilters["kind"] })} className="w-full rounded-xl border border-input bg-background px-3 h-10 text-sm"><option value="all">전체 항목</option>{fileCategories.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}</select></div>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.starredOnly} onChange={event => setDraft({ ...draft, starredOnly: event.target.checked })} /><Star className="h-4 w-4" aria-hidden="true" />즐겨찾기만 검색</label>
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-sm font-medium"><CalendarRange className="h-4 w-4" />수정한 날짜 (한국 시간)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2"><Label htmlFor="cloud-search-from">시작일</Label><Input id="cloud-search-from" type="date" value={draft.modifiedFrom} max={draft.modifiedTo || undefined} onChange={event => setDraft({ ...draft, modifiedFrom: event.target.value })} className="rounded-xl" /></div>
                  <div className="space-y-2"><Label htmlFor="cloud-search-to">종료일</Label><Input id="cloud-search-to" type="date" value={draft.modifiedTo} min={draft.modifiedFrom || undefined} onChange={event => setDraft({ ...draft, modifiedTo: event.target.value })} className="rounded-xl" /></div>
                </div>
                {invalidDates && <p role="alert" className="text-sm text-destructive">종료일은 시작일보다 빠를 수 없습니다.</p>}
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
                <Button type="button" variant="ghost" onClick={() => setDraft({ ...defaultSearchFilters })}>필터 초기화</Button>
                <Button type="submit" disabled={invalidDates} className="rounded-xl">검색 조건 적용</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
    {active && <p className="text-xs text-muted-foreground px-4 pt-2" role="status">검색 조건 적용 중{filters.scope === "all" ? " · 전체 폴더" : ""}{filters.starredOnly ? " · 즐겨찾기" : ""}{filters.modifiedFrom || filters.modifiedTo ? ` · ${filters.modifiedFrom || "처음"} ~ ${filters.modifiedTo || "현재"}` : ""}</p>}
  </div>;
}
