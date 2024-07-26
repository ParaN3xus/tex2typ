import { xArrowMapping, fontMapping, textordMapping, mathordMapping, accentMapping, atomMapping, opMapping, relMapping, lrMapping } from './mapping.js';
import { decodeLatexEscape, encodeTypstFunctionEscape } from "./escape.js"

var build_functions = {}

build_functions.atom = function (tree) {
    if (tree.text in atomMapping) {
        return atomMapping[tree.text];
    } else {
        // console.warn(`Warning: The atom "${tree.text}" is not recognized.`);
        return tree.text;
    }
}

build_functions.mathord = function (tree) {
    var tex = tree.text;
    var typ;

    if (tex in mathordMapping) {
        typ = mathordMapping[tex];
    } else {
        typ = tex;
    }

    return typ;
}

build_functions.textord = function (tree) {
    var tex = tree.text;
    var typ;

    if (tex in textordMapping) {
        typ = textordMapping[tex];
    } else {
        typ = tex;
    }

    return typ;
}

build_functions.ordgroup = function (tree) {
    return build_expression(tree.body);
}

build_functions.text = function (tree) {
    const allTextord = tree.body.every(element => element.type === 'textord');

    var mergedText;
    if (allTextord) {
        const allLiteral = tree.body.every(element => !element.text.startsWith("\\"));

        if (allLiteral) {
            // TODO: not all texord but continuous occur
            mergedText = tree.body.map(element => build_expression(element)).join('');

            if (mergedText.length > 1) {
                return `"${mergedText}"`;
            }
        }
        return build_typst_function("upright", build_expression(tree.body));
    } else {
        return tree.body.map(node => build_expression(node)).join(' ');
    }
}

build_functions.supsub = function (tree) {
    var base_typ = build_expression(tree.base);
    if (base_typ == undefined || base_typ.trim() === "") {
        base_typ = "zwj";
    }

    var sub_typ = "", sup_typ = "";
    var res;
    if (tree.sub) {
        sub_typ = build_expression(tree.sub);

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

        sup_typ = build_expression(tree.sup);

        if (sup_typ.trim() != "") {
            sup_typ = ` ^ ( ${sup_typ} )`;
        }
    }
    return `${base_typ}${sub_typ}${sup_typ}`;
}

build_functions.genfrac = function (tree) {
    var numer = build_expression(tree.numer);
    var denom = build_expression(tree.denom);
    if (tree.hasBarLine) {
        return `( ${numer} ) / ( ${denom} )`;
    }
    else {
        return `binom( ${numer} , ${denom} )`;
    }
}

build_functions.sqrt = function (tree) {
    var body = build_expression(tree.body);
    if (tree.index) {
        var index = build_expression(tree.index);
        return build_typst_function("sqrt", [index, body]);
    }
    else {
        return build_typst_function("sqrt", body);
    }
}

build_functions.array = function (tree) {
    if (tree.type === "array" &&
        tree.from === "matrix") {
        return build_typst_mat(tree.body, undefined)
    } else {
        return tree.body.map(
            row => row.map(
                cell => build_expression(cell)
            ).join(" & ")
        ).join(" \\ ");
    }
}


build_functions.leftright = function (tree) {
    const cases = [
        "{", "}", "[", "]", "(", ")"
    ];

    var left = tree.left;
    var right = tree.right;

    var is_literal_left = false;
    var left_typ = "";
    if (left in lrMapping) {
        left_typ = lrMapping[left];
    } else {
        left_typ = left;
    }
    if (cases.includes(left_typ)) {
        is_literal_left = true;
    }

    var is_literal_right = false;
    var right_typ = "";
    if (right in lrMapping) {
        right_typ = lrMapping[right];
    } else {
        right_typ = right;
    }
    if (cases.includes(right_typ)) {
        is_literal_right = true;
    }

    if (tree.body.length == 1 &&
        tree.body[0].type === "array") {

        // case
        if (left === "." && right != ".") {
            return build_typst_case(tree.body[0], is_literal_right ? `"${right_typ}"` : right_typ, true);
        } else if (right === "." && left != ".") {
            return build_typst_case(tree.body[0], is_literal_left ? `"${left_typ}"` : right_typ, false);
        }

        // vec or mat
        if (tree.body[0].from != "align") {
            if (tree.body[0].cols.length == 1) {
                // vec
                return build_typst_vec(tree.body[0], is_literal_left ? `"${left_typ}"` : left_typ)
            }
            // mat
            return build_typst_mat(tree.body[0], is_literal_left ? `"${left_typ}"` : left_typ);
        }

        // vec
        if (tree.body[0].cols.length == 1) {
            return build_typst_vec(tree.body[0], is_literal_left ? `"${left_typ}"` : left_typ)
        }
    }

    var body_typ = build_expression(tree.body)

    // mid
    if (left === "." && right != ".") {
        let mid = right_typ;
        return `${build_expression("mid", mid)} ${body_typ}`;

    } else if (left != "." && right === ".") {
        let mid = left_typ;
        return `${body_typ} ${build_expression("mid", mid)}`;
    }

    // auto lr
    const [is_auto_lr, res] = build_typst_autolr(left, right, body_typ);
    if (is_auto_lr) {
        return res;
    }

    return build_typst_function("lr", `${left_typ} ${body_typ} ${right_typ}`);

}

