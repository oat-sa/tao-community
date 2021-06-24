import { webpackConfig } from 'tao-k6-core';
import path from 'path';
import glob from 'glob';

const rootPath = path.resolve();
const entries = glob.sync(rootPath + '/src/tests/**/*.js');

export default webpackConfig(rootPath, entries);
