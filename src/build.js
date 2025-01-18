import { negationMap, xArrowMapping, fontMapping, textordMapping, mathordMapping, accentMapping, atomMapping, opMapping, relMapping, lrMapping } from './mapping.js';
import { decodeLatexEscape, encodeTypstFunctionEscape, encodeTypstEscape } from "./escape.js"
import { isDigitOrDot, getSingleBody, getMatchingBracket } from "./utils.js"

var build_functions = {}

build_functions.atom = function (tree, in_function, msg) {
    var res;
    if (tree.text in atomMapping) {
        res = atomMapping[tree.text];
    } else {
        msg.warn(`The atom "${tree.text}" is not recognized.`);
        res = tree.text;
    }
    return in_function ? encodeTypstFunctionEscape(res) : res
}

build_functions.mathord = function (tree, in_function, msg) {
    var tex = tree.text;
    var typ;

    if (tex in mathordMapping) {
        typ = mathordMapping[tex];
    } else {
        typ = tex;
    }

    return in_function ? encodeTypstFunctionEscape(typ) : typ
}

build_functions.textord = function (tree, in_function, msg) {
    var tex = tree.text;
    var typ;

    if (tex in textordMapping) {
        typ = textordMapping[tex];
    } else {
        typ = tex;
    }

    return in_function ? encodeTypstFunctionEscape(typ) : typ
}

build_functions.ordgroup = function (tree, in_function, msg) {
    return build_expression(tree.body, in_function, msg);
}

build_functions.mathchoice = function (tree, in_function, msg) {
    return "";
}

build_functions.lap = function (tree, in_function, msg) {
    return build_expression(tree.body, in_function, msg);
}

build_functions.text = function (tree, in_function, msg) {
    if ("font" in tree) {
        if (tree.font === "\\textrm") {
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
            mergedText = tree.body.map(element => build_expression(element, false, msg)).join('');

            if (mergedText.length > 1) {
                return `"${mergedText}"`;
            }
        }
        return build_typst_function("upright", build_expression(tree.body, true, msg));
    } else {
        return tree.body.map(node => build_expression(node, in_function, msg)).join(' ');
    }
}

build_functions.supsub = function (tree, in_function, msg) {
    if (tree.base && tree.base.type === "horizBrace") {
        return build_functions.horizBrace(tree.base, in_function, tree.sup ? tree.sup : tree.sub)
    }
    var base_typ = tree.base ? build_expression(tree.base, false, msg) : null;
    if (base_typ == undefined || base_typ.trim() === "") {
        base_typ = "zws";
    }

    if (base_typ === "(") {
        base_typ = "( zws"
    }

    var sub_typ = "", sup_typ = "";
    var res;
    if (tree.sub) {
        sub_typ = build_expression(tree.sub, false, msg);

        if (sub_typ.trim() != "") {
            sub_typ = ` _ ( ${sub_typ} )`;
        }
    }

    if (tree.sup) {
        // y'
        if (tree.sup.type === "ordgroup") {
            const allPrime = tree.sup.body.length != 0 && tree.sup.body.every(element => element.text === '\\prime');
            if (allPrime) {
                sup_typ = "'".repeat(tree.sup.body.length).trim();

                return `${base_typ}${sup_typ}${sub_typ}`;
            }

            // originally ^ zwj'
            if (tree.sup.body.length == 1
                && tree.sup.body[0].type === "supsub"
                && tree.sup.body[0].base == null
                && tree.sup.body[0].sup
                && tree.sup.body[0].sup.type === "ordgroup"
                && tree.sup.body[0].sup.body.length != 0
                && tree.sup.body[0].sup.body.every(element => element.text === '\\prime')) {
                sup_typ = "'".repeat(tree.sup.body[0].sup.body.length).trim();

                return `${base_typ}${sup_typ}${sub_typ}`;
            }
        }

        sup_typ = build_expression(tree.sup, false, msg);

        if (sup_typ.trim() != "") {
            sup_typ = ` ^ ( ${sup_typ} )`;
        }
    }
    return `${base_typ}${sub_typ}${sup_typ}`;
}

