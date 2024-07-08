import katex from 'katex';
import fs from 'fs';
import path from 'path';
import { xArrowMapping, fontMapping, textordMapping, mathordMapping, accentMapping, atomMapping, opMapping } from './mapping.js';
import { decodeLatexEscape, encodeTypstEscape } from "./escape.js"
import { fileURLToPath } from 'url';

function build_atom(tree) {
    return;
}

function build_mathord(tree) {
    var tex = tree.text;
    var typ;

    if (tex in mathordMapping) {
        typ = mathordMapping[tex];
    } else {
        typ = tex;
    }

    return typ;
}

function build_textord(tree) {
    var tex = tree.text;
    var typ;

    if (tex in textordMapping) {
        typ = textordMapping[tex];
    } else {
        typ = tex;
    }

    return typ;
}

function build_ordgroup(tree) {
    return tree.body.map(node => build_expression(node)).join(' ');
}

function build_text(tree) {
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

function build_supsub(tree) {
    var typ = build_expression(tree.base);
    if (tree.sub) {
        typ = typ + ` _ ( ${build_expression(tree.sub)} )`;
    }
    if (tree.sup) {
        typ = typ + ` ^ ( ${build_expression(tree.sup)} )`;
    }
    return typ;
}

function build_genfrac(tree) {
    var numer = build_expression(tree.numer);
    var denom = build_expression(tree.denom);
    if (tree.hasBarLine) {
        return `( ${numer} ) / ( ${denom} )`;
    }
    else {
        return `binom( ${numer} , ${denom} )`;
    }
}

function build_sqrt(tree) {
    var body = build_expression(tree.body);
    if (tree.index) {
        var index = build_expression(tree.index);
        return `sqrt( ${index} , ${body} )`;
    }
    else {
        return `sqrt( ${body} )`;
    }
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

function build_array(tree) {
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

function build_leftright(tree) {
    var left = tree.left;
    var right = tree.right;

    var is_literal_left = false;
    var left_typ = "";
    if(left in atomMapping) {
        left_typ = atomMapping[left];
    } else {
        left_typ = left;
        is_literal_left = true;
    }

    var is_literal_right = false;
    var right_typ = "";
    if(right in atomMapping) {
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

function build_accent(tree) {
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

function build_kern(tree) {
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

function build_spacing(tree) {
    return "space.nobreak";
}


const operators = [
    "arccos", "arcsin", "arctan", "arg", "cos", "cosh", "cot", "coth", "csc",
    "csch", "ctg", "deg", "det", "dim", "exp", "gcd", "hom", "id", "im", "inf",
    "ker", "lg", "lim", "liminf", "limsup", "ln", "log", "max", "min", "mod",
    "Pr", "sec", "sech", "sin", "sinc", "sinh", "sup", "tan", "tanh", "tg", "tr"
];

function build_op(tree) {
    if (tree.name in opMapping) {
        return opMapping[tree.name];
    }

    console.warn(`Warning: The op "${tree.name}" is not recognized.`);
    return tree.name;
}

function build_operatorname(tree) {
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


function build_font(tree) {
    var font = tree.font
    var fontCommand;

    if (font in fontMapping) {
        fontCommand = fontMapping[font];
    } else {
        console.warn(`Warning: The font "${font}" is not recognized.`);
        fontCommand = font;
    }

    return `${fontCommand}( ${build_expression(tree.body)} )`;
}

const sizes = ["1.2em", "1.8em", "2.4em", "3em"];

function build_delimsizing(tree) {
    var delim_typ;
    if (tree.delim in atomMapping) {
        delim_typ = atomMapping[tree.delim];
    } else {
        delim_typ = encodeTypstEscape(decodeLatexEscape(tree.delim));
    }

    var size_typ = sizes[tree.size - 1];

    return `lr( size: #${size_typ} , ${delim_typ} )`;
}

function build_sizing(tree) {
    // ignore
    return build_expression(tree.body);
}

function build_styling(tree) {
    return build_expression(tree.body);
}

function build_overline(tree) {
    return `overline( ${build_expression(tree)} )`;
}

function build_underline(tree) {
    return `underline( ${build_expression(tree)} )`;
}

function build_xArrow(tree) {
    var label_typ;
    if (tree.label in xArrowMapping) {
        label_typ = xArrowMapping[tree.label];

        return `${label_typ} ^ ( ${build_expression(tree.body)} )`;
    }

    console.warn(`Warning: The xArrow "${tree.label}" is not recognized.`)
}

function build_rule(tree) {
    // ignore
    return;
}

function build_llap(tree) {
    // ignore
    return;
}

function build_rlap(tree) {
    // ignore
    return;
}

function build_phantom(tree) {
    return `hide( ${build_expression(tree.body)} )`;
}

function build_expression(tree) {
    if (Array.isArray(tree)) {
        return tree.map(build_expression).join(' ');
    } else if (typeof tree === 'object' && tree !== null) {
        switch (tree.type) {
            case 'atom':
                return build_atom(tree);
            case 'mathord':
                return build_mathord(tree);
            case 'textord':
                return build_textord(tree);
            case 'ordgroup':
                return build_ordgroup(tree);
            case 'text':
                return build_text(tree);
            case 'color':
                return;
            case 'supsub':
                return build_supsub(tree);
            case 'genfrac':
                return build_genfrac(tree);
            case 'array':
                return build_array(tree);
            case 'sqrt':
                return build_sqrt(tree);
            case 'leftright':
                return build_leftright(tree);
            case 'accent':
                return build_accent(tree);
            case 'kern':
                return build_kern(tree);
            case 'spacing':
                return build_spacing(tree);
            case 'op':
                return build_op(tree);
            case 'operatorname':
                return build_operatorname(tree);
            case 'katex':
                return;
            case 'font':
                return build_font(tree);
            case 'delimsizing':
                return build_delimsizing(tree);
            case 'styling':
                return build_styling(tree);
            case 'sizing':
                return build_sizing(tree);
            case 'overline':
                return build_overline(tree);
            case 'underline':
                return build_underline(tree);
            case 'xArrow':
                return build_xArrow(tree);
            case 'rule':
                return build_rule(tree);
            case 'llap':
                return build_llap(tree);
            case 'rlap':
                return build_rlap(tree);
            case 'phantom':
                return build_phantom(tree);
            default:
                return;
        }
    } else {
        return '';
    }
}

function convert(expression) {
    var typ_expression = "";
    var tree = katex.__parse(expression, {});

    typ_expression = build_expression(tree)

    return typ_expression;
}

function main() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const filePath = path.join(__dirname, 'test.txt');

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            return;
        }

        const latexString = data;

        console.log('formula: ', latexString);
        console.log(convert(latexString));
    });
}

main();