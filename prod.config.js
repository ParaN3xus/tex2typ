export default {
    entry: './src/lib.js',
    output: {
        filename: "tex2typ.js",
        library: 'tex2typ',
        libraryTarget: 'umd'
    },
    mode: "development"
};