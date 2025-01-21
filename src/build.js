import { functionalAccentMappint, negationMapping, xArrowMapping, fontMapping, textordMapping, mathordMapping, accentMapping, atomMapping, opMapping, relMapping, lrMapping } from './mapping.js';
import { decodeLatexEscape, encodeTypstFunctionEscape, encodeTypstEscape } from "./escape.js";
import { isDigitOrDot, getSingleBody, getMatchingBracket, insertBetween } from "./utils.js";

var build_functions = {};

build_functions.atom = function (tree, msg) {
    var res;
    if (tree.text in atomMapping) {
        res = atomMapping[tree.text];
    } else {
        msg.warn(`The atom "${tree.text}" is not recognized.`);
        res = tree.text;
    }

    return {
        func: "text",
        text: res
    };
};

build_functions.mathord = function (tree, msg) {
    var tex = tree.text;
    var res;

    if (tex in mathordMapping) {
        res = mathordMapping[tex];
    } else {
        res = tex;
    }

    return {
        func: "text",
        text: res
    };
};

build_functions.textord = function (tree, msg) {
    var tex = tree.text;
    var res;

    if (tex in textordMapping) {
        res = textordMapping[tex];
    } else {
        res = tex;
    }

    return {
        func: "text",
        text: res
    };
};

build_functions.ordgroup = function (tree, msg) {
    return build_expression(tree.body, msg)
};

build_functions.mathchoice = function (tree, msg) {
    return null;
};

build_functions.lap = function (tree, msg) {
    return build_expression(tree.body, msg);
};

build_functions.text = function (tree, msg) {
    if ("font" in tree) {
        if (tree.font === "\\textrm") {
            const res = build_typst_upright_or_str(tree);
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
            mergedText = tree.body.map(element => build_expression(element, msg)).join('');

            if (mergedText.length > 1) {
                return `"${mergedText}"`;
            }
        }
        return {
            func: "styled",
            styles: JSON.stringify([
                {
                    type: "property",
                    style: {
                        italic: false
                    },
                }
            ]),
            child: build_expression(tree.body, msg)
        };
    } else {
        return build_expression(tree.body, msg);
    }
};

build_functions.supsub = function (tree, msg) {
    if (tree.base && tree.base.type === "horizBrace") {
        return build_functions.horizBrace(tree.base, tree.sup ? tree.sup : tree.sub);
    }
    var base_typ = tree.base ? build_expression(tree.base, msg) : null;

    var sub_typ = null, sup_typ = null;
    if (tree.sub) {
        sub_typ = build_expression(tree.sub, msg);
    }

    if (tree.sup) {
        // y'
        if (tree.sup.type === "ordgroup") {
            const allPrime = tree.sup.body.length != 0 && tree.sup.body.every(element => element.text === '\\prime');
            if (allPrime) {
                sup_typ = {
                    func: "primes",
                    count: tree.sup.body.length
                };
            } else if (tree.sup.body.length == 1
                // originally ^ zwj'
                && tree.sup.body[0].type === "supsub"
                && tree.sup.body[0].base == null
                && tree.sup.body[0].sup
                && tree.sup.body[0].sup.type === "ordgroup"
                && tree.sup.body[0].sup.body.length != 0
                && tree.sup.body[0].sup.body.every(element => element.text === '\\prime')) {
                sup_typ = "'".repeat(tree.sup.body[0].sup.body.length).trim();

                sup_typ = {
                    func: "primes",
                    count: tree.sup.body.length
                };
            }

            if (sup_typ) {
                return {
                    func: "attach",
                    base: base_typ,
                    tr: sup_typ,
                    ...sub_typ && { b: sub_typ }
                };
            }
        }

        sup_typ = build_expression(tree.sup, msg);
    }
    return {
        func: "attach",
        base: base_typ,
        ...sup_typ && { t: sup_typ },
        ...sub_typ && { b: sub_typ }
    };
};

build_functions.genfrac = function (tree, msg) {
    var numer = build_expression(tree.numer, msg);
    var denom = build_expression(tree.denom, msg);
    if (tree.hasBarLine) {
        return {
            func: "frac",
            num: numer,
            denom: denom
        };
    }
    else {
        return {
            func: "binom",
            upper: numer,
            lower: denom
        };
    }
};

build_functions.sqrt = function (tree, msg) {
    var body = build_expression(tree.body, msg);
    if (tree.index) {
        var index = build_expression(tree.index, msg);
        return {
            func: "root",
            index: index,
            radicand: body
        }
    }
    else {
        return {
            func: "root",
            radicand: body
        }
    }
};


