import katex from 'katex';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { build_expression } from './build.js';
import { fileURLToPath } from 'url';

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

function convert(expression) {
    try {
        var tree = katex.__parse(preprocess(expression), {});
    } catch (e) {
        console.warn(`Warning: Failed to parse: ${e}, skipping.`);
        return "";
    }
    var typ_expression = build_expression(tree);

    return typ_expression;


    /* post process
    for (var i = 0; i < 300; ++i) {
        norm_str = norm_str.replace('SSSSSS', '$');
        norm_str = norm_str.replace(' S S S S S S', '$');
    }
    console.log(norm_str.replace(/\\label { .*? }/, ""));
    */
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});


async function process_lst() {
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


async function process_csv(csv_name) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const csvName = csv_name;
    const inputFilePath = path.join(__dirname, `${csvName}.csv`);
    const outputFilePath = path.join(__dirname, `${csvName}_typ.csv`);
    const failedFilePath = path.join(__dirname, 'failed.txt');
    const failedLines = [];
    const outputData = [];


    const parser = fs.createReadStream(inputFilePath)
        .pipe(parse({ columns: true, skip_empty_lines: true }));

    for await (const row of parser) {
        const name = row.image_filename;
        let formula = row.latex;

        try {
            formula = convert(formula);
            outputData.push({ name, formula });
        } catch (err) {
            console.error(`Failed to process formula for ${name}:`, err);
            failedLines.push(formula);
        }
    }

    const csvWriter = fs.createWriteStream(outputFilePath);
    const stringifier = stringify({ header: true, columns: ['name', 'formula'] });
    stringifier.pipe(csvWriter);
    outputData.forEach((row) => {
        stringifier.write([row.name, row.formula]);
    });
    stringifier.end();

    console.log("done")

    if (failedLines.length > 0) {
        fs.writeFile(failedFilePath, failedLines.join('\n'), 'utf8', (writeErr) => {
            if (writeErr) {
                console.error('Error writing failed lines to file:', writeErr);
            } else {
                console.log('Successfully wrote failed lines to file:', failedFilePath);
            }
        });
    }
}

async function main() {
    const args = process.argv.slice(2);
    const functionName = args[0];

    if (functionName === 'lst') {
        process_lst();
    } else if (functionName === 'csv') {
        const fileName = args[1];
        if (!fileName) {
            console.log("Please provide a file name for process_csv");
        } else {
            process_csv(fileName);
        }
    } else {
        console.log(`Function ${functionName} not found`);
    }
    process.exit(0)
}

main();