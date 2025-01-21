
export function isDigitOrDot(char) {
    return char === '.' || (char >= '0' && char <= '9');
}

export function getMatchingBracket(openBracket) {
    const bracketPairs = {
        '(': ')',
        '[': ']',
        '{': '}',
        '|': '|',
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


export function newMessage() {
    const obj = JSON.parse(JSON.stringify({
        data: []
    }));

    obj.info = function (message) {
        this.data.push({
            type: 'info',
            msg: message,
        });
        console.log(`[INFO] ${message}`);
    };

    obj.warn = function (message) {
        this.data.push({
            type: 'warn',
            msg: message,
        });
        console.warn(`[WARN] ${message}`);
    };

    obj.err = function (message) {
        this.data.push({
            type: 'error',
            msg: message,
        });
        console.error(`[ERROR] ${message}`);
    };

    obj.clear = function () {
        this.data = [];
    };

    obj.getByType = function (type) {
        return this.data.filter(item => item.type === type);
    };

    obj.getAll = function () {
        return this.data;
    };

    return obj;
}

export function insertBetween(arr, elements) {
    for (let i = arr.length - 1; i > 0; i--) {
        arr.splice(i, 0, ...elements);
    }
    return arr;
}