build_functions.array = function (tree, msg) {
    if (tree.type === "array" &&
        tree.from === "matrix") {
        msg.err("Using matrix as align.");
        // this is because all common matrixes with delims are processed in build_functions.lr
        // things here are thost matrixes without delims, but most of them are intended to be
        // align.
        // to keep out dataset clean, we decided to not to convert thost equations
        return build_typst_mat(tree, "#none", msg);
    } else {
        return {
            func: "sequence",
            children: insertBetween(
                tree.body.map(
                    row => insertBetween(
                        row.map(cell => build_expression(cell, msg)),
                        [{ "func": "align-point" }]
                    )
                ),
                [{ func: "linebreak" }]
            ).flat()
        };
    }
};


build_functions.leftright = function (tree, msg) {
    var left = tree.left;
    var right = tree.right;

    var left_typ = left;
    if (left in lrMapping) {
        left_typ = lrMapping[left];
    }

    var right_typ = right;
    if (right in lrMapping) {
        right_typ = lrMapping[right];
    }

    if (tree.body.length == 1 &&
        tree.body[0].type === "array") {
        // case
        if (left === "." && right != ".") {
            return build_typst_cases(tree.body[0], right_typ, msg);
        } else if (right === "." && left != ".") {
            return build_typst_cases(tree.body[0], left_typ, msg);
        }

        // align
        if (left === "." && right === ".") {
            return build_functions.array(tree.body[0], msg);
        }

        // vec or mat
        if (tree.body[0].from != "align") {
            if (!tree.body[0].cols) {
                // \smallmatrix
                if (tree.body[0].body[0].length === 1) {
                    // vec
                    return build_typst_vec(tree.body[0], left_typ, msg);
                } else {
                    // mat
                    return build_typst_mat(tree.body[0], left_typ, msg);
                }
            }

            if (tree.body[0].cols && tree.body[0].cols.length === 1) {
                // vec
                return build_typst_vec(tree.body[0], left_typ, msg);
            }
            // mat
            return build_typst_mat(tree.body[0], left_typ, msg);
        }

        // vec
        if (tree.body[0].cols.length == 1) {
            return build_typst_vec(tree.body[0], left_typ, msg);
        }
    }

    // mid
    if (left === "." && right != ".") {
        return {
            func: "sequence",
            children: [
                build_expression(tree.body, msg),
                {
                    func: "mid",
                    body: right_typ
                }
            ]
        };
    } else if (left != "." && right === ".") {
        return {
            func: "sequence",
            children: [
                {
                    func: "mid",
                    body: left_typ
                },
                build_expression(tree.body, msg),
            ]
        };
    }

    return {
        func: "lr",
        body: {
            func: "sequence",
            children: [
                {
                    func: "text",
                    text: left_typ
                },
                build_expression(tree.body, msg),
                {
                    func: "text",
                    text: right_typ
                },
            ],
        }
    }
};

build_functions.middle = function (tree, msg) {
    return {
        func: "mid",
        body: build_expression(tree.delim, msg)
    };
};

build_functions.accent = function (tree, msg) {
    var base_typ = build_expression(tree.base, msg);
    var label = tree.label;
    var accent_typ;

    var res;

    if (label in functionalAccentMappint) {
        res = functionalAccentMappint[label];
        return {
            func: res,
            body: base_typ,
        }
    }
    if (label in accentMapping) {
        accent_typ = accentMapping[label];
        return {
            func: "accent",
            base: base_typ,
            // todo: use unicode
            accent: accent_typ
        }
    } else if (label in atomMapping) {
        accent_typ = atomMapping[label];
        return {
            func: "accent",
            base: base_typ,
            // todo: use unicode
            accent: accent_typ
        }
    } else {
        if (["cancel", "not", "xcalcel"].includes(label)) {
            return {
                func: "cancel",
                body: base_typ
            }
        }
        switch (label) {
            case "\\bcancel":
                return {
                    func: "cancel",
                    inverted: true,
                    body: base_typ
                }
            case "\\sout":
                return {
                    func: "cancel",
                    angle: "90deg",
                    body: base_typ
                }
            case "\\boxed":
                return base_typ;
            case "\\overgroup":
                return {
                    func: "accent",
                    base: base_typ,
                    accent: "\u{0311}"
                }
            case "\\overlinesegment":
                return {
                    func: "accent",
                    base: base_typ,
                    accent: "\u{20e9}"
                }
            case "\\c":
                return {
                    func: "sequence",
                    children: [
                        base_typ,
                        {
                            func: "text",
                            text: "\u{20e9}"
                        }
                    ]
                }
            case "\\textcircled":
                let body = getSingleBody(tree.base);
                if (body.type === "atom") {
                    switch (body.text) {
                        case "<":
                            return {
                                func: "text",
                                text: "⧀"
                            };
                        case ">":
                            return {
                                func: "text",
                                text: "⧁"
                            };
                        case "=":
                            return {
                                func: "text",
                                text: "⊜"
                            };
                        case "+":
                            return {
                                func: "text",
                                text: "⊕"
                            };
                        default:
                            msg.warn(`The textcircled text ${body.text} is not recognized.`);
                            return null;
                    }
                }
        }
    }

    msg.warn(`The accent "${label}" is not recognized.`);
    return build_expression(tree.base, msg);
};

