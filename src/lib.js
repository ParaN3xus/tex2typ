import katex from 'katex';
import { build_expression } from './build.js';
import { newMessage } from './utils.js';

// https://github.com/harvardnlp/im2markup/blob/master/scripts/preprocessing/preprocess_latex.js
function preprocess(exp) {
    if (exp[0] == "%") {
        exp = exp.substr(1, exp.length - 1);
    }
    exp = exp.split('%')[0];

    exp = exp.split('\\~').join(' ');

    while (exp.indexOf("\\>") !== -1 || exp.indexOf("$") !== -1 || /\\label{.*?}/.test(exp)) {
        exp = exp.replace(/\\>/, " ");
        exp = exp.replace('$', ' ');
        exp = exp.replace(/\\label{.*?}/, "");
    }

    if (exp.indexOf("matrix") == -1 && exp.indexOf("cases") == -1 &&
        exp.indexOf("array") == -1 && exp.indexOf("begin") == -1) {
        while (exp.indexOf("\\\\") !== -1) {
            exp = exp.replace(/\\\\/, "\\,");
        }
    }

    while (exp.indexOf("{\\rm") !== -1 || exp.indexOf("{ \\rm") !== -1 || exp.indexOf("\\rm{") !== -1) {
        exp = exp.replace(/{\\rm/, "\\mathrm{");
        exp = exp.replace(/{ \\rm/, "\\mathrm{");
        exp = exp.replace(/\\rm{/, "\\mathrm{");
    }
    return exp;
}

export default function convert(expression) {
    var msg = newMessage()

    try {
        var tree = katex.__parse(preprocess(expression), { displayMode: true });
    } catch (e) {
        msg.err(`Failed to parse: ${e}`);
        return { "expr": "", "msg": msg.getAll() };
    }
    var typ_expression = build_expression(tree, msg);

    return {
        "expr": JSON.stringify({
            func: "equation",
            body: typ_expression
        }), "msg": msg.getAll()
    };

    /* post process
    for (var i = 0; i < 300; ++i) {
        norm_str = norm_str.replace('SSSSSS', '$');
        norm_str = norm_str.replace(' S S S S S S', '$');
    }
    console.log(norm_str.replace(/\\label { .*? }/, ""));
    */
}