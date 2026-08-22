declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.svg' {
  const value: string;
  export default value;
}

// Side-effect CSS imports (`import './globals.css'`) need a module declaration
// or TS 5.9+ reports noUncheckedSideEffectImports.
declare module '*.css';