build_functions.kern = function (tree, msg) {
    var unit = tree.dimension.unit;
    var number = tree.dimension.number;

    // preprocess
    switch (unit) {
        case "mu":
            unit = "em";
            number = number / 18.0;
        default:
    }

    switch (unit) {
        case "em":
            return {
                func: "h",
                amount: `${number}em`
            }
        default:
            msg.warn(`The unit "${unit}" is not recognized.`);
            return null;
    }
};

build_functions.spacing = function (tree, msg) {
    // TODO: many spaces
    if ("text" in tree) {
        if (["\\ ", " ", "\\nobreakspace", "\\nobreak", "\\allowbreak", "\\space"]
            .includes(tree.text)) {
            return {
                func: "text",
                text: " "
            };
        }
    }
    msg.warn(`The space ${JSON.stringify(tree)} is not recognized.`);
    return null
};


const operators = [
    "arccos", "arcsin", "arctan", "arg", "cos", "cosh", "cot", "coth", "csc",
    "csch", "ctg", "deg", "det", "dim", "exp", "gcd", "hom", "id", "im", "inf",
    "ker", "lg", "lim", "liminf", "limsup", "ln", "log", "max", "min", "mod",
    "Pr", "sec", "sech", "sin", "sinc", "sinh", "sup", "tan", "tanh", "tg", "tr"
];

build_functions.op = function (tree, msg) {
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

        return {
            func: "op",
            ...limits && { limits: limits },
            text: build_expression(tree.body, msg)
        };
    }

    msg.warn(`The op "${JSON.stringify(tree)}" is not recognized.`);
    return null;
};

build_functions.operatorname = function (tree, msg) {
    return {
        func: "op",
        text: build_expression(tree.body, msg)
    };
};


build_functions.font = function (tree, msg) {
    var font = tree.font;
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
                    return {
                        func: "styled",
                        styles: JSON.stringify([
                            {
                                type: "property",
                                style: { bold: true },
                            },
                        ]),
                        child: {
                            func: "text",
                            text: mergedText
                        }
                    };
                }
            }
        }
        return {
            func: "styled",
            styles: JSON.stringify([
                {
                    type: "property",
                    style: { bold: true },
                },
                {
                    type: "property",
                    style: { italic: false },
                }
            ]),
            child: build_expression(tree.body, msg)
        };
    }
    else {
        msg.warn(`The font "${font}" is not recognized.`);
        fontCommand = font;
    }

    if (fontCommand === "upright") {
        const res = build_typst_upright_or_str(tree, msg);
        if (res != null) {
            return res;
        }
    }

    const fontStyleMapping = {
        upright: { italic: false },
        italic: { italic: true },
        sans: { variant: "Sans" },
        mono: { variant: "Mono" },
        bb: { variant: "Bb" },
        cal: { variant: "Cal" },
        frak: { variant: "Frak" },
        bold: { bold: true },
    }

    if (!fontCommand) {
        return build_expression(tree.body, msg);
    }


    if (fontCommand in fontStyleMapping) {
        return {
            func: "styled",
            styles: JSON.stringify([
                {
                    type: "property",
                    style: fontStyleMapping[fontCommand]
                }
            ]),
            child: build_expression(tree.body, msg)
        }
    }

    msg.warn(`The font "${font}" is not recognized.`);
    return build_expression(tree.body, msg);
};

const sizes = ["1.2em", "1.8em", "2.4em", "3em"];

build_functions.delimsizing = function (tree, msg) {
    var delim_typ;
    if (tree.delim in atomMapping) {
        delim_typ = atomMapping[tree.delim];
    } else if (tree.delim in textordMapping) {
        delim_typ = textordMapping[tree.delim];
    } else {
        delim_typ = decodeLatexEscape(tree.delim);
    }

    return {
        func: "text",
        text: delim_typ
    };
};

