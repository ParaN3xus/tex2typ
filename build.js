import { xArrowMapping, fontMapping, textordMapping, mathordMapping, accentMapping, atomMapping, opMapping, relMapping, lrMapping } from './mapping.js';
import { decodeLatexEscape, encodeTypstFunctionEscape } from "./escape.js"

var build_functions = {}

build_functions.atom = function (tree, in_function) {
    var res;
    if (tree.text in atomMapping) {
        res = atomMapping[tree.text];
    } else {
        // console.warn(`Warning: The atom "${tree.text}" is not recognized.`);
        res = tree.text;
    }
    return in_function ? encodeTypstFunctionEscape(res) : res
}

build_functions.mathord = function (tree, in_function) {
    var tex = tree.text;
    var typ;

    if (tex in mathordMapping) {
        typ = mathordMapping[tex];
    } else {
        typ = tex;
    }

    return in_function ? encodeTypstFunctionEscape(typ) : typ
}

build_functions.textord = function (tree, in_function) {
    var tex = tree.text;
    var typ;

    if (tex in textordMapping) {
        typ = textordMapping[tex];
    } else {
        typ = tex;
    }

    return in_function ? encodeTypstFunctionEscape(typ) : typ
}

build_functions.ordgroup = function (tree, in_function) {
    return build_expression(tree.body, in_function);
}

build_functions.text = function (tree, in_function) {
    if ("font" in tree) {
        if (tree.font == "\\textrm") {
            const res = build_typst_upright_or_str(tree)
            if (res != null) {
                return res;
            }
        }
    }

    const allTextord = tree.body.every(element => element.type === 'textord');

    var mergedText;
    if (allTextord) {
        const allLiteral = tree.body.every(element => !element.text.startsWith("\\"));

        if (allLiteral) {
            // TODO: not all texord but continuous occur
            mergedText = tree.body.map(element => build_expression(element, false)).join('');

            if (mergedText.length > 1) {
                return `"${mergedText}"`;
            }
        }
        return build_typst_function("upright", build_expression(tree.body, true));
    } else {
        return tree.body.map(node => build_expression(node, in_function)).join(' ');
    }
}

build_functions.supsub = function (tree, in_function) {
    var base_typ = build_expression(tree.base, false);
    if (base_typ == undefined || base_typ.trim() === "") {
        base_typ = "zwj";
    }

    var sub_typ = "", sup_typ = "";
    var res;
    if (tree.sub) {
        sub_typ = build_expression(tree.sub, false);

        if (sub_typ.trim() != "") {
            sub_typ = ` _ ( ${sub_typ} )`;
        }
    }

    if (tree.sup) {
        // y'
        if (tree.sup.type === "ordgroup") {
            const allPrime = tree.sup.body.length != 0 && tree.sup.body.every(element => element.text === '\\prime');
            if (allPrime) {
                sup_typ = " ' ".repeat(tree.sup.body.length).trim();

                return `${base_typ}${sup_typ}${sub_typ}`;
            }
        }

        sup_typ = build_expression(tree.sup, false);

        if (sup_typ.trim() != "") {
            sup_typ = ` ^ ( ${sup_typ} )`;
        }
    }
    return `${base_typ}${sub_typ}${sup_typ}`;
}

build_functions.genfrac = function (tree, in_function) {
    var numer = build_expression(tree.numer, false);
    var denom = build_expression(tree.denom, false);
    if (tree.hasBarLine) {
        return `( ${numer} ) / ( ${denom} )`;
    }
    else {
        return `binom( ${numer} , ${denom} )`;
    }
}

build_functions.sqrt = function (tree, in_function) {
    var body = build_expression(tree.body, true);
    if (tree.index) {
        var index = build_expression(tree.index, true);
        return build_typst_function("root", [index, body]);
    }
    else {
        return build_typst_function("sqrt", body);
    }
}

build_functions.array = function (tree, in_function) {
    if (tree.type === "array" &&
        tree.from === "matrix") {
        throw Error("Using matrix as align");
        // this is because all common matrixes with delims are processed in build_functions.lr
        // things here are thost matrixes without delims, but most of them are intended to be
        // align.
        // to keep out dataset clean, we decided to not to convert thost equations
        return build_typst_mat(tree, "#none");
    } else {
        return tree.body.map(
            row => row.map(
                cell => build_expression(cell, in_function)
            ).join(" & ")
        ).join(" \\ ");
    }
}


