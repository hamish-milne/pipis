import { describe, expect, it } from 'vite-plus/test';
import { anchorOf, blocksOf, parseInfo } from './blocks.ts';

describe('the reader of blocks', () => {
  it('reads the words of an info string, and refuses what it does not know', () => {
    const info = parseInfo('tsx live title="A counter" height=120 static', 'x');
    expect(info.language).toBe('tsx');
    expect([...info.flags]).toEqual(['live', 'static']);
    expect(info.values.get('title')).toBe('A counter');
    expect(info.values.get('height')).toBe('120');
    expect(() => parseInfo('tsx live titel="x"', 'x')).toThrow(/unknown key 'titel'/);
    expect(() => parseInfo('tsx lve', 'x')).toThrow(/unknown flag 'lve'/);
  });

  it('finds live and check blocks, and leaves the rest', () => {
    const markdown = [
      '# T',
      '```ts',
      'const a = 1;',
      '```',
      '',
      '````tsx live title="One"',
      '```',
      'inner',
      '```',
      '````',
      '  ```tsx check title="Two words"',
      '  let b;',
      '  ```',
    ].join('\n');
    const found = blocksOf(markdown, 'x.md');
    expect(found.map((b) => [b.id, b.kind, b.line, b.height])).toEqual([
      ['one', 'live', 6, null],
      ['two-words', 'check', 11, null],
    ]);
    expect(found[0]?.code, 'a longer fence holds a shorter one').toBe('```\ninner\n```\n');
    expect(found[1]?.code, 'an indented block loses its indent').toBe('let b;\n');
  });

  it('refuses a block that is wrong, naming where', () => {
    expect(() => blocksOf('```tsx live\nx\n```\n', 'x.md')).toThrow(/needs title/);
    expect(() => blocksOf('```tsx live title="x"\nx\n', 'x.md')).toThrow(/never closed/);
    expect(() => blocksOf('```js live title="x"\nx\n```\n', 'x.md')).toThrow(/'tsx' or 'ts'/);
    expect(() => blocksOf('```ts static\nx\n```\n', 'x.md')).toThrow(/not 'live' or 'check'/);
    expect(() => blocksOf('```tsx live check title="x"\nx\n```\n', 'x.md')).toThrow(/not both/);
    expect(() => blocksOf('```tsx live title="x" height=tall\nx\n```\n', 'x.md')).toThrow(/whole number/);
  });

  it('makes anchors as GitHub does', () => {
    expect(anchorOf('Plot x/y pairs')).toBe('plot-xy-pairs');
    expect(anchorOf('The `Axis` class (1)')).toBe('the-axis-class-1');
  });
});
