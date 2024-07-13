const latexEscapes = {
    '\\\\': '\\',
    '\\{': '{',
    '\\}': '}',
    '\\$': '$',
    '\\_': '_',
    '\\&': '&',
    '\\#': '#',
    '\\%': '%',
    '\\^': '^',
    '\\~': '~'
};

export function decodeLatexEscape(input) {
    let output = input;
    for (const [key, value] of Object.entries(latexEscapes)) {
        output = output.split(key).join(value);
    }
    return output;
}


const typstEscapes = {
    '\\': '\\\\',
    ',': '\\,',
    ';': '\\;',
    '{': '\\{',
    '}': '\\}',
    '[': '\\[',
    '(': '\\(',
    ')': '\\)',
    '$': '\\$',
    '_': '\\_',
    '&': '\\&',
    '#': '\\#',
    '^': '\\^',
    '~': '\\~'
};

export function encodeTypstEscape(input) {
    let output = input;
    for (const [key, value] of Object.entries(typstEscapes)) {
        output = output.split(key).join(value);
    }
    return output;
}

const typstFunctionEscapes = {
    '\\': '\\\\',
    ',': '\\,',
    ';': '\\;',
};

export function encodeTypstFunctionEscape(input) {
    let output = input;
    for (const [key, value] of Object.entries(typstFunctionEscapes)) {
        output = output.split(key).join(value);
    }
    return output;
}