build_functions.leftright = function (tree, in_function) {
    var left = tree.left;
    var right = tree.right;

    var left_typ = "";
    if (left in lrMapping) {
        left_typ = lrMapping[left];
    } else {
        left_typ = left;
    }

    var right_typ = "";
    if (right in lrMapping) {
        right_typ = lrMapping[right];
    } else {
        right_typ = right;
    }

    if (tree.body.length == 1 &&
        tree.body[0].type === "ordgroup" &&
        tree.body[0].body.length == 1 &&
        tree.body[0].body[0].type === "array") {
        tree.body[0] = tree.body[0].body[0];
    }

    if (tree.body.length == 1 &&
        tree.body[0].type === "array") {

        // case
        if (left === "." && right != ".") {
            return build_typst_cases(tree.body[0], `"${right_typ}"`, true);
        } else if (right === "." && left != ".") {
            return build_typst_cases(tree.body[0], `"${left_typ}"`, false);
        }

        // vec or mat
        if (tree.body[0].from != "align") {
            if (!tree.body[0].cols) {
                // \smallmatrix
                if (tree.body[0].body[0].length === 1) {
                    // vec
                    return build_typst_vec(tree.body[0], `"${left_typ}"`)
                } else {
                    // mat
                    return build_typst_mat(tree.body[0], `"${left_typ}"`);
                }
            }

            if (tree.body[0].cols && tree.body[0].cols.length === 1) {
                // vec
                return build_typst_vec(tree.body[0], `"${left_typ}"`)
            }
            // mat
            return build_typst_mat(tree.body[0], `"${left_typ}"`);
        }

        // vec
        if (tree.body[0].cols.length == 1) {
            return build_typst_vec(tree.body[0], `"${left_typ}"`)
        }
    }


    // mid
    if (left === "." && right != ".") {
        let mid = right_typ;
        var body_typ = build_expression(tree.body, true);
        return `${build_expression("mid", mid)} ${body_typ}`;

    } else if (left != "." && right === ".") {
        let mid = left_typ;
        var body_typ = build_expression(tree.body, true);
        return `${body_typ} ${build_expression("mid", mid)}`;
    }

    // auto lr
    const [is_auto_lr, res] = build_typst_autolr(left, right, tree.body);
    if (is_auto_lr) {
        return res;
    }

    // special case, lr don't trigger in_function
    var body_typ = build_expression(tree.body, false);
    return build_typst_function("lr", `${left_typ} ${body_typ} ${right_typ}`);

}

build_functions.accent = function (tree, in_function) {
    var base_typ = build_expression(tree.base, true);
    var label = tree.label;
    var accent_typ;

    var res;

    if (label in accentMapping) {
        accent_typ = accentMapping[label];
        res = build_typst_function(accent_typ, base_typ);
    } else if (label in atomMapping) {
        accent_typ = atomMapping[label];
        res = build_typst_function(accent_typ, base_typ);
    } else {
        switch (label) {
            case "\\bcancel":
                res = `cancel( inverted: #true , ${base_typ} )`;
            case "\\sout":
                res = `cancel( angle: #90deg , ${base_typ} )`;
            case "\\boxed":
                res = `#box( stroke: 0.5pt , inset: 6pt , $${base_typ}$ )`;
            case "\\overgroup":
                res = `accent( ${base_typ} , \u{0311} )`;
            case "\\overlinesegment":
                res = `accent( ${base_typ} , \u{20e9} )`;
            default:
                console.warn(`Warning: The accent "${label}" is not recognized.`);
                base_typ = build_expression(tree.base, in_function);
                res = base_typ
        }
    }

    return res;
}

build_functions.kern = function (tree, in_function) {
    var unit = tree.dimension.unit;
    var number = tree.dimension.number
    switch (unit) {
        case "em":
            switch (number) {
                case 1:
                    return "quad";
                case 2:
                    return "wide";
                default:
                    return `#v( ${number}em )`;
            }
        default:
            ;
        //console.warn(`Warning: The unit "${unit}" is not recognized.`);
    }
}

