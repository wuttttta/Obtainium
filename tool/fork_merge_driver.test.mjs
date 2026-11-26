import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeJson, mergeLock, mergeReadme } from './fork_merge_driver.mjs'

const json = value => `${JSON.stringify(value, null, 4)}\n`

test('keeps fork keys next to their neighbour while taking upstream edits', () => {
    const base = json({ a: '1', b: '2', c: '3' })
    const ours = json({ a: '1', mine: 'x', b: '2', c: '3' })
    const theirs = json({ a: 'changed', b: 'changed too', c: '3', d: '4' })
    assert.equal(
        mergeJson(base, ours, theirs),
        json({ a: 'changed', mine: 'x', b: 'changed too', c: '3', d: '4' }),
    )
})

test('honours deletions from either side and prefers upstream on a clash', () => {
    const base = json({ gone: '1', dropped: '2', both: '3' })
    const ours = json({ gone: '1', both: 'fork' })
    const theirs = json({ dropped: '2', both: 'upstream' })
    assert.equal(mergeJson(base, ours, theirs), json({ both: 'upstream' }))
})

test('merges nested plural values as a unit', () => {
    const base = json({ apps: { one: 'App', other: 'Apps' } })
    const ours = json({ apps: { one: 'App', other: 'Apps' }, mine: 'x' })
    const theirs = json({ apps: { one: 'Application', other: 'Apps' } })
    assert.equal(
        mergeJson(base, ours, theirs),
        json({ apps: { one: 'Application', other: 'Apps' }, mine: 'x' }),
    )
})

const lock = (packages, dart = '3.0') =>
    [
        '# Generated',
        'packages:',
        ...Object.entries(packages).flatMap(([name, version]) => [
            `  ${name}:`,
            `    version: "${version}"`,
        ]),
        'sdks:',
        `  dart: "${dart}"`,
        '',
    ].join('\n')

test('merges pubspec.lock package by package in sorted order', () => {
    const base = lock({ typed_data: '1', upower: '1' })
    const ours = lock({ typed_data: '1', unifiedpush: '9', upower: '1' })
    const theirs = lock({ aaa: '1', typed_data: '2', upower: '2' }, '3.1')
    assert.equal(
        mergeLock(base, ours, theirs),
        lock({ aaa: '1', typed_data: '2', unifiedpush: '9', upower: '2' }, '3.1'),
    )
})

test('keeps the fork banner on top of the upstream README', () => {
    const base = '# Obtainium\nOld intro\n'
    const ours = `Fork banner\n\n${base}`
    const theirs = '# Obtainium\nNew intro\n'
    assert.equal(mergeReadme(base, ours, theirs), 'Fork banner\n\n# Obtainium\nNew intro\n')
})

test('refuses a README whose fork edits are not only a banner on top', () => {
    assert.throws(() => mergeReadme('a\nb\n', 'a\nchanged\n', 'a\nb\nc\n'))
})