build_functions.sizing = function (tree, msg) {
    // ignore
    return build_expression(tree.body, msg);
};

build_functions.internal = function (tree, msg) {
    return { func: "h", amount: "0.17em" };
};

build_functions.styling = function (tree, msg) {
    return build_expression(tree.body, msg);
};

build_functions.overline = function (tree, msg) {
    return {
        func: "overline",
        body: build_expression(tree.body, msg)
    };
};

build_functions.underline = function (tree, msg) {
    return {
        func: "underline",
        body: build_expression(tree.body, msg)
    };
};

build_functions.xArrow = function (tree, msg) {
    var label_typ;
    if (tree.label in xArrowMapping) {
        label_typ = xArrowMapping[tree.label];

        return {
            func: "attach",
            base: build_expression(tree.body, msg),
            t: {
                func: "text",
                text: label_typ
            }
        }
    }

    msg.warn(`The xArrow "${tree.label}" is not recognized.`);
};

build_functions.tag = function (tree, msg) {
    return build_expression(tree.body, msg);
};

build_functions.rule = function (tree, msg) {
    // ignore
    return null;
};

build_functions.llap = function (tree, msg) {
    // ignore
    return null;
};

build_functions.rlap = function (tree, msg) {
    // ignore
    return null;
};

build_functions.phantom = function (tree, msg) {
    // ignore
    return null;
};

build_functions.mclass = function (tree, msg) {
    // TODO: don't fucking scipts everything
    return build_expression(tree.body, msg);
};

build_functions.htmlmathml = function (tree, msg) {
    const body = getSingleBody(tree.mathml);

    function textFunc(x) {
        return {
            func: "text",
            text: x
        }
    }

    if (body) {
        const text = body.text;

        if (["⌟", "⌞", "⌜", "⌝"].includes(text)) {
            return text;
        }

        switch (text) {
            case "≠":
                return textFunc("≠");
            case "∉":
                return textFunc("∉");
            case "ȷ":
                return textFunc("𝚥");
            case "ı":
                return textFunc("𝚤");
            case "©":
                return textFunc("©");
            case "®":
                return textFunc("®");
            case "̸":
                break;
            default:
                msg.warn(`The htmlmathml text ${text} is not recognized.`);
        }
    }
    return build_expression(tree.html, msg);
};

build_functions.horizBrace = function (tree, supsub = null, msg) {
    let body_typ = build_expression(tree.base, msg);
    let anno_typ = null
    if (supsub) {
        anno_typ = build_expression(supsub, msg);
    }
    switch (tree.label) {
        case "\\underbrace":
            return {
                func: "overbrace",
                body: body_typ,
                ...anno_typ && { annotation: anno_typ }
            };
        case "\\overbrace":
            return {
                func: "underbrace",
                body: body_typ,
                ...anno_typ && { annotation: anno_typ }
            };
        default:
            msg.warn(`The horizBrace label "${tree.label}" is not recognized.`);
            return null;
    }
};

build_functions.hbox = function (tree, msg) {
    return build_expression(tree.body, msg);
};

build_functions.vphantom = function (tree, msg) {
    return {
        func: "text",
        text: ""
    };
};

build_functions.hphantom = function (tree, msg) {
    return null;
};

build_functions.pmb = function (tree, msg) {
    return {
        func: "styled",
        body: build_expression(tree.body, msg),
        styles: JSON.stringify([
            {
                type: "property",
                style: {
                    italic: false
                },
            }
        ]),
    };
};

build_functions.enclose = function (tree, msg) {
    return build_expression(tree.body, msg);
};

build_functions.smash = function (tree, msg) {
    return build_expression(tree.body, msg);
};

build_functions.verb = function (tree, msg) {
    return {
        func: "text",
        text: tree.body
    };
};


function build_typst_mat(array, delim, msg) {
    var rows = array.body.map(
        row => row.map(
            cell => build_expression(cell, msg)
        )
    )

    return {
        func: "mat",
        ...delim && delim != "(" && {
            delim: [
                delim, getMatchingBracket(delim)
            ]
        },
        rows: rows
    }
}

function build_typst_vec(array, delim, msg) {
    var children = array.body.map(
        row => build_expression(row[0], msg)
    );

    return {
        func: "vec",
        ...delim && delim != "(" && {
            delim: [
                delim, getMatchingBracket(delim)
            ]
        },
        children: children
    }
}