build_functions.spacing = function (tree, in_function, in_str = false) {
    // TODO: many spaces
    if (in_str) {
        return " "
    }
    if ("text" in tree) {
        if (["\\ ", " "].includes(tree.text)) {
            return "space"
        }
    }
    throw new Error("Unknown space!");
}


const operators = [
    "arccos", "arcsin", "arctan", "arg", "cos", "cosh", "cot", "coth", "csc",
    "csch", "ctg", "deg", "det", "dim", "exp", "gcd", "hom", "id", "im", "inf",
    "ker", "lg", "lim", "liminf", "limsup", "ln", "log", "max", "min", "mod",
    "Pr", "sec", "sech", "sin", "sinc", "sinh", "sup", "tan", "tanh", "tg", "tr"
];

build_functions.op = function (tree, in_function) {
    if (tree.name in opMapping) {
        return opMapping[tree.name];
    } else if ("body" in tree) {
        var limits = ("limits" in tree.body) ? tree.body.limits : false;

        if (limits = true) {
            // not auto limits
            var body = tree.body;

            if (Array.isArray(body)) {
                if (body.length == 1 && body[0].text in relMapping) {
                    limits = false;
                }
            }
        }

        if (limits) {
            return build_typst_function("limits", build_expression(tree.body, true));
        }
        return build_expression(tree.body, in_function);
    }

    console.warn(`Warning: The op "${tree}" is not recognized.`);
    return "";
}

build_functions.operatorname = function (tree, in_function) {
    const allMathord = tree.body.every(element => element.type === 'mathord');

    if (allMathord) {
        const allLiteral = tree.body.every(element => !element.text.startsWith("\\"));
        if (allLiteral) {
            const mergedText = tree.body.map(element => element.text).join('');

            if (operators.includes(mergedText)) {
                return mergedText;
            }
        }
    }
    const mergedOp = build_expression(tree.body, true);

    return build_typst_function("op", build_typst_function("upright", mergedOp));
}


build_functions.font = function (tree, in_function) {
    var font = tree.font
    var fontCommand;

    if (font in fontMapping) {
        fontCommand = fontMapping[font];
    } else if (font === "mathbf") {
        // TODO: space in mathord
        const allMathord = tree.body.type === "ordgroup" && tree.body.body.every(element => element.type === 'mathord');

        if (allMathord) {
            const allLiteral = tree.body.body.every(element => !element.text.startsWith("\\"));
            if (allLiteral) {
                const mergedText = tree.body.body.map(element => element.text).join('');
                if (mergedText.length > 1) {
                    return build_typst_function("bold", mergedText);
                }
            }
        }
        return build_typst_function("bold", build_typst_function("upright", build_expression(tree.body, true)));
    } else {
        console.warn(`Warning: The font "${font}" is not recognized.`);
        fontCommand = font;
    }

    if (fontCommand === "upright") {
        const res = build_typst_upright_or_str(tree)
        if (res != null) {
            return res;
        }
    }

    return `${fontCommand}( ${build_expression(tree.body, true)} )`;
}

const sizes = ["1.2em", "1.8em", "2.4em", "3em"];

build_functions.delimsizing = function (tree, in_function) {
    var delim_typ;
    if (tree.delim in atomMapping) {
        delim_typ = atomMapping[tree.delim];
    } else if (tree.delim in textordMapping) {
        delim_typ = textordMapping[tree.delim];
    } else {
        delim_typ = decodeLatexEscape(tree.delim);
    }

    return delim_typ;
}

build_functions.sizing = function (tree, in_function) {
    // ignore
    return build_expression(tree.body, in_function);
}

build_functions.internal = function (tree, in_function) {
    return "thin";
}

build_functions.styling = function (tree, in_function) {
    return build_expression(tree.body, in_function);
}

build_functions.overline = function (tree, in_function) {
    return build_typst_function("overline", build_expression(tree.body, true));
}

build_functions.underline = function (tree, in_function) {
    return build_typst_function("underline", build_expression(tree.body, true));
}

build_functions.xArrow = function (tree, in_function) {
    var label_typ;
    if (tree.label in xArrowMapping) {
        label_typ = xArrowMapping[tree.label];

        return `${label_typ} ^ ( ${build_expression(tree.body, false)} )`;
    }

    console.warn(`Warning: The xArrow "${tree.label}" is not recognized.`)
}

