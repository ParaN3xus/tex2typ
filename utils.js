
export function isDigitOrDot(char) {
    return char === '.' || (char >= '0' && char <= '9');
}

export function getMatchingBracket(openBracket) {
    const bracketPairs = {
        '(': ')',
        '[': ']',
        '{': '}'
    };
    return bracketPairs[openBracket] || '';
}

export function getSingleBody(body) {
    if (Array.isArray(body)) {
        if (body.length == 1) {
            return getSingleBody(body[0])
        }
        return null;
    }

    if (Array.isArray(body.body)) {
        if (body.body.length == 1) {
            return getSingleBody(body.body[0])
        }
        return null;
    }

    return body;
}