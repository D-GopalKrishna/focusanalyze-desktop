const MIN_OVERLAP_WORDS = 3;
const JUNK_SPOKEN_RE = /^[\s.。…,!?;:~•\-–—_/\\'"]+$/;

function norm(text: string): string {
  return (text || '').trim().replace(/\s+/g, ' ');
}

/** Empty when Web Speech / Whisper emitted only dots or punctuation (TTS echo, tab noise). */
export function usableSpokenTranscript(text: string): string {
  const cleaned = norm(text);
  if (!cleaned || JUNK_SPOKEN_RE.test(cleaned)) return '';
  return cleaned;
}

/** Drop a trailing copy of the same spoken phrase (caption + Whisper echo). */
export function collapseRepeatedUtterance(text: string): string {
  const cleaned = usableSpokenTranscript(text) || norm(text);
  if (!cleaned) return '';
  const words = cleaned.split(' ');
  const n = words.length;
  if (n < 8) return cleaned;
  // An exact even-halves duplicate ("X X") is just the split === n / 2 case of the suffix
  // scan below (the tail === right check reduces to left === right when both halves are
  // equal length), so one scan covers both instead of two separate checks.
  for (let split = n - 4; split > 3; split -= 1) {
    const left = words.slice(0, split);
    const right = words.slice(split);
    if (right.length < 4) continue;
    const leftL = left.map((w) => w.toLowerCase());
    const rightL = right.map((w) => w.toLowerCase());
    if (leftL.length >= rightL.length) {
      const tail = leftL.slice(-rightL.length);
      if (tail.join(' ') === rightL.join(' ')) return left.join(' ');
    }
    const maxPrefix = Math.min(3, leftL.length - rightL.length);
    for (let k = 1; k <= maxPrefix; k += 1) {
      if (leftL.slice(k).join(' ') === rightL.join(' ')) return left.join(' ');
    }
  }
  return cleaned;
}

/**
 * Join two transcripts of the same utterance without duplicating the overlap.
 * Browser live captions + Whisper often share a tail/head of the same sentence.
 */
export function mergeSpokenTranscripts(first: string, second: string): string {
  const a = usableSpokenTranscript(first);
  const b = usableSpokenTranscript(second);
  if (!a) return collapseRepeatedUtterance(b);
  if (!b) return collapseRepeatedUtterance(a);
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (al === bl) return a;
  if (al.includes(bl) || bl.includes(al)) {
    return collapseRepeatedUtterance(a.length >= b.length ? a : b);
  }

  const aWords = a.split(' ');
  const bWords = b.split(' ');

  const overlapJoin = (left: string[], right: string[]): string | null => {
    const maxK = Math.min(left.length, right.length);
    for (let k = maxK; k >= MIN_OVERLAP_WORDS; k -= 1) {
      const leftTail = left.slice(-k).join(' ').toLowerCase();
      const rightHead = right.slice(0, k).join(' ').toLowerCase();
      if (leftTail === rightHead) {
        return [...left, ...right.slice(k)].join(' ');
      }
    }
    return null;
  };

  return collapseRepeatedUtterance(
    overlapJoin(aWords, bWords) ?? overlapJoin(bWords, aWords) ?? `${a} ${b}`,
  );
}

/** Browser captions are live UI only. Whisper is the prompt when it has real words. */
export function preferWhisperOverCaptions(whisper: string, captions = ''): string {
  const stt = usableSpokenTranscript(whisper);
  if (stt) return collapseRepeatedUtterance(stt);
  return collapseRepeatedUtterance(usableSpokenTranscript(captions));
}
