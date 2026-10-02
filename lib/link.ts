export function MakePageLink(lang: string, page: string){
    return `/${lang}/${page}`;
}

export function MakeActionLink(lang: string, page: string, type: string){
    return `/${lang}/${page}/${type}`;
}

export function MakePageLinkWithParams(lang: string, type: string, params: string){
    return `${MakePageLink(lang, type)}?${params}`;
}

export function MakeActionLinkWithParams(lang: string, page: string, type: string, params: string){
    return `${MakeActionLink(lang, page, type)}?${params}`;
}