build_functions.rule = function (tree, in_function) {
    // ignore
    return;
}

build_functions.llap = function (tree, in_function) {
    // ignore
    return;
}

build_functions.rlap = function (tree, in_function) {
    // ignore
    return;
}

build_functions.phantom = function (tree, in_function) {
    // ignore
    return;
    //return build_typst_function("hide", build_expression(tree.body));
}

build_functions.mclass = function (tree, in_function) {
    // TODO: don't fucking scipts everything
    // return build_typst_function("scripts", build_expression(tree.body));
    return build_expression(tree.body, in_function);
}

build_functions.htmlmathml = function (tree, in_function) {
    if (Array.isArray(tree.mathml) && Array.isArray(tree.mathml[0].body) && "text" in tree.mathml[0].body[0]) {
        const text = tree.mathml[0].body[0].text;
        switch (text) {
            case "≠":
                return "!=";
            case "∉":
                return "in.not";
            default:
                ;
        }
    }
    return build_expression(tree.html, in_function);
}

build_functions.horizBrace = function (tree, in_function) {
    let body_typ = build_expression(tree.base, true);
    switch (tree.label) {
        case "\\underbrace":
            return build_typst_function("underbrace", body_typ);
        case "\\overbrace":
            return build_typst_function("overbrace", body_typ);
        default:
            console.warn(`Warning: The horizBrace label "${tree.label}" is not recognized.`);
            return "";
    }
}

build_functions.hbox = function (tree, in_function) {
    return build_expression(tree.body, in_function);
}

function build_typst_function(functionName, args) {
    let argsStrArray = [];

    if (!args || args.length === 0) {
        return '';
    }

    if (typeof args === 'string') {
        return `${functionName}( ${args} )`;
    }

    args.forEach(arg => {
        if (typeof arg === 'string') {
            if (arg.trim() === '') {
                argsStrArray.push('( )');
            } else {
                argsStrArray.push(arg);
            }
        } else if (Array.isArray(arg) && arg.length === 2) {
            const [key, value] = arg;
            if (value.trim() != '') {
                argsStrArray.push(`${key}: ${value}`);
            }
        }
    });

    if (argsStrArray.length === 0) {
        return '';
    }

    const argsStr = argsStrArray.join(' , ');

    return `${functionName}( ${argsStr} )`;
}


function build_typst_mat(array, delim) {
    var body_typ = "";
    var body = array.body;

    body_typ = body.map(
        row => row.map(
            cell => build_expression(cell, true)
        ).join(" , ")
    ).join(" ; ");

    if (delim && delim != "\"(\"") {
        var delim_typ = `delim: ${delim}`;
        return `mat( ${delim_typ} , ${body_typ} )`;
    }
    return `mat( ${body_typ} )`;
}

function build_typst_vec(array, delim) {
    var body_typ = "";
    var body = array.body;

    body_typ = body.map(
        row => build_expression(row[0], true)
    ).join(" , ");

    if (delim && delim != "\"(\"") {
        var delim_typ = `delim: ${delim}`;
        return `vec( ${delim_typ} , ${body_typ} )`;
    }
    return `vec( ${body_typ} )`;
}

function build_typst_cases(array, delim, rev) {
    var param = ""
    if (!(delim === `"{"` || delim === `"}"`)) {
        param += `delim: ${delim} , `;
    }
    if (rev) {
        param += `reverse: #true , `
    }

    param += array.body.map(
        row => row.map(
            cell => build_expression(cell, true)
        ).join(" & ")
    ).join(" , ");

    return `cases( ${param} )`;
}

function build_typst_autolr(left, right, body) {
    const pairs = [
        { lefts: ['(', '[', '{'], rights: [')', ']', '}'], format: (body, l, r) => `${l} ${body} ${r}`, in_function: false },
        { lefts: ['\\lbrack'], rights: ['\\rbrack'], format: (body) => `[ ${body} ]`, in_function: false },
        { lefts: ['|', '\\vert'], rights: ['|', '\\vert'], format: (body) => `abs( ${body} )`, in_function: true },
        { lefts: ['\\|', '\\Vert'], rights: ['\\|', '\\Vert'], format: (body) => `norm( ${body} )`, in_function: true },
        { lefts: ['\\lfloor'], rights: ['\\rfloor'], format: (body) => `floor( ${body} )`, in_function: true },
        { lefts: ['\\lceil'], rights: ['\\rceil'], format: (body) => `ceil( ${body} )`, in_function: true },
        { lefts: ['\\lfloor'], rights: ['\\rceil'], format: (body) => `round( ${body} )`, in_function: true },
    ];

    for (const pair of pairs) {
        if (pair.lefts.includes(left) && pair.rights.includes(right)) {
            var body_typ = build_expression(body, pair.in_function);
            return [true, pair.format(body_typ, left, right)];
        }
    }

    return [false, null];
}

