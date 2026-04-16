import { piiBaseMask } from './piiBaseMask.js';

export default class PathMask extends piiBaseMask {

    constructor() {

        super("FILE_PATH");

    }

    find(text, mode = 'strict') {

        const winAbs = /[a-zA-Z]:\\[\w\-\.\(\)\\]+/gi;

        const winRel = /(?<=[\s"'=,(\[]|^)(?:\.{1,2}\\)?(?:[\w.-]+\\)+[\w.-]+/gi;

        const unixAbs = /(?<=[\s"'=,(\[]|^)\/(?:[\w.-]+\/)*[\w.-]+/gi;

        const unixRel = /(?<=[\s"'=,(\[]|^)[\w.-]+\/[\w.-]+\/(?:[\w.-]+\/?)*[\w.-]*/gi;

        const regex = new RegExp(`(${winAbs.source}|${winRel.source}|${unixAbs.source}|${unixRel.source})`, 'gi');

        const matches = text.matchAll(regex);

        if (mode === 'strict') {
            return matches;
        }

        // developer mode
        return (function* () {
            for (const match of matches) {
                const path = match[0].toLowerCase();

                const isSafeDevPath =
                    path.includes('node_modules') ||
                    path.includes('/usr/bin/') ||
                    path.includes('/usr/local/') ||
                    path.includes('/etc/') ||
                    path.includes('src/') ||
                    path.includes('utils/') ||
                    path.startsWith('./') ||
                    path.startsWith('../') ||
                    path.includes('.github');

                if (isSafeDevPath) {
                    continue;
                }

                yield match;
            }
        })();

    }

    validate(matchText, mode = 'strict') {

        const path = matchText.trim();

        if (path.length < 4) return false;

        if (/^[\d\/\\\-\.]+$/.test(path)) return false;

        const digitCount = (path.match(/\d/g) || []).length;
        if (digitCount > path.length * 0.7) return false;

        return true;

    }

}