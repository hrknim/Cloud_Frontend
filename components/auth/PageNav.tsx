import { Button } from "@/components/ui/button";
import { ChevronsLeft, ChevronsRight, ChevronRight, ChevronLeft } from "lucide-react";

export default function PageNav({currentPage, totalPages, pages, params = ''}: any) {
  return (
    <div className="flex justify-center items-center gap-1 mt-8">
      {/* 맨 처음 페이지 (<<) */}
      <Button variant="outline" size="icon" disabled={currentPage <= 1} asChild={currentPage > 1}>
        {currentPage > 1 ? <a href={`?p=1${params}`}><ChevronsLeft className="w-4 h-4" /></a> : <ChevronsLeft className="w-4 h-4" />}
      </Button>

      {/* 이전 페이지 (<) */}
      <Button variant="outline" size="icon" disabled={currentPage <= 1} asChild={currentPage > 1}>
        {currentPage > 1 ? <a href={`?p=${currentPage - 1}${params}`}><ChevronLeft className="w-4 h-4" /></a> : <ChevronLeft className="w-4 h-4" />}
      </Button>

      {/* 숫자 페이지들 */}
      {pages.map((p: any) => (
        <Button
          key={p}
          variant={currentPage === p ? "default" : "outline"}
          size="icon"
          className="w-9 h-9"
          asChild={currentPage !== p}
        >
          {currentPage !== p ? <a href={`?p=${p}${params}`} className="no-underline text-sm">{p}</a> : <span className="text-sm">{p}</span>}
        </Button>
      ))}

      {/* 다음 페이지 (>) */}
      <Button variant="outline" size="icon" disabled={currentPage >= totalPages} asChild={currentPage < totalPages}>
        {currentPage < totalPages ? <a href={`?p=${currentPage + 1}${params}`}><ChevronRight className="w-4 h-4" /></a> : <ChevronRight className="w-4 h-4" />}
      </Button>

      {/* 맨 마지막 페이지 (>>) */}
      <Button variant="outline" size="icon" disabled={currentPage >= totalPages} asChild={currentPage < totalPages}>
        {currentPage < totalPages ? <a href={`?p=${totalPages}${params}`}><ChevronsRight className="w-4 h-4" /></a> : <ChevronsRight className="w-4 h-4" />}
      </Button>
    </div>
  );
}