build_functions.genfrac = function (tree, in_function, msg) {
    var numer = build_expression(tree.numer, false, msg);
    var denom = build_expression(tree.denom, false, msg);
    if (tree.hasBarLine) {
        return `( ${numer} ) / ( ${denom} )`;
    }
    else {
        return `binom( ${numer} , ${denom} )`;
    }
}

build_functions.sqrt = function (tree, in_function, msg) {
    var body = build_expression(tree.body, true, msg);
    if (tree.index) {
        var index = build_expression(tree.index, true, msg);
        return build_typst_function("root", [index, body]);
    }
    else {
        return build_typst_function("sqrt", body);
    }
}

build_functions.array = function (tree, in_function, msg) {
    if (tree.type === "array" &&
        tree.from === "matrix") {
        msg.err("Using matrix as align.");
        // this is because all common matrixes with delims are processed in build_functions.lr
        // things here are thost matrixes without delims, but most of them are intended to be
        // align.
        // to keep out dataset clean, we decided to not to convert thost equations
        return build_typst_mat(tree, "#none", msg);
    } else {
        return tree.body.map(
            row => row.map(
                cell => build_expression(cell, in_function, msg)
            ).join(" & ")
        ).join(" \\ ");
    }
}


build_functions.leftright = function (tree, in_function, msg) {
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
            return build_typst_cases(tree.body[0], `"${right_typ}"`, true, msg);
        } else if (right === "." && left != ".") {
            return build_typst_cases(tree.body[0], `"${left_typ}"`, false, msg);
        }

        // align
        if (left === "." && right === ".") {
            return build_functions.array(tree.body[0], in_function, msg)
        }

        // vec or mat
        if (tree.body[0].from != "align") {
            if (!tree.body[0].cols) {
                // \smallmatrix
                if (tree.body[0].body[0].length === 1) {
                    // vec
                    return build_typst_vec(tree.body[0], `"${left_typ}"`, msg)
                } else {
                    // mat
                    return build_typst_mat(tree.body[0], `"${left_typ}"`, msg);
                }
            }

            if (tree.body[0].cols && tree.body[0].cols.length === 1) {
                // vec
                return build_typst_vec(tree.body[0], `"${left_typ}"`, msg)
            }
            // mat
            return build_typst_mat(tree.body[0], `"${left_typ}"`, msg);
        }

        // vec
        if (tree.body[0].cols.length == 1) {
            return build_typst_vec(tree.body[0], `"${left_typ}"`, msg)
        }
    }


    // mid
    if (left === "." && right != ".") {
        let mid = right_typ;
        var body_typ = build_expression(tree.body, true, msg);
        return `${body_typ} ${build_typst_function("mid", encodeTypstEscape(mid))} `;

    } else if (left != "." && right === ".") {
        let mid = left_typ;
        var body_typ = build_expression(tree.body, true, msg);
        return `${build_typst_function("mid", encodeTypstEscape(mid))} ${body_typ}`;
    }

    // auto lr
    const [is_auto_lr, res] = build_typst_autolr(left, right, tree.body, msg);
    if (is_auto_lr) {
        return res;
    }

    // special case, lr don't trigger in_function
    var body_typ = build_expression(tree.body, false, msg);
    return build_typst_function("lr", `${left_typ} ${body_typ} ${right_typ}`);

}

build_functions.middle = function (tree, in_function, msg) {
    return build_typst_function("mid", build_functions.delimsizing(tree, false, msg))
}

build_functions.accent = function (tree, in_function, msg) {
    var base_typ = build_expression(tree.base, true, msg);
    var label = tree.label;
    var accent_typ;

    var res;

    if (label in accentMapping) {
        accent_typ = accentMapping[label];
        res = build_typst_function(accent_typ, base_typ, msg);
    } else if (label in atomMapping) {
        accent_typ = atomMapping[label];
        res = build_typst_function(accent_typ, base_typ, msg);
    } else {
        switch (label) {
            case "\\bcancel":
                res = `cancel( inverted: #true , ${base_typ} )`;
                break;
            case "\\sout":
                res = `cancel( angle: #90deg , ${base_typ} )`;
                break;
            case "\\boxed":
                res = `#box( stroke: 0.5pt , inset: 6pt , $${base_typ}$ )`;
                break;
            case "\\overgroup":
                res = `accent( ${base_typ} , \u{0311} )`;
                break;
            case "\\overlinesegment":
                res = `accent( ${base_typ} , \u{20e9} )`;
                break;
            case "\\c":
                res = `${base_typ}\\u{0327}`;
                break;
            case "\\textcircled":
                let body = getSingleBody(tree.base)
                if (body.type === "atom") {
                    switch (body.text) {
                        case "<":
                            return "lt.circle"
                        case ">":
                            return "gt.circle"
                        case "=":
                            return "eq.circle"
                        case "+":
                            return "plus.circle"
                        default:
                            msg.warn(`The textcircled text ${body.text} is not recognized.`)
                            return ""
                    }
                }
                break;
            default:
                msg.warn(`The accent "${label}" is not recognized.`);
                base_typ = build_expression(tree.base, in_function, msg);
                res = base_typ
        }
    }

    return res;
}