function build_typst_cases(array, delim, rev, msg) {
    var children = array.body.map(
        row => build_expression(row, msg)
    );

    return {
        func: "cases",
        ...delim && delim != "(" && {
            delim: [
                delim, getMatchingBracket(delim)
            ]
        },
        children: children
    }
}

function build_typst_upright_or_str(tree, msg) {
    const ordTypes = ['mathord', 'textord', 'spacing', 'atom'];
    const dif = {
        func: "sequence",
        children: [
            {
                func: "h",
                amount: "0.17em",
                weak: true
            },
            {
                func: "styled",
                child: {
                    "func": "text",
                    "text": "d"
                },
                styles: JSON.stringify([
                    {
                        type: "property",
                        style: {
                            italic: false
                        },
                    }
                ]),
            }
        ]
    };

    let body = null;
    let allOrd = false;

    if (tree.body.type === "ordgroup" &&
        tree.body.body.every(
            element => ordTypes.includes(element.type)
        )) {
        allOrd = true;
        body = tree.body.body;
    } else if (Array.isArray(tree.body) &&
        tree.body.every(
            element => ordTypes.includes(element.type)
        )) {
        allOrd = true;
        body = tree.body;
    }

    if (allOrd) {
        const allLiteral = body.every(element => !element.text.startsWith("\\") || element.type === "spacing");
        if (allLiteral) {
            const mergedText = body.map(element => {
                const text = element.text;
                if (element.type === "spacing") {
                    return " ";
                } else {
                    return text;
                }
            }).join('');

            if (operators.includes(mergedText)) {
                return {
                    func: "op",
                    text: {
                        func: "text",
                        text: mergedText
                    }
                };
            }

            if (mergedText.length > 1) {
                return {
                    func: "text",
                    text: mergedText
                };
            }

            if (mergedText === "d") {
                return dif;
            }
        }

        return {
            func: "styled",
            styles: JSON.stringify([
                {
                    type: "property",
                    style: {
                        italic: false
                    },
                }
            ]),
            child: build_expression(body, msg)
        };
    } else if ("text" in tree.body && tree.body.text === "d") {
        return dif;
    }
}


function build_array(tree, msg) {
    let result = [];

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
            result.push({
                func: "text",
                text: numbers.map(number => number.text).join("")
            });
            i = j; // skip
        }
        else if (tree[i].type === 'atom' && tree[i].family === 'open') {
            // opening and closing

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
                let innerContent = build_array(tree.slice(i + 1, j), msg);
                result.push({
                    func: "lr",
                    body: {
                        func: "sequence",
                        children: [
                            {
                                func: "text",
                                text: openBracket
                            },
                            innerContent,
                            {
                                func: "text",
                                text: closeBracket
                            }
                        ]
                    }
                });
                i = j; // skip
            } else {
                // not found
                var r = build_expression(tree[i], msg);
                if (r) {
                    result.push(r);
                }
            }
        } else if (tree[i].type === 'htmlmathml') {
            // rlap
            if ("body" in tree[i].html[0] && tree[i].html[0].body[0].type === "lap") {
                if (tree[i].html[0].body[0].body.body[0].text === '\\@not') {
                    if (i + 1 < tree.length && tree[i + 1].type === 'atom') {
                        const negatedSymbol = negationMapping[tree[i + 1].text];
                        if (negatedSymbol) {
                            result.push({
                                func: "text",
                                text: negatedSymbol
                            });
                        } else {
                            msg.warn(`The negate of ${tree[i + 1].text} is not recognized.`);
                        }

                        i++; // skip next
                        continue;
                    }
                }
            }
            var r = build_expression(tree[i], msg)
            if (r) {
                result.push(r);
            }
        } else {
            var r = build_expression(tree[i], msg)
            if (r) {
                result.push(r);
            }
        }
    }

    return {
        func: "sequence",
        children: result,
    };
}



export function build_expression(tree, msg) {
    if (Array.isArray(tree)) {
        if (tree.length === 1) {
            return build_expression(tree[0], msg);
        }
        return build_array(tree, msg);
    } else if (typeof tree === 'string') {
        return {
            func: "text",
            text: tree
        }
    }
    else if (typeof tree === 'object' && tree !== null) {
        if (tree.type in build_functions) {
            return build_functions[tree.type](tree, msg);
        } else {
            msg.warn(`The tree type "${tree.type}" is not recognized.`);
            return null;
        }
    } else {
        // null
        msg.warn(`Null tree!`);
        return null;
    }
}