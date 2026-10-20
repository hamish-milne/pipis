// The front matter of a page: a few lines between `---` fences at the top of its Markdown, which say what the search and the page's head
// should know about it. It is a small, fixed subset of YAML (`key: text`, and `tags: [one, two]`), read here without a YAML parser, and a
// key or a value that is not understood is an error that names the line, so that a typo is found when the site is built and not by a reader.
//
//     ---
//     description: What the page is for, in a sentence: the search shows it and the page's head carries it.
//     tags: [reactivity, state]
//     section: Guide
//     ---
//
// GitHub shows front matter as a table above the page, so the page reads on both.

export interface Frontmatter {
  /** What the page is for, if the first paragraph is not the best way to say it. */
  description?: string;
  /** The topics of the page, which the search can narrow by. */
  tags: string[];
  /** The part of the documentation the page is in, if where it is in the navigation does not say. */
  section?: string;
}

const KEYS = ['description', 'tags', 'section'];

/** A tag: lowercase words joined by hyphens. */
export const TAG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function scalar(text: string): string {
  const quoted = /^(["'])(.*)\1$/.exec(text);
  return quoted ? (quoted[2] ?? '') : text;
}

/**
 * The front matter of a page, and the page without it. The page keeps its length in lines (the front matter becomes empty lines), so the
 * line numbers of what the checks report are the lines of the file.
 */
export function readFrontmatter(markdown: string, file: string): { data: Frontmatter; body: string } {
  const data: Frontmatter = { tags: [] };
  const lines = markdown.split('\n');
  if (lines[0]?.trimEnd() !== '---') return { data, body: markdown };
  const end = lines.findIndex((line, i) => i > 0 && line.trimEnd() === '---');
  if (end < 0) throw new Error(`${file}:1: the front matter is never closed (a line of --- ends it)`);
  const seen = new Set<string>();
  for (let i = 1; i < end; i++) {
    const line = lines[i] ?? '';
    if (line.trim() === '') continue;
    const where = `${file}:${i + 1}`;
    const m = /^([A-Za-z]+):\s*(.*)$/.exec(line);
    if (!m) throw new Error(`${where}: cannot read '${line.trim()}' in the front matter (a line is \`key: value\`)`);
    const key = m[1] ?? '';
    const value = (m[2] ?? '').trim();
    if (!KEYS.includes(key)) throw new Error(`${where}: unknown key '${key}' in the front matter (keys: ${KEYS.join(', ')})`);
    if (seen.has(key)) throw new Error(`${where}: '${key}' is in the front matter twice`);
    seen.add(key);
    if (value === '') throw new Error(`${where}: '${key}' has no value`);
    if (key === 'tags') {
      const list = /^\[(.*)\]$/.exec(value);
      if (!list) throw new Error(`${where}: tags are a list in brackets: tags: [one, two]`);
      const tags = (list[1] ?? '')
        .split(',')
        .map((t) => scalar(t.trim()))
        .filter(Boolean);
      for (const tag of tags) {
        if (!TAG.test(tag)) throw new Error(`${where}: the tag '${tag}' is not lowercase words joined by hyphens`);
      }
      if (new Set(tags).size !== tags.length) throw new Error(`${where}: a tag is in the list twice`);
      data.tags = tags;
    } else if (key === 'description') {
      data.description = scalar(value);
    } else {
      data.section = scalar(value);
    }
  }
  return { data, body: lines.map((line, i) => (i <= end ? '' : line)).join('\n') };
}
