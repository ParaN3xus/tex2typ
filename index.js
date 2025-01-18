import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';
import convert from "./src/lib.js"

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});


async function process_lst(filename) {
    const workspace = process.cwd();
    const filePath = path.resolve(workspace, filename);
    const baseFilename = path.basename(filename);
    const failedFilePath = path.join(workspace, 'failed.txt');
    const failedLines = [];

    try {
        const data = await fs.promises.readFile(filePath, 'utf8');
        const lines = data.split('\n');

        if (filename === 'test.txt') {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            for (let index = 0; index < lines.length; index++) {
                const latexString = lines[index];
                console.log(`formula [${index}]:`, latexString);
                console.log(convert(latexString).expr);
                await new Promise(resolve => rl.once('line', resolve));
            }
            rl.close();
        } else {
            const convertedFilePath = path.join(path.dirname(filePath), `converted_${baseFilename}`);
            const writeStream = fs.createWriteStream(convertedFilePath, { flags: 'w' });

            for (let index = 0; index < lines.length; index++) {
                try {
                    writeStream.write(`${convert(lines[index]).expr}\n`);
                } catch (convertErr) {
                    console.log(`Error converting formula [${index}]: ${convertErr}\n`);
                    failedLines.push(lines[index]);
                }
            }
            writeStream.end();
        }

        console.log(failedLines.length)
        if (failedLines.length > 0) {
            await fs.promises.writeFile(failedFilePath, failedLines.join('\n'), 'utf8');
            console.log('Successfully wrote failed lines to file:', failedFilePath);
        }
    } catch (err) {
        console.error('Error processing file:', err);
    }
}


async function process_csv(csv_name) {
    const workspace = process.cwd();
    const csvName = csv_name;
    const inputFilePath = path.join(workspace, csvName);

    const outputFilePath = path.join(path.dirname(inputFilePath), `typ_${path.basename(inputFilePath)}`);

    const failedFilePath = path.join(workspace, 'failed.txt');
    const failedLines = [];
    const outputData = [];

    console.log(`Processing CSV file: ${inputFilePath}`);

    const parser = fs.createReadStream(inputFilePath)
        .pipe(parse({ columns: true, skip_empty_lines: true }));

    for await (const row of parser) {
        const name = row.image_filename;
        let formula = row.latex;

        try {
            formula = convert(formula).expr;
            outputData.push({ name, formula });
        } catch (err) {
            console.error(`Failed to process formula for ${name}:`, err);
            failedLines.push(formula);
        }
    }

    console.log(`Finished processing CSV file. Writing to output file: ${outputFilePath}`);

    const csvWriter = fs.createWriteStream(outputFilePath);
    const stringifier = stringify({ header: true, columns: ['name', 'formula'] });

    stringifier.pipe(csvWriter);
    outputData.forEach((row) => {
        stringifier.write(row);
    });
    stringifier.end();

    await new Promise((resolve) => {
        csvWriter.on('finish', resolve);
    });

    console.log("CSV writing done");

    if (failedLines.length > 0) {
        await fs.promises.writeFile(failedFilePath, failedLines.join('\n'), 'utf8');
        console.log('Successfully wrote failed lines to file:', failedFilePath);
    }
}


async function main() {
    const args = process.argv.slice(2);
    const functionName = args[0];

    if (functionName === 'lst') {
        const fileName = args[1];
        if (!fileName) {
            await process_lst("test.txt");
        } else {
            await process_lst(fileName);
        }
    } else if (functionName === 'csv') {
        const fileName = args[1];
        if (!fileName) {
            console.log("Please provide a file name for process_csv");
        } else {
            await process_csv(fileName);
        }
    } else {
        console.log(`Function ${functionName} not found`);
    }
}

main();