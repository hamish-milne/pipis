// Data for the browser, as text. It has no part in rendering, so it is a module of its own: `pipis/server` and `pipis/islands` both export or
// use it, and a browser's build that uses neither takes none of the server's code with it.

/**
 * Data for the browser to read, as text to put inside `<script type="application/json">` or an attribute. It is JSON with `<`, `>`, `&` and the
 * two line separators written as escapes, so that the data cannot end the script or begin another tag. A value JSON cannot hold (`undefined`,
 * a function) is `null`.
 */
export function serializeData(value: unknown): string {
  return (JSON.stringify(value) ?? 'null').replace(/[<>&\u2028\u2029]/g, (c) => '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4));
}
