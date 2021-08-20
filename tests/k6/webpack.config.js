import { webpackConfig } from 'oat-k6-core';
import path from 'path';
import glob from 'glob';

const rootPath = path.resolve();
const entries = glob.sync(rootPath + '/src/tests/**/*.js');
let config = webpackConfig(rootPath, entries);

/*
// Uncomment for debug
config.optimization = {
   minimize: false
}
*/

export default config;
