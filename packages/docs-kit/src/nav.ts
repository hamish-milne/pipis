// The order of the site is the order of docs/README.md: its `##` sections and the links in them. One list, read by people on GitHub
// and by the site's navigation.
import { posix } from 'node:path';
import { pageUrl } from './markdown.ts';

export interface NavItem {
  title: string;
  /** The Markdown file, relative to the docs folder. */
  file: string;
  /** The page, relative to the site. */
  url: string;
  about: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** The sections of the index, leaving out links to files outside the docs folder, which are not pages of the site. */
export function parseNav(readme: string): NavSection[] {
  const sections: NavSection[] = [];
  for (const line of readme.split(/\r?\n/)) {
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      sections.push({ title: heading[1] ?? '', items: [] });
      continue;
    }
    const item = /^-\s+\[([^\]]+)\]\(([^)#\s]+\.md)\)(?::\s*(.*))?$/.exec(line);
    if (!item) continue;
    const file = posix.normalize(item[2] ?? '');
    if (file.startsWith('..')) continue;
    sections[sections.length - 1]?.items.push({ title: item[1] ?? '', file, url: pageUrl(file), about: item[3] ?? '' });
  }
  return sections.filter((s) => s.items.length > 0);
}
