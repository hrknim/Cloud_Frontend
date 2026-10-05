import createDOMPurify, { type WindowLike } from "dompurify";

// No active content, document styles, links or network-backed images are admitted.
export function sanitizeWordHtml(html: string, window: WindowLike) {
  const purifier = createDOMPurify(window);
  purifier.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName === "src" && !/^data:image\/(png|jpeg|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(data.attrValue)) data.keepAttr = false;
    if (["colspan", "rowspan"].includes(data.attrName) && !/^[1-9]\d{0,2}$/.test(data.attrValue)) data.keepAttr = false;
  });
  return purifier.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i", "u", "s", "strike", "sup", "sub", "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "blockquote", "pre", "code", "hr", "img", "span", "div"],
    ALLOWED_ATTR: ["src", "alt", "title", "colspan", "rowspan"],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
}

export function wordPreviewDocument(cleanHtml: string, fontSize = 16, wide = false) {
  const size = Math.max(12, Math.min(24, Number.isFinite(fontSize) ? fontSize : 16));
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>워드 문서 미리보기</title><style>
  *{box-sizing:border-box}html{background:#dadce0;color:#202124;color-scheme:light}body{margin:0;padding:24px;font: ${size}px/1.75 Arial,'Malgun Gothic',sans-serif;overflow-wrap:anywhere}
  article{max-width:${wide ? "1200" : "850"}px;margin:auto;background:white;padding:48px 56px;min-height:calc(100vh - 48px);box-shadow:0 2px 12px #0002}
  p{margin:0 0 1em}h1,h2,h3,h4,h5,h6{line-height:1.35;margin:1.2em 0 .6em}h1{font-size:2em}h2{font-size:1.5em}h3{font-size:1.2em}
  img{max-width:100%;height:auto}img:not([src]),img[src=""]{display:none}table{border-collapse:collapse;max-width:100%;display:block;overflow:auto;margin:1em 0}th,td{border:1px solid #cbd0d8;padding:8px 12px;vertical-align:top;min-width:70px}td p,th p{margin:0}blockquote{border-left:3px solid #cbd0d8;margin-left:0;padding-left:20px;color:#596273}pre{white-space:pre-wrap;background:#f3f5f7;padding:12px}li{margin:.25em 0}
  @media(max-width:640px){body{padding:8px}article{padding:24px 18px;min-height:calc(100vh - 16px)}}
  </style></head><body><article>${cleanHtml}</article></body></html>`;
}
