#!/usr/bin/env python3
"""Formats an en-US changelog for GitHub (--md) or Telegram (--html) (#265).

A changelog is sections in this order, each a heading line and "- " bullets:
    New games:
    - ...
    Bug fixes:
    - ...
    Improvements:
    - ...
--check validates that shape instead and exits 1 with the reason.
A contributor is credited on the line of their change, e.g.
"- Chinese chess, thanks to @lanlan3292"; --md and --html link every @login to
the GitHub profile (owner's wish, #533: the credit belongs on the change, not
in a line of its own at the end).
Usage: tools/release-notes.py --md|--html|--check <changelog.txt>
"""
import html
import re
import sys

SECTIONS = ['New games', 'Bug fixes', 'Improvements']


def parse(text):
    sections, current = [], None
    for n, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if not line:
            continue
        if line.endswith(':') and not line.startswith('- '):
            name = line[:-1]
            if name not in SECTIONS:
                raise ValueError('line %d: unknown heading "%s" (use %s)' % (n, name, ', '.join(SECTIONS)))
            if sections and SECTIONS.index(name) <= SECTIONS.index(sections[-1][0]):
                raise ValueError('line %d: "%s" is out of order or repeated (order: %s)' % (n, name, ', '.join(SECTIONS)))
            current = (name, [])
            sections.append(current)
        elif line.startswith('- ') and current is not None:
            current[1].append(line[2:].strip())
        else:
            raise ValueError('line %d: expected a heading or a "- " bullet under one: %s' % (n, line[:60]))
    if not sections:
        raise ValueError('no sections')
    for name, items in sections:
        if not items:
            raise ValueError('"%s" has no bullets' % name)
    return sections


# Only GitHub's own login characters, so a mention can never break out of its link
MENTION = re.compile(r'(?<![\w@/])@([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))(?![\w-])')


def linked(text, fmt):
    if fmt == '--md':
        return MENTION.sub(lambda m: '[@%s](https://github.com/%s)' % (m.group(1), m.group(1)), text)
    return MENTION.sub(lambda m: '<a href="https://github.com/%s">@%s</a>' % (m.group(1), m.group(1)), html.escape(text))


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ('--md', '--html', '--check'):
        print(__doc__.strip().splitlines()[-1], file=sys.stderr)
        return 2
    try:
        text = open(sys.argv[2], encoding='utf-8').read()
        sections = parse(text)
    except (OSError, ValueError) as e:
        print('%s: %s' % (sys.argv[2], e), file=sys.stderr)
        return 1
    if sys.argv[1] == '--check':
        # F-Droid and Google Play stop at 500 characters; Play gets each @login as
        # github.com/login (tools/play-api.sh, #644), so count that longer form
        n = len(MENTION.sub(lambda m: 'github.com/' + m.group(1), text))
        if n > 500:
            print('%s: %d characters as Play shows it, over 500' % (sys.argv[2], n), file=sys.stderr)
            return 1
        return 0
    out = []
    for name, items in sections:
        if sys.argv[1] == '--md':
            out.append('- **%s**' % name)
            out.extend('  - %s' % linked(i, '--md') for i in items)
        else:
            out.append('<b>%s</b>' % html.escape(name))
            out.extend('• %s' % linked(i, '--html') for i in items)
            out.append('')
    print('\n'.join(out).rstrip())
    return 0


if __name__ == '__main__':
    sys.exit(main())
