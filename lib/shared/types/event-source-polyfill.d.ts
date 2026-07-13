declare module 'event-source-polyfill' {
  export class EventSourcePolyfill {
    constructor(url: string, options?: EventSourceInit);
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
    close(): void;
    readonly readyState: number;
    readonly url: string;
    readonly withCredentials: boolean;
    onopen: ((this: EventSourcePolyfill, ev: Event) => any) | null;
    onmessage: ((this: EventSourcePolyfill, ev: MessageEvent) => any) | null;
    onerror: ((this: EventSourcePolyfill, ev: Event) => any) | null;
  }

  export class Event extends EventTarget {
    constructor(type: string, eventInitDict?: EventInit);
  }

  export interface EventSourceInit {
    withCredentials?: boolean;
    headers?: Record<string, string>;
  }
}
