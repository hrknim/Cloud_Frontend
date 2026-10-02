import { Badge } from "@/components/ui/badge";

export default function PageList({badge, title = '', user, date, type, memo, action}: {badge: string, title?: string, user: string, date: Date, type: string, memo: any, action: any}) {
  return (
    <li
      key={`l-${date}`}
      className="flex flex-col gap-4 p-2 transition-colors hover:bg-muted/50 lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="flex flex-col flex-1 min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={"outline"} className="uppercase">
            {badge}
          </Badge>
          {title && (<a href={`/${badge}/${title}`} className='no-underline' target='_blank'><span className="font-bold">{title}</span></a>)}
          <Badge variant={"secondary"} className="text-foreground/80">{user}</Badge>
          <span className="text-muted-foreground text-xs">{new Date(date).toLocaleString()}</span>
          <Badge 
            variant='outline'
            className='text-[0.65rem] h-4 px-1.5 font-black border'
          >
            {type}
          </Badge>
          {action}
        </div>
        {memo}
      </div>
    </li>
  );
}
