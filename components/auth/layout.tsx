import type { Lang } from '@/lib/global';
import { cn } from '@/lib/utils';
import Header from '@/components/auth/header';

export default function Layout({
  children,
  translate,
  hideSearchbar,
  searchbar,
  mainClassName,
  className,
}: Readonly<{
  children: React.ReactNode;
  translate: Lang;
  hideSearchbar: boolean;
  searchbar?: React.ReactNode;
  mainClassName?: string;
  className?: string;
}>) {
  return (
    <div className={cn("flex flex-col min-h-screen", className)}>
      <Header translate={translate} hideSearchbar={hideSearchbar} searchbar={searchbar} />

      <main className={cn("prose prose-slate flex-1 mx-auto grid gap-8 p-4 w-full", mainClassName)}>
        {children}
      </main>

      {/*<Footer translate={translate} />*/}
    </div>
  );
}