build_functions.kern = function (tree, in_function, msg) {
    var unit = tree.dimension.unit;
    var number = tree.dimension.number

    // preprocess
    switch (unit) {
        case "mu":
            unit = "em";
            number = number / 18.0;
        default:
    }

    switch (unit) {
        case "em":
            switch (true) {
                case (number < 0.25):
                    return "thin";
                case (number < 0.5):
                    return "space";
                case (number < 1.5):
                    return "quad";
                case (number < 2.5):
                    return "wide";
                default:
                    return "wide";
            }
        default:
            msg.warn(`The unit "${unit}" is not recognized.`);
            return "";
    }
}

build_functions.spacing = function (tree, in_function, msg) {
    // TODO: many spaces
    if ("text" in tree) {
        if (["\\ ", " ", "\\nobreakspace", "\\nobreak", "\\allowbreak", "\\space"]
            .includes(tree.text)) {
            return "space"
        }
    }
    msg.warn(`The space ${JSON.stringify(tree)} is not recognized.`);
}


const operators = [
    "arccos", "arcsin", "arctan", "arg", "cos", "cosh", "cot", "coth", "csc",
    "csch", "ctg", "deg", "det", "dim", "exp", "gcd", "hom", "id", "im", "inf",
    "ker", "lg", "lim", "liminf", "limsup", "ln", "log", "max", "min", "mod",
    "Pr", "sec", "sech", "sin", "sinc", "sinh", "sup", "tan", "tanh", "tg", "tr"
];

build_functions.op = function (tree, in_function, msg) {
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
            return build_typst_function("limits", build_expression(tree.body, true, msg));
        }
        return build_expression(tree.body, in_function, msg);
    }

    msg.warn(`The op "${JSON.stringify(tree)}" is not recognized.`);
    return "";
}

build_functions.operatorname = function (tree, in_function, msg) {
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
    const mergedOp = build_typst_upright_or_str(tree, msg);

    return build_typst_function("op", mergedOp);
}


build_functions.font = function (tree, in_function, msg) {
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
                    return build_typst_function("bold", `"${mergedText}"`);
                }
            }
        }
        return build_typst_function("bold", build_typst_function("upright", build_expression(tree.body, true, msg)));
    }
    else {
        msg.warn(`The font "${font}" is not recognized.`);
        fontCommand = font;
    }

    if (fontCommand === "upright") {
        const res = build_typst_upright_or_str(tree, msg)
        if (res != null) {
            return res;
        }
    }

    return `${fontCommand}( ${build_expression(tree.body, true, msg)} )`;
}

const sizes = ["1.2em", "1.8em", "2.4em", "3em"];

