const CODE_EXTENSIONS: Readonly<Record<string, true>> = {
  py: true,
  rs: true,
  go: true,
  ts: true,
  tsx: true,
  js: true,
  jsx: true,
  java: true,
  kt: true,
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
  lua: true,
  sh: true,
  md: true,
  markdown: true,
};

export function checkSourceCodePath(path: string): boolean {
  const dotIndex = path.lastIndexOf(".");
  if (dotIndex <= 0) return false;
  return Boolean(CODE_EXTENSIONS[path.slice(dotIndex + 1).toLowerCase()]);
}
