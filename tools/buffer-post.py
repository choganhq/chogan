#!/usr/bin/env python3
"""Posts a release to X, Mastodon and Bluesky through Buffer's API (#1056).

Usage: tools/buffer-post.py <version> <changelog.txt> [--send]
Without --send it only prints the post and the channels it would use (exit 0).
Needs BUFFER_API_KEY in the environment (a Buffer personal key; it expires within a year,
so a 401 is reported as such). Exit 1: a refusal or a failed request. Exit 2: cannot run.

X allows 280 characters and counts a link as 23, so the post is the headline, the new games
and as many other changelog lines as still fit; Mastodon and Bluesky allow more.
"""
import datetime
import importlib.util
import json
import os
import re
import sys
import urllib.error
import urllib.request

API = 'https://api.buffer.com'
SERVICES = ('twitter', 'mastodon', 'bluesky')
LIMIT, LINK = 280, 23
SITE = 'https://playchogan.com'


def load_sections(path):
    here = os.path.dirname(os.path.abspath(__file__))
    spec = importlib.util.spec_from_file_location('release_notes', os.path.join(here, 'release-notes.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.parse(open(path, encoding='utf-8').read())


# The code points X counts once (twitter-text config/v3.json); everything else counts twice
SINGLE = ((0, 4351), (8192, 8205), (8208, 8223), (8242, 8247))


def length(text):
    # X counts every link as 23, whatever its length. A joined emoji is counted per code
    # point here, more than X would: a post may come out shorter, never over the limit.
    text = re.sub(r'https?://\S+', 'x' * LINK, text)
    return sum(1 if any(a <= ord(c) <= b for a, b in SINGLE) else 2 for c in text)


def plain(item):
    # The first link in a post becomes X's preview card, so a credit must not be a link: it
    # was github.com/<login> and the card showed that person's profile instead of the app.
    return re.sub(r'(?<![\w./:@-])github\.com/([A-Za-z0-9-]+)', r'\1', item)


def build(version, sections):
    head = 'Chogan %s is out \U0001F3AE\n\n' % version
    tail = '\n\nFree, offline, no ads: ' + SITE
    games = [plain(i) for n, items in sections if n == 'New games' for i in items]
    rest = [plain(i) for n, items in sections if n != 'New games' for i in items]
    lines = []
    if games:
        lines.append('New games: ' + '; '.join(games))
    while True:
        # "Also" needs the games line above it; 1.1.0 had none and began with it (#1288)
        intro = 'Also: ' if games else "What's new: "
        text = head + '\n'.join(lines + ([intro + '; '.join(rest)] if rest else [])) + tail
        if length(text) <= LIMIT or not rest:
            break
        rest.pop()
    if length(text) > LIMIT and games:
        # even the games alone are too long: keep the headline and the link
        text = head.rstrip() + tail
    return text


def call(key, query):
    req = urllib.request.Request(API, data=json.dumps({'query': query}).encode(), method='POST',
                                 headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 401:
            print('Buffer refused the key (401): it expired or was replaced. Make a new one and update BUFFER_API_KEY.', file=sys.stderr)
        else:
            print('Buffer answered HTTP %d' % e.code, file=sys.stderr)
        sys.exit(1)
    if body.get('errors'):
        print('Buffer errors: %s' % json.dumps(body['errors'])[:500], file=sys.stderr)
        sys.exit(1)
    return body['data']


def main():
    args = [a for a in sys.argv[1:] if a != '--send']
    send = '--send' in sys.argv[1:]
    if len(args) != 2:
        print(__doc__.strip().splitlines()[2], file=sys.stderr)
        return 2
    key = os.environ.get('BUFFER_API_KEY', '')
    if not key:
        print('BUFFER_API_KEY is not set', file=sys.stderr)
        return 2
    version, path = args
    text = build(version, load_sections(path))
    print('--- post (%d of %d counted characters) ---\n%s\n---' % (length(text), LIMIT, text))
    orgs = call(key, '{ account { organizations { id name } } }')['account']['organizations']
    channels = []
    for o in orgs:
        channels += call(key, '{ channels(input: { organizationId: %s }) { id name service } }' % json.dumps(o['id']))['channels']
    print('channels: ' + ', '.join('%s/%s' % (c['service'], c['name']) for c in channels))
    chosen = [c for c in channels if c['service'] in SERVICES]
    missing = [s for s in SERVICES if s not in {c['service'] for c in chosen}]
    if missing:
        print('no Buffer channel for: %s' % ', '.join(missing), file=sys.stderr)
        return 1
    if not send:
        print('dry run: nothing was posted')
        return 0
    # Two minutes ahead: the docs show customScheduled with dueAt; the share-now value is not in them.
    due = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=2)).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    failed = 0
    for c in chosen:
        q = ('mutation { createPost(input: { text: %s, channelId: %s, schedulingType: automatic, mode: customScheduled, dueAt: "%s" }) '
             '{ ... on PostActionSuccess { post { id } } ... on MutationError { message } } }') % (json.dumps(text), json.dumps(c['id']), due)
        res = call(key, q)['createPost']
        if res.get('post'):
            print('scheduled on %s' % c['service'])
        else:
            failed += 1
            print('%s refused: %s' % (c['service'], res.get('message')), file=sys.stderr)
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
