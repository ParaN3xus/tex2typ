import katex from 'katex';
import fs from 'fs';
import path from 'path';
import { build_expression } from './build.js';
import { fileURLToPath } from 'url';


function convert(expression) {
    var tree = katex.__parse(expression, {});

    var typ_expression = build_expression(tree)

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