import Link from "next/link"

import ModeToggle from '@/components/light-dark'
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Menu, User } from 'lucide-react';

import Userbar from '@/components/auth/userbar';
import { ut, type Lang } from '@/lib/global';

const CATEGORIES = [
  { id: "auth", label: 'Account', icon: User, color: "text-purple-500", bg: "bg-purple-50" },
];

interface Props {
  translate: Lang;
  hideSearchbar: boolean;
  searchbar?: React.ReactNode;
}

export default function Header({ translate, hideSearchbar = false, searchbar }: Props) {
  return (
    <header className="sticky top-0 z-20 min-h-16 border-b border-border/50 bg-background/95 backdrop-blur-sm">
      <div className="flex flex-wrap sm:flex-nowrap mx-auto min-h-16 items-center justify-between px-4 py-3 gap-x-4 gap-y-3">
        <div className="sm:flex-1 flex shrink-0 justify-start gap-2">
          <Link href={'/'} className="text-lg font-bold tracking-tighter">
            Cloud
          </Link>
        </div>

        {!hideSearchbar && (
          <div className="order-3 sm:order-none flex w-full sm:w-auto sm:flex-[2] min-w-0 items-center justify-center max-w-[50rem]">
            {searchbar ?? <Input type="search" aria-label="검색" placeholder="검색" />}
          </div>
        )}

        <nav className="sm:flex-1 flex shrink-0 justify-end items-center gap-1">
          <ModeToggle />
          <Popover>
            <PopoverTrigger className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors overflow-hidden">
              <Menu className="h-4 w-4 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-max px-6 py-4 mx-auto gap-2">
              <p className="pb-4 text-lg font-bold tracking-tighter">
                Services
              </p>
              <nav className="grid grid-cols-3 gap-4">
                {CATEGORIES.map((category) => (
                  <Link
                    key={category.id}
                    href={`/${category.id}`}
                    className="w-[72px] h-[72px] no-underline rounded-2xl border border-transparent 
                      flex flex-col items-center justify-center
                      group relative hover:border-border hover:bg-muted/50 hover:shadow-md
                      transition-all duration-300 ease-in-out
                      transform hover:-translate-y-0.5"
                  >
                    <category.icon
                      className={`w-8 h-8 mb-1 shrink-0
                        ${category.color} 
                        transition-transform duration-300 ease-out
                        group-hover:scale-110`}
                    />

                    <span className="text-[0.8rem] font-medium text-center block w-full truncate tracking-tight
                      group-hover:scale-105 transition-all duration-300 ease-out opacity-90 group-hover:opacity-100"
                    >
                      {category.label}
                    </span>
                  </Link>
                ))}
              </nav>
            </PopoverContent>
          </Popover>
          <Userbar ut={ut(translate)} authUrl={process.env.AUTH_URL || ''} />
        </nav>
      </div>
    </header>
  );
}
