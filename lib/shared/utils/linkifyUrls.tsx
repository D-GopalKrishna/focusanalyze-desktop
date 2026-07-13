'use client';

import { useMemo, type MouseEvent } from 'react';

/** Shared styles for detected links (task title, card, TipTap). */
export const TASK_DESCRIPTION_LINK_CLASS =
  'text-sky-600 dark:text-sky-400 underline underline-offset-2 hover:text-sky-700 dark:hover:text-sky-300 cursor-pointer break-all';

const HTTP_URL_REGEX = /https?:\/\/[^\s<>"'`{}|\\^[\]]+/gi;

export function isAllowedHttpUrl(href: string): boolean {
  try {
    const u = new URL(href);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Strip trailing punctuation that is usually not part of the URL. */
export function trimUrlForLink(raw: string): string {
  let s = raw;
  while (s.length > 1) {
    const last = s[s.length - 1];
    if (!'.,;:!?)]'.includes(last)) break;
    const next = s.slice(0, -1);
    if (!isAllowedHttpUrl(next)) break;
    s = next;
  }
  return s;
}

export function splitTextByUrls(text: string): Array<{ type: 'text' | 'url'; value: string }> {
  const parts: Array<{ type: 'text' | 'url'; value: string }> = [];
  let lastIndex = 0;
  const re = new RegExp(HTTP_URL_REGEX.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, m.index) });
    }
    const raw = m[0];
    const trimmed = trimUrlForLink(raw);
    const href = isAllowedHttpUrl(trimmed) ? trimmed : raw;
    if (isAllowedHttpUrl(href)) {
      parts.push({ type: 'url', value: href });
    } else {
      parts.push({ type: 'text', value: raw });
    }
    lastIndex = m.index + raw.length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }
  if (parts.length === 0) {
    parts.push({ type: 'text', value: text });
  }
  return parts;
}

export function LinkifiedText({
  text,
  className,
  linkClassName = TASK_DESCRIPTION_LINK_CLASS,
  stopPropagationOnLinkClick = false,
}: {
  text: string;
  className?: string;
  linkClassName?: string;
  /** Use on board cards so opening a link does not select the task. */
  stopPropagationOnLinkClick?: boolean;
}) {
  const segments = useMemo(() => splitTextByUrls(text), [text]);

  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          <span key={i}>{seg.value}</span>
        ) : (
          <a
            key={i}
            href={seg.value}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClassName}
            {...(stopPropagationOnLinkClick
              ? {
                  onClick: (e: MouseEvent<HTMLAnchorElement>) => e.stopPropagation(),
                }
              : {})}
          >
            {seg.value}
          </a>
        ),
      )}
    </span>
  );
}

const SKIP_LINKIFY_PARENT_TAGS = new Set(['A', 'CODE', 'PRE', 'SCRIPT', 'STYLE', 'KBD', 'SAMP']);

function shouldSkipTextNode(textNode: Text): boolean {
  let p: HTMLElement | null = textNode.parentElement;
  while (p) {
    if (SKIP_LINKIFY_PARENT_TAGS.has(p.tagName)) return true;
    p = p.parentElement;
  }
  return false;
}

/**
 * Wrap bare http(s) URLs in HTML string with `<a>` for TipTap + Link extension.
 * Skips existing links and code-like parents. Client-only.
 */
export function linkifyHtmlUrlsClient(html: string, anchorClass: string): string {
  if (typeof document === 'undefined' || !html?.trim()) return html;

  const container = document.createElement('div');
  container.innerHTML = html;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const tn = n as Text;
    if (shouldSkipTextNode(tn)) continue;
    const v = tn.nodeValue;
    if (!v || !/https?:\/\//i.test(v)) continue;
    textNodes.push(tn);
  }

  for (const textNode of textNodes) {
    const value = textNode.nodeValue || '';
    const segs = splitTextByUrls(value);
    if (segs.length === 1 && segs[0].type === 'text') continue;

    const fragment = document.createDocumentFragment();
    for (const seg of segs) {
      if (seg.type === 'text') {
        fragment.appendChild(document.createTextNode(seg.value));
      } else {
        const a = document.createElement('a');
        a.href = seg.value;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = anchorClass;
        a.textContent = seg.value;
        fragment.appendChild(a);
      }
    }
    textNode.parentNode?.replaceChild(fragment, textNode);
  }

  return container.innerHTML;
}