build_functions.accent = function (tree) {
    var base_typ = build_expression(tree.base);
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
                res = base_typ
        }
    }

    return res;
}

build_functions.kern = function (tree) {
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

build_functions.spacing = function (tree) {
    // TODO: many spaces
    return "";
    //return "space.nobreak";
}


const operators = [
    "arccos", "arcsin", "arctan", "arg", "cos", "cosh", "cot", "coth", "csc",
    "csch", "ctg", "deg", "det", "dim", "exp", "gcd", "hom", "id", "im", "inf",
    "ker", "lg", "lim", "liminf", "limsup", "ln", "log", "max", "min", "mod",
    "Pr", "sec", "sech", "sin", "sinc", "sinh", "sup", "tan", "tanh", "tg", "tr"
];

build_functions.op = function (tree) {
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
            return build_typst_function("limits", build_expression(tree.body));
        }
        return build_expression(tree.body);
    }

    console.warn(`Warning: The op "${tree}" is not recognized.`);
    return "";
}

build_functions.operatorname = function (tree) {
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
    const mergedOp = build_expression(tree.body);

    return build_typst_function("op", build_typst_function("upright", mergedOp));
}


build_functions.font = function (tree) {
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
        return build_typst_function("bold", build_typst_function("upright", build_expression(tree.body)));
    } else {
        console.warn(`Warning: The font "${font}" is not recognized.`);
        fontCommand = font;
    }

    if (fontCommand === "upright") {
        const allMathord = tree.body.type === "ordgroup" && tree.body.body.every(element => element.type === 'mathord');

        if (allMathord) {
            const allLiteral = tree.body.body.every(element => !element.text.startsWith("\\"));
            if (allLiteral) {
                const mergedText = tree.body.body.map(element => element.text).join('');
                if (mergedText.length > 1) {
                    return `"${mergedText}"`;
                }

                if (mergedText === "d") {
                    return "dif";
                }
            }

            return build_typst_function("upright", mergedText);
        } else if (tree.body.text === "d") {
            return "dif";
        }
    }

    return `${fontCommand}( ${build_expression(tree.body)} )`;
}

const sizes = ["1.2em", "1.8em", "2.4em", "3em"];

