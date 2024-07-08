import { xArrowMapping, fontMapping, textordMapping, mathordMapping, accentMapping, atomMapping, opMapping } from './mapping.js';
import { decodeLatexEscape, encodeTypstEscape } from "./escape.js"

var build_functions = {}

build_functions.atom = function (tree) {
    if (tree.text in atomMapping) {
        return atomMapping[tree.text];
    } else {
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
    return tree.body.map(node => build_expression(node)).join(' ');
}

build_functions.text = function (tree) {
    const allTextord = tree.body.every(element => element.type === 'textord');

    var mergedText;
    if (allTextord) {
        mergedText = tree.body.map(element => element.text).join('');

        if (mergedText.length == 1) {
            return `upright( ${mergedText} )`;
        } else {
            return `"${mergedText}"`;
        }
    } else {
        return tree.body.map(node => build_expression(node)).join(' ');
    }
}

build_functions.supsub = function (tree) {
    var typ = build_expression(tree.base);
    if (tree.sub) {
        typ = typ + ` _ ( ${build_expression(tree.sub)} )`;
    }
    if (tree.sup) {
        typ = typ + ` ^ ( ${build_expression(tree.sup)} )`;
    }
    return typ;
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
        return `sqrt( ${index} , ${body} )`;
    }
    else {
        return `sqrt( ${body} )`;
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
    var left = tree.left;
    var right = tree.right;

    var is_literal_left = false;
    var left_typ = "";
    if (left in atomMapping) {
        left_typ = atomMapping[left];
    } else {
        left_typ = left;
        is_literal_left = true;
    }

    var is_literal_right = false;
    var right_typ = "";
    if (right in atomMapping) {
        right_typ = atomMapping[right];
    } else {
        right_typ = right;
        is_literal_right = true;
    }

    if (tree.body.length == 1 &&
        tree.body[0].type === "array" &&
        tree.body[0].from === "matrix") {
        return build_typst_mat(tree.body[0], is_literal_left ? `"${left_typ}"` : left_typ)
    }

    var body_typ = build_expression(tree.body)

    // auto lr
    if ((left === '(' && right === ')') ||
        (left === '[' && right === ']') ||
        (left === '{' && right === '}')) {
        return `${left} ${body_typ} ${right}`;
    } else if (left === '|' && right === '|') {
        return `abs( ${body_typ} )`;
    } else if (left === '\\|' && right === '\\|') {
        return `norm( ${body_typ} )`;
    } else if (left === '\\lfloor' && right === '\\rfloor') {
        return `floor( ${body_typ} )`;
    } else if (left === '\\lceil' && right === '\\rceil') {
        return `ceil( ${body_typ} )`;
    } else if (left === '\\lfloor' && right === '\\rceil') {
        return `round( ${body_typ} )`;
    }
    else {
        return `lr( ${left_typ} ${body_typ} ${right_typ} )`
    }
}

build_functions.accent = function (tree) {
    var base_typ = build_expression(tree.base);
    var label = tree.label;
    var accent_typ;

    var res;

    if (label in accentMapping) {
        accent_typ = accentMapping[label];
        res = `${accent_typ}( ${base_typ} )`;
    } else if (label in atomMapping) {
        accent_typ = atomMapping[label];
        res = `${accent_typ}( ${base_typ} )`;
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
            console.warn(`Warning: The unit "${unit}" is not recognized.`);
    }
}

build_functions.spacing = function (tree) {
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
    }

    console.warn(`Warning: The op "${tree.name}" is not recognized.`);
    return tree.name;
}

build_functions.operatorname = function (tree) {
    const allMathord = tree.body.every(element => element.type === 'mathord');
    const allLiteral = tree.body.every(element => !element.text.startsWith("\\"));

    if (allMathord) {
        if (allLiteral) {
            const mergedText = tree.body.map(element => element.text).join('');

            if (operators.includes(mergedText)) {
                return mergedText;
            }
        }
    }
    const mergedOp = tree.body.map(element => build_expression(element)).join(' ');

    return `op( upright( ${mergedOp} ) )`;
}


build_functions.font = function (tree) {
    var font = tree.font
    var fontCommand;

    if (font in fontMapping) {
        fontCommand = fontMapping[font];
    } else {
        console.warn(`Warning: The font "${font}" is not recognized.`);
        fontCommand = font;
    }

    if(fontCommand === "upright" && tree.body.text === "d") {
        return "dif";
    }

    return `${fontCommand}( ${build_expression(tree.body)} )`;
}

const sizes = ["1.2em", "1.8em", "2.4em", "3em"];

build_functions.delimsizing = function (tree) {
    var delim_typ;
    if (tree.delim in atomMapping) {
        delim_typ = atomMapping[tree.delim];
    } else {
        delim_typ = encodeTypstEscape(decodeLatexEscape(tree.delim));
    }

    var size_typ = sizes[tree.size - 1];

    return `lr( size: #${size_typ} , ${delim_typ} )`;
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
    return `overline( ${build_expression(tree)} )`;
}

build_functions.underline = function (tree) {
    return `underline( ${build_expression(tree)} )`;
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
    return `hide( ${build_expression(tree.body)} )`;
}

function build_typst_mat(array, delim) {
    var body_typ = "";
    var body = array.body;

    body.map(
        row => row.map(
            cell => build_expression(cell)
        ).join(" , ")
    ).join(" ; ");

    if (delim) {
        var delim_typ = `delim: ${delim}`;
        return `mat( ${delim_typ} , ${body_typ} )`;
    }
    return `mat( ${body_typ} )`;
}

export function build_expression(tree) {
    if (Array.isArray(tree)) {
        return tree.map(build_expression).join(' ');
    } else if (typeof tree === 'object' && tree !== null) {
        if (tree.type in build_functions) {
            return build_functions[tree.type](tree);
        } else {
            console.warn(`Warning: The tree type "${tree.type}" is not recognized.`);
        }
    } else {
        log.warn("Warning: unknown tree!")
        return "";
    }
}