function build_typst_upright_or_str(tree) {
    const ordTypes = ['mathord', 'textord', 'spacing', 'atom']

    let body = null
    let allOrd = false;

    if (tree.body.type === "ordgroup" &&
        tree.body.body.every(
            element => ordTypes.includes(element.type)
        )) {
        allOrd = true
        body = tree.body.body
    } else if (Array.isArray(tree.body) &&
        tree.body.every(
            element => ordTypes.includes(element.type)
        )) {
        allOrd = true
        body = tree.body
    }

    if (allOrd) {
        const allLiteral = body.every(element => !element.text.startsWith("\\") || element.type == "spacing");
        if (allLiteral) {
            const mergedText = body.map(element => {
                const text = element.text
                if (element.type == "spacing") {
                    return " "
                } else {
                    return text
                }
            }).join('');

            if (mergedText.length > 1) {
                return `"${mergedText}"`;
            }

            if (mergedText === "d") {
                return "dif";
            }
        }

        const mergedText = body.map(element => {
            build_expression(element)
        }).join(' ');
        return build_typst_function("upright", mergedText);
    } else if ("text" in tree.body && tree.body.text === "d") {
        return "dif";
    }
}

function isDigitOrDot(char) {
    return char === '.' || (char >= '0' && char <= '9');
}

function getMatchingBracket(openBracket) {
    const bracketPairs = {
        '(': ')',
        '[': ']',
        '{': '}'
    };
    return bracketPairs[openBracket] || '';
}

function build_array(tree, in_function) {
    let result = [];
    let buffer_number = [];

    for (let i = 0; i < tree.length; i++) {
        if (tree[i].type === 'textord' && isDigitOrDot(tree[i].text)) {
            // continus digits
            let j = i;
            while (j + 1 < tree.length &&
                tree[j + 1].type === 'textord' &&
                isDigitOrDot(tree[j + 1].text)) {
                j++;
            }

            let numbers = tree.slice(i, j + 1);
            result.push(numbers.map(number => build_expression(number, false)).join(""));
            i = j; // skip
        }
        else if (tree[i].type === 'atom' && tree[i].family === 'open') {
            // opening and closing
            if (buffer_number.length > 0) {
                result.push(buffer_number.map(number => build_expression(number, false)).join(""));
                buffer_number = [];
            }

            // find close
            let openBracket = tree[i].text;
            let closeBracket = getMatchingBracket(openBracket);
            let bracketCount = 1;
            let j;

            for (j = i + 1; j < tree.length; j++) {
                if (tree[j].type === 'atom' && tree[j].family === 'open' && tree[j].text === openBracket) {
                    bracketCount++;
                } else if (tree[j].type === 'atom' && tree[j].family === 'close' && tree[j].text === closeBracket) {
                    bracketCount--;
                    if (bracketCount === 0) break;
                }
            }

            if (bracketCount === 0) {
                // found
                let innerContent = build_array(tree.slice(i + 1, j), false);
                result.push(openBracket + " " + innerContent + " " + closeBracket);
                i = j; // skip
            } else {
                // not found
                result.push(build_expression(tree[i], in_function));
            }
        } else {
            result.push(build_expression(tree[i], in_function));
        }
    }

    return result.join(' ');
}



export function build_expression(tree, in_function) {
    if (Array.isArray(tree)) {
        return build_array(tree);
    } else if (typeof tree === 'object' && tree !== null) {
        if (tree.type in build_functions) {
            return build_functions[tree.type](tree, in_function);
        } else {
            console.warn(`Warning: The tree type "${tree.type}" is not recognized.`);
        }
    } else {
        // null
        console.warn(`Warning: null tree!`)
        return "zwj";
    }
}