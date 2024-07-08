import katex from 'katex';
import fs from 'fs';
import path from 'path';
import { fontMapping, textordMapping, mathordMapping } from './mapping.js';
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
    if(tree.hasBarLine) {
        return `( ${numer} ) / ( ${denom} )`;
    }
    else {
        return `binom( ${numer} , ${denom} )`;
    }
}

function build_sqrt(tree) {
    var body = build_expression(tree.body);
    if(tree.index) {
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

    for (const [rindex, row] of body.entries()) {
        for (var [gindex, grid] of row.entries()) {
            body_typ += build_expression(grid);
            if (gindex != row.length - 1) {
                body_typ += " , ";
            }
        }
        if(rindex != body.length - 1) {
            body_typ += " ; ";
        }
    }

    if(delim) {
        var delim_typ = `delim: ${delim}`;
        return `mat( ${delim_typ} , ${body_typ} )`;
    }
    return `mat ( ${body_typ} )`;
}

function build_array(tree) {
    if (tree.type === "array" &&
        tree.from === "matrix") {
        return build_typst_mat(tree.body, undefined)
    } else {
        // TODO: common align
        return;
    }
}

function build_leftright(tree) {
    var left = tree.left;
    var right = tree.right;

    var left_typ = `"${left}"`;

    if (tree.body.length == 1 &&
        tree.body[0].type === "array" &&
        tree.body[0].from === "matrix") {
        return build_typst_mat(tree.body[0], left_typ)
    }

    // auto lr
    if ((left === '(' && right === ')') ||
        (left === '[' && right === ']') ||
        (left === '{' && right === '}')) {
        return `${left} ${build_expression(tree.body)} ${right}`;
    } else if (left === '|' && right === '|') {
        return `abs( ${build_expression(tree.body)} )`;
    } else if (left === '\\|' && right === '\\|') {
        return `norm( ${build_expression(tree.body)} )`;
    } else if (left === '\\lfloor' && right === '\\rfloor') {
        return `floor( ${build_expression(tree.body)} )`;
    } else if (left === '\\lceil' && right === '\\rceil') {
        return `ceil( ${build_expression(tree.body)} )`;
    } else if (left === '\\lfloor' && right === '\\rceil') {
        return `round( ${build_expression(tree.body)} )`;
    }
    else {
        // TODO: map lr(open and close) to typst
        return `lr(  )`
    }
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

function build_styling(tree) {
    return build_expression(tree.body);
}

function build_expression(tree) {
    if (Array.isArray(tree)) {
        return tree.map(build_expression).join('');
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
                return;
            case 'spacing':
                return;
            case 'op':
                return;
            case 'katex':
                return;
            case 'font':
                return build_font(tree);
            case 'delimsizing':
                return;
            case 'styling':
                return build_styling(tree);
            case 'sizing':
                return;
            case 'overline':
                return;
            case 'underline':
                return;
            case 'xArrow':
                return;
            case 'rule':
                return;
            case 'llap':
                return;
            case 'rlap':
                return;
            case 'phantom':
                return;
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