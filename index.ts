import katex from 'katex';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { build_expression } from './build.js';
import { fileURLToPath } from 'url';

function preprocess(exp: string) {
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

function convert(expression: string) {
    try {
        var tree = katex.__parse(preprocess(expression), {});
    } catch (e) {
        console.warn(`Warning: Failed to parse: ${e}, skipping.`);
        return "";
    }
    var typ_expression = build_expression(tree);

    return typ_expression;
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});


async function main() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const filePath = path.join(__dirname, 'test.txt');

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            return;
        }

        const lines = data.split('\n');
        var index = 0;

        rl.on('line', () => {
            if (index < lines.length) {
                var latexString = lines[index]
                console.log(`formula [${index}]:`, latexString);
                console.log(convert(latexString));
    
                index++;
                if (index === lines.length) {
                    rl.close();
                }
            }
        });
    });
}

main();