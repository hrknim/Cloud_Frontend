import Link from "next/link";
import { t, Lang } from '@/lib/global';

interface Props {
  translate: Lang;
}

export default function Footer({ translate }: Props) {
  return (
    <footer className="w-full py-8">
      <div className="mx-auto max-w-[100rem] px-6 flex flex-col md:flex-row items-center gap-y-4 text-[0.8rem] text-muted-foreground">
        <div className="flex-1 flex justify-start order-2 md:order-1">
          <span className="font-medium text-foreground/60 whitespace-nowrap">
            {t('footer_desc', translate)}
          </span>
        </div>

        <nav className="flex items-center justify-center gap-4 px-6 md:border-x border-border/50 order-1 md:order-2">
          <Link href="/policy/terms" className="hover:text-primary transition-colors whitespace-nowrap">{t('policy_terms', translate)}</Link>
          <Link href="/policy/privacy" className="hover:text-primary transition-colors whitespace-nowrap">{t('policy_privacy', translate)}</Link>
        </nav>
      </div>
    </footer>
  );
}
