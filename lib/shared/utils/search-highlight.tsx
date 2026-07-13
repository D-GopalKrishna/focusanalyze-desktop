import type { ReactNode } from 'react';

const MARK_TAG_RE = /(<mark>|<\/mark>)/gi;

/**
 * Render backend highlight snippets that use <mark> tags without trusting any
 * other HTML that may be present in user-controlled indexed text.
 */
export function renderMarkOnlyHighlight(snippet: string): ReactNode {
  const nodes: ReactNode[] = [];
  const tokens = snippet.split(MARK_TAG_RE);
  let markText = '';
  let inMark = false;

  for (const token of tokens) {
    if (!token) continue;

    const normalized = token.toLowerCase();
    if (normalized === '<mark>') {
      if (inMark) {
        markText += token;
      } else {
        inMark = true;
        markText = '';
      }
      continue;
    }

    if (normalized === '</mark>') {
      if (inMark) {
        nodes.push(<mark key={nodes.length}>{markText}</mark>);
        inMark = false;
        markText = '';
      } else {
        nodes.push(token);
      }
      continue;
    }

    if (inMark) {
      markText += token;
    } else {
      nodes.push(token);
    }
  }

  if (inMark) {
    nodes.push(`<mark>${markText}`);
  }

  return <>{nodes}</>;
}
