const CODE_EXTENSIONS: Readonly<Record<string, true>> = {
  py: true,
  pyw: true,
  rs: true,
  go: true,
  ts: true,
  tsx: true,
  js: true,
  jsx: true,
  mjs: true,
  cjs: true,
  java: true,
  kt: true,
  kts: true,
  swift: true,
  cs: true,
  c: true,
  h: true,
  cc: true,
  cpp: true,
  hpp: true,
  cxx: true,
  rb: true,
  php: true,
  scala: true,
  sc: true,
  lua: true,
  sh: true,
  hs: true,
  lhs: true,
  md: true,
  markdown: true,
};

export function checkSourceCodePath(path: string): boolean {
  const dotIndex = path.lastIndexOf(".");
  if (dotIndex <= 0) return false;
  return Boolean(CODE_EXTENSIONS[path.slice(dotIndex + 1).toLowerCase()]);
}
