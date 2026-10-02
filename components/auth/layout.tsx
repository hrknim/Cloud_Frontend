import type { Lang } from '@/lib/global';
import { cn } from '@/lib/utils';
import Footer from '@/components/auth/footer';
import Header from '@/components/auth/header';

export default function Layout({
  children,
  translate,
  hideSearchbar,
  searchbar,
  mainClassName,
}: Readonly<{
  children: React.ReactNode;
  translate: Lang;
  hideSearchbar: boolean;
  searchbar?: React.ReactNode;
  mainClassName?: string;
}>) {
  return (
    <div className="flex flex-col min-h-screen">
      <Header translate={translate} hideSearchbar={hideSearchbar} searchbar={searchbar} />

      <main className={cn("prose prose-slate flex-1 mx-auto grid gap-8 p-4 w-full", mainClassName)}>
        {children}
      </main>

      {/*<Footer translate={translate} />*/}
    </div>
  );
}
