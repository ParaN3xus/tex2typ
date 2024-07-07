const katex = require('katex');


function build_mathord(tree) {
    if ()
}

function build_expression(tree) {
    if (Array.isArray(tree)) {
        return tree.map(build_expression).join('');
    } else if (typeof tree === 'object' && tree !== null) {
        switch (tree.type) {
            case 'mathord':
                return build_mathord(tree);
            case 'textord':
                return;
            case 'ordgroup':
                return;
            case 'text':
                return;
            case 'color':
                return;
            case 'supsub':
                return;
            case 'genfrac':
                return;
            case 'array':
                return;
            case 'sqrt':
                return;
            case 'leftright':
                return;
            case 'accent':
                return;
            case 'spacing':
                return;
            case 'op':
                return;
            case 'katex':
                return;
            case 'font':
                return;
            case 'delimsizing':
                return;
            case 'styling':
                return;
            case 'sizing':
                return;
            case 'overline':
                return;
            case 'underline':
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
    const latexString = "\\mathrm{a}";

    console.log(convert(latexString));
}

main();