import fs from 'fs'
import { pathToFileURL } from 'url'

export const mergeEntries = (base, ours, theirs) => {
    const baseMap = new Map(base)
    const oursMap = new Map(ours)
    const theirsMap = new Map(theirs)
    const pick = key => {
        const baseValue = baseMap.get(key)
        const oursValue = oursMap.get(key)
        const theirsValue = theirsMap.get(key)
        if (oursValue !== undefined && theirsValue !== undefined) {
            return theirsValue !== baseValue ? theirsValue : oursValue
        }
        const onlyValue = oursValue ?? theirsValue
        return onlyValue === baseValue ? undefined : onlyValue
    }
    const keys = theirs.map(([key]) => key).filter(key => pick(key) !== undefined)
    let previous = null
    for (const [key] of ours) {
        if (!keys.includes(key) && pick(key) !== undefined) {
            keys.splice(previous === null ? 0 : keys.indexOf(previous) + 1, 0, key)
        }
        if (keys.includes(key)) {
            previous = key
        }
    }
    return keys.map(key => [key, pick(key)])
}

const jsonEntries = text =>
    Object.entries(JSON.parse(text)).map(([key, value]) => [key, JSON.stringify(value)])

export const mergeJson = (base, ours, theirs) => {
    const merged = mergeEntries(jsonEntries(base), jsonEntries(ours), jsonEntries(theirs))
    const result = Object.fromEntries(merged.map(([key, value]) => [key, JSON.parse(value)]))
    return `${JSON.stringify(result, null, 4)}\n`
}

const parseLock = text => {
    const lines = text.split('\n')
    const start = lines.indexOf('packages:')
    if (start < 0) {
        throw new Error('pubspec.lock has no packages section')
    }
    let end = start + 1
    while (end < lines.length && lines[end].startsWith('  ')) {
        end++
    }
    const packages = []
    for (const line of lines.slice(start + 1, end)) {
        if (/^ {2}\S/.test(line)) {
            packages.push([line, [line]])
        } else {
            packages.at(-1)[1].push(line)
        }
    }
    return {
        header: lines.slice(0, start + 1).join('\n'),
        packages: packages.map(([key, block]) => [key, block.join('\n')]),
        footer: lines.slice(end).join('\n'),
    }
}

export const mergeLock = (base, ours, theirs) => {
    const [baseLock, oursLock, theirsLock] = [base, ours, theirs].map(parseLock)
    const packages = mergeEntries(baseLock.packages, oursLock.packages, theirsLock.packages)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([, block]) => block)
    const footer = theirsLock.footer !== baseLock.footer ? theirsLock.footer : oursLock.footer
    return [theirsLock.header, ...packages, footer].join('\n')
}

export const mergeReadme = (base, ours, theirs) => {
    if (!ours.endsWith(base)) {
        throw new Error('README.md: the fork may only add text before the upstream text')
    }
    return ours.slice(0, ours.length - base.length) + theirs
}

const main = () => {
    const [basePath, oursPath, theirsPath, targetPath] = process.argv.slice(2)
    const [base, ours, theirs] = [basePath, oursPath, theirsPath].map(path =>
        fs.readFileSync(path, 'utf-8'),
    )
    const merge = targetPath.endsWith('pubspec.lock')
        ? mergeLock
        : targetPath.endsWith('README.md')
            ? mergeReadme
            : mergeJson
    fs.writeFileSync(oursPath, merge(base, ours, theirs))
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main()
    } catch (e) {
        console.error(e)
        process.exit(1)
    }
}
