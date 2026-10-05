"use client"

import Link from "next/link"
import Image from "next/image"
import { useEffect } from "react"
import { useUserSession } from "./use-user-session";
import { userSession } from "@/lib/user-session";
import { usePathname, useRouter } from "next/navigation";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator";
import { LogOut, User, History } from "lucide-react";
import type { ut as translateUser } from "@/lib/global";

interface Items {
  href: string; 
  icon: React.ReactNode; 
  label: string;
}

interface Props {
  ut: ReturnType<typeof translateUser>;
  authUrl: string;
}

function ActionItem({ href, icon, label }: Items) {
  return (
    <Link href={href} target='_blank' className="flex items-center gap-2 px-2 py-2 rounded-md text-[0.8rem] text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
      {icon}
      <span>{label}</span>
    </Link>
  );
}

export default function Userbar({ ut, authUrl }: Props) {
  const session = useUserSession();
  const pathname = usePathname();
  const router = useRouter();

  const signOut = async () => {
    try {
      const res = await fetch('/api/logout', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: 'same-origin',
      })
      if (res.ok) {
        userSession.clear();
        router.push("/");
        router.refresh();
      } 
    } catch {
    }
  }

  useEffect(() => {
    void userSession.load();
  }, [])

  return (
    <Popover>
      <PopoverTrigger className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors border overflow-hidden">
        {session?.avatarUrl ? (
          <Image src={session.avatarUrl} alt="profile" width={36} height={36} unoptimized className="h-full w-full object-cover" />
        ) : (
          <User className="h-5 w-5 text-muted-foreground" />
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2 shadow-xl border-muted-foreground/10">
        {session ? (
          <>
            <div className="flex items-center gap-3 p-2 mb-2 bg-muted/30 rounded-lg">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border text-primary font-bold">
                {session.handle?.charAt(0).toUpperCase() || "U"}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold truncate">{session.displayName}</span>
                <span className="text-[0.65rem] text-muted-foreground truncate">@{session.handle}</span>
              </div>
            </div>
                  
            <div className="space-y-0.5">
              <ActionItem href={`${authUrl}/account`} icon={<User className="w-4 h-4" />} label={ut.account_setting} />
            </div>

            <Separator className="my-2" />
                  
            <button 
              onClick={() => signOut()}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-[0.8rem] text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all font-medium"
            >
              <LogOut className="w-4 h-4" />
              <span>{ut.logout}</span>
            </button>
          </>
        ) : (
          <>
            <div className="p-3 mb-1">
              <h3 className="text-sm font-bold text-foreground">{ut.notuser_title}</h3>
              <p className="text-[0.7rem] text-muted-foreground leading-tight mt-1">
                {ut.notuser_desc}
              </p>
            </div>

            <div className="space-y-0.5">
              <ActionItem href={`${authUrl}/login?url=${encodeURIComponent(pathname)}`} icon={<User className="w-4 h-4" />} label={ut.login} />
              <ActionItem href={`${authUrl}/signup?url=${encodeURIComponent(pathname)}`} icon={<History className="w-4 h-4" />} label={ut.create_new_account} />
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