build_functions.delimsizing = function (tree) {
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

build_functions.sizing = function (tree) {
    // ignore
    return build_expression(tree.body);
}

build_functions.internal = function (tree) {
    return "thin";
}

build_functions.styling = function (tree) {
    return build_expression(tree.body);
}

build_functions.overline = function (tree) {
    return build_typst_function("overline", build_expression(tree.body));
}

build_functions.underline = function (tree) {
    return build_typst_function("underline", build_expression(tree.body));
}

build_functions.xArrow = function (tree) {
    var label_typ;
    if (tree.label in xArrowMapping) {
        label_typ = xArrowMapping[tree.label];

        return `${label_typ} ^ ( ${build_expression(tree.body)} )`;
    }

    console.warn(`Warning: The xArrow "${tree.label}" is not recognized.`)
}

build_functions.rule = function (tree) {
    // ignore
    return;
}

build_functions.llap = function (tree) {
    // ignore
    return;
}

build_functions.rlap = function (tree) {
    // ignore
    return;
}

build_functions.phantom = function (tree) {
    // ignore
    return;
    //return build_typst_function("hide", build_expression(tree.body));
}

build_functions.mclass = function (tree) {
    // TODO: don't fucking scipts everything
    // return build_typst_function("scripts", build_expression(tree.body));
    return build_expression(tree.body);
}

build_functions.htmlmathml = function (tree) {
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
    return build_expression(tree.html);
}

build_functions.horizBrace = function (tree) {
    let body_typ = build_expression(tree.base);
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

build_functions.hbox = function (tree) {
    return build_expression(tree.body);
}

function build_typst_function(functionName, args) {
    let argsStrArray = [];

    if (!args || args.length === 0) {
        return '';
    }

    if (typeof args === 'string') {
        return `${functionName}( ${encodeTypstFunctionEscape(args)} )`;
    }

    args.forEach(arg => {
        if (typeof arg === 'string') {
            if (arg.trim() === '') {
                argsStrArray.push('( )');
            } else {
                argsStrArray.push(encodeTypstFunctionEscape(arg));
            }
        } else if (Array.isArray(arg) && arg.length === 2) {
            const [key, value] = arg;
            if (value.trim() != '') {
                argsStrArray.push(`${key}: ${encodeTypstFunctionEscape(value)}`);
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
            cell => build_expression(cell)
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
        row => build_expression(row[0])
    ).join(" , ");

    if (delim && delim != "\"(\"") {
        var delim_typ = `delim: ${delim}`;
        return `vec( ${delim_typ} , ${body_typ} )`;
    }
    return `vec( ${body_typ} )`;
}

function build_typst_case(array, delim, rev) {
    var param = ""
    if (!(delim === "{" || delim === "}")) {
        param += `delim: ${delim} , `;
    }
    if (rev) {
        param += `reverse: #true , `
    }

    param += array.body.map(
        row => row.map(
            cell => encodeTypstFunctionEscape(build_expression(cell))
        ).join(" & ")
    ).join(" , ");

    return `cases( ${param} )`;
}

function build_typst_autolr(left, right, body_typ) {
    const pairs = [
        { lefts: ['(', '[', '{'], rights: [')', ']', '}'], format: (body, l, r) => `${l} ${body} ${r}` },
        { lefts: ['\\lbrack'], rights: ['\\rbrack'], format: (body) => `[ ${body} ]` },
        { lefts: ['|', '\\vert'], rights: ['|', '\\vert'], format: (body) => `abs( ${body} )` },
        { lefts: ['\\|', '\\Vert'], rights: ['\\|', '\\Vert'], format: (body) => `norm( ${body} )` },
        { lefts: ['\\lfloor'], rights: ['\\rfloor'], format: (body) => `floor( ${body} )` },
        { lefts: ['\\lceil'], rights: ['\\rceil'], format: (body) => `ceil( ${body} )` },
        { lefts: ['\\lfloor'], rights: ['\\rceil'], format: (body) => `round( ${body} )` },
    ];

    for (const pair of pairs) {
        if (pair.lefts.includes(left) && pair.rights.includes(right)) {
            return [true, pair.format(body_typ, left, right)];
        }
    }

    return [false, null];
}

function isDigitOrDot(char) {
    return char === '.' || (char >= '0' && char <= '9');
}

export function build_expression(tree) {
    if (Array.isArray(tree)) {
        let result = [];
        let buffer_number = [];

        for (let i = 0; i < tree.length; i++) {
            if (tree[i].type === 'textord' && (isDigitOrDot(tree[i].text))) {
                buffer_number.push(tree[i]);
            } else {
                if (buffer_number.length > 0) {
                    result.push(buffer_number.map(build_expression).join(""));
                    buffer_number = [];
                }
                result.push(build_expression(tree[i]));
            }
        }

        if (buffer_number.length > 0) {
            result.push(buffer_number.map(build_expression).join(""));
        }

        return result.join(' ');
    } else if (typeof tree === 'object' && tree !== null) {
        if (tree.type in build_functions) {
            return build_functions[tree.type](tree);
        } else {
            console.warn(`Warning: The tree type "${tree.type}" is not recognized.`);
        }
    } else {
        // null
        console.warn(`Warning: null tree!`)
        return "zwj";
    }
}