build_functions.delimsizing = function (tree, in_function, msg) {
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

build_functions.sizing = function (tree, in_function, msg) {
    // ignore
    return build_expression(tree.body, in_function, msg);
}

build_functions.internal = function (tree, in_function, msg) {
    return "thin";
}

build_functions.styling = function (tree, in_function, msg) {
    return build_expression(tree.body, in_function, msg);
}

build_functions.overline = function (tree, in_function, msg) {
    return build_typst_function("overline", build_expression(tree.body, true, msg));
}

build_functions.underline = function (tree, in_function, msg) {
    return build_typst_function("underline", build_expression(tree.body, true, msg));
}

build_functions.xArrow = function (tree, in_function, msg) {
    var label_typ;
    if (tree.label in xArrowMapping) {
        label_typ = xArrowMapping[tree.label];

        return `${label_typ} ^ ( ${build_expression(tree.body, false, msg)} )`;
    }

    msg.warn(`The xArrow "${tree.label}" is not recognized.`)
}

build_functions.tag = function (tree, in_function, msg) {
    return build_expression(tree.body, in_function, msg);
}

build_functions.rule = function (tree, in_function, msg) {
    // ignore
    return;
}

build_functions.llap = function (tree, in_function, msg) {
    // ignore
    return;
}

build_functions.rlap = function (tree, in_function, msg) {
    // ignore
    return;
}

build_functions.phantom = function (tree, in_function, msg) {
    // ignore
    return;
    //return build_typst_function("hide", build_expression(tree.body));
}

build_functions.mclass = function (tree, in_function, msg) {
    // TODO: don't fucking scipts everything
    // return build_typst_function("scripts", build_expression(tree.body));
    return build_expression(tree.body, in_function, msg);
}

build_functions.htmlmathml = function (tree, in_function, msg) {
    const body = getSingleBody(tree.mathml)
    if (body) {
        const text = body.text;

        if (["⌟", "⌞", "⌜", "⌝"].includes(text)) {
            return text;
        }

        switch (text) {
            case "≠":
                return "!=";
            case "∉":
                return "in.not";
            case "ȷ":
                return "dotless.j";
            case "ı":
                return "dotless.i";
            case "©":
                return "copyright"
            case "®":
                return "trademark.registered"
            case "̸":
                break
            default:
                msg.warn(`The htmlmathml text ${text} is not recognized.`);
        }
    }
    return build_expression(tree.html, in_function, msg);
}

build_functions.horizBrace = function (tree, in_function, supsub = null, msg) {
    let body_typ = build_expression(tree.base, true, msg);
    let args = body_typ
    if (supsub) {
        args = [body_typ, build_expression(supsub, true, msg)]
    }
    switch (tree.label) {
        case "\\underbrace":
            return build_typst_function("underbrace", args);
        case "\\overbrace":
            return build_typst_function("overbrace", args);
        default:
            msg.warn(`The horizBrace label "${tree.label}" is not recognized.`);
            return "";
    }
}

build_functions.hbox = function (tree, in_function, msg) {
    return build_expression(tree.body, in_function, msg);
}

build_functions.vphantom = function (tree, in_function, msg) {
    return "zws";
}

build_functions.hphantom = function (tree, in_function, msg) {
    return "";
}

build_functions.pmb = function (tree, in_function, msg) {
    return build_typst_function("bold", build_expression(tree.body, true, msg));
}

build_functions.enclose = function (tree, in_function, msg) {
    return build_expression(tree.body, false, msg);
}

build_functions.smash = function (tree, in_function, msg) {
    return build_expression(tree.body, false, msg);
}

build_functions.verb = function (tree, in_function, msg) {
    return `${tree.body}`;
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


function build_typst_mat(array, delim, msg) {
    var body_typ = "";
    var body = array.body;

    body_typ = body.map(
        row => row.map(
            cell => build_expression(cell, true, msg)
        ).join(" , ")
    ).join(" ; ");

    if (delim && delim != "\"(\"") {
        var delim_typ = `delim: ${delim}`;
        return `mat( ${delim_typ} , ${body_typ} )`;
    }
    return `mat( ${body_typ} )`;
}

function build_typst_vec(array, delim, msg) {
    var body_typ = "";
    var body = array.body;

    body_typ = body.map(
        row => build_expression(row[0], true, msg)
    ).join(" , ");

    if (delim && delim != "\"(\"") {
        var delim_typ = `delim: ${delim}`;
        return `vec( ${delim_typ} , ${body_typ} )`;
    }
    return `vec( ${body_typ} )`;
}

function build_typst_cases(array, delim, rev, msg) {
    var param = ""
    if (!(delim === `"{"` || delim === `"}"`)) {
        param += `delim: ${delim} , `;
    }
    if (rev) {
        param += `reverse: #true , `
    }

    param += array.body.map(
        row => row.map(
            cell => build_expression(cell, true, msg)
        ).join(" & ")
    ).join(" , ");

    return `cases( ${param} )`;
}

function build_typst_autolr(left, right, body, msg) {
    const pairs = [
        { lefts: ['(', '[', '{'], rights: [')', ']', '}'], format: (body, l, r) => `${l} ${body} ${r}`, in_function: false },
        { lefts: ['\\lbrack'], rights: ['\\rbrack'], format: (body) => `[ ${body} ]`, in_function: false },
        { lefts: ['\\{'], rights: ['\\}'], format: (body) => `{ ${body} }`, in_function: false },
        { lefts: ['|', '\\vert', '\\lvert'], rights: ['|', '\\vert', '\\rvert'], format: (body) => `abs( ${body} )`, in_function: true },
        { lefts: ['\\|', '\\Vert'], rights: ['\\|', '\\Vert'], format: (body) => `norm( ${body} )`, in_function: true },
        { lefts: ['\\lfloor'], rights: ['\\rfloor'], format: (body) => `floor( ${body} )`, in_function: true },
        { lefts: ['\\lceil'], rights: ['\\rceil'], format: (body) => `ceil( ${body} )`, in_function: true },
        { lefts: ['\\lfloor'], rights: ['\\rceil'], format: (body) => `round( ${body} )`, in_function: true },
    ];

    for (const pair of pairs) {
        if (pair.lefts.includes(left) && pair.rights.includes(right)) {
            var body_typ = build_expression(body, pair.in_function, msg);
            return [true, pair.format(body_typ, left, right)];
        }
    }

    return [false, null];
}

function build_typst_upright_or_str(tree, msg) {
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
        const allLiteral = body.every(element => !element.text.startsWith("\\") || element.type === "spacing");
        if (allLiteral) {
            const mergedText = body.map(element => {
                const text = element.text
                if (element.type === "spacing") {
                    return " "
                } else {
                    return text
                }
            }).join('');

            if (operators.includes(mergedText)) {
                return mergedText;
            }

            if (mergedText.length > 1) {
                return `"${mergedText}"`;
            }

            if (mergedText === "d") {
                return "dif";
            }
        }

        const mergedText = body.map(element => {
            return build_expression(element, true, msg)
        }).join(' ');
        return build_typst_function("upright", mergedText);
    } else if ("text" in tree.body && tree.body.text === "d") {
        return "dif";
    }
}


function build_array(tree, in_function, msg) {
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
            result.push(numbers.map(number => build_expression(number, false, msg)).join(""));
            i = j; // skip
        }
        else if (tree[i].type === 'atom' && tree[i].family === 'open') {
            // opening and closing
            if (buffer_number.length > 0) {
                result.push(buffer_number.map(number => build_expression(number, false, msg)).join(""));
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
                let innerContent = build_array(tree.slice(i + 1, j), false, msg);
                result.push(openBracket + " " + innerContent + " " + closeBracket);
                i = j; // skip
            } else {
                // not found
                result.push(build_expression(tree[i], in_function, msg));
            }
        } else if (tree[i].type === 'htmlmathml') {
            // rlap
            if ("body" in tree[i].html[0] && tree[i].html[0].body[0].type === "lap") {
                if (tree[i].html[0].body[0].body.body[0].text === '\\@not') {
                    if (i + 1 < tree.length && tree[i + 1].type === 'atom') {
                        const negatedSymbol = negationMap[tree[i + 1].text];
                        if (negatedSymbol) {
                            result.push(negatedSymbol);
                        } else {
                            msg.warn(`The negate of ${tree[i + 1].text} is not recognized.`)
                        }

                        i++; // skip next
                        continue
                    }
                }
            }
            result.push(build_expression(tree[i], in_function, msg));
        } else {
            result.push(build_expression(tree[i], in_function, msg));
        }
    }

    return result.join(' ');
}



export function build_expression(tree, in_function, msg) {
    if (Array.isArray(tree)) {
        return build_array(tree, in_function, msg);
    } else if (typeof tree === 'object' && tree !== null) {
        if (tree.type in build_functions) {
            return build_functions[tree.type](tree, in_function, msg);
        } else {
            msg.warn(`The tree type "${tree.type}" is not recognized.`);
            return "";
        }
    } else {
        // null
        msg.warn(`Null tree!`)
        return "zws";
    }
}