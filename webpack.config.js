//@ts-check

'use strict';

const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
    target: 'node', // VS Code extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
    mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')

    entry: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
    output: {
        // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
        path: path.resolve(__dirname, 'dist'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2'
    },
    externalsPresets: { node: true },
    externalsType: 'commonjs',
    externals: [
        {
            vscode: 'commonjs vscode'
        }
    ],
    ignoreWarnings: [
        /Critical dependency: the request of a dependency is an expression/
    ],
    resolve: {
        // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
        extensions: ['.ts', '.js', '.mjs']
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            onlyCompileBundledFiles: true
                        }
                    },
                    // {
                    //     loader: 'html-loader',
                    //     options: {
                    //         /**
                    //          * @param {string | import("eta").TemplateFunction} content
                    //          * @param {{ resourcePath: any; }} loaderContext
                    //          */
                    //         preprocessor(content, loaderContext) {
                    //             return eta.render(content, {}, { filepath: loaderContext.resourcePath });
                    //         },
                    //     },
                    // }
                ]
            }
        ]
    },
    devtool: 'nosources-source-map',
    infrastructureLogging: {
        level: "log", // enables logging required for problem matchers
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                { from: 'resources', to: 'resources' }
            ]
        })
    ]
};
module.exports = [extensionConfig];
