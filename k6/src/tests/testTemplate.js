/**
 *
 * This is a template file, please replace with your implementation.
 *
 */
import { checkMyApiGetRequest } from '../modules/apiRequest.js';
import { configLoader } from 'tao-k6-core';
import { group, sleep } from 'k6';
import { Counter } from 'k6/metrics';

export const requests = new Counter('http_reqs');

let config = configLoader.loadEnvironmentConfig();
// eslint-disable-next-line no-undef
config.custom = configLoader.loadFileConfig(__ENV.CUSTOM_FILE);

export function setup() {
    return {
        config: config
    };
}

export const options = {
    stages: config.options.stages,
    thresholds: config.options.thresholds
};

export default function (setupData) {
    group(`Testing: ${setupData.config.application.url}`, function () {
        group('GET request is working', function () {
            checkMyApiGetRequest(setupData.config.application.url);

            sleep(setupData.config.custom.intervalBetweenActions);
        });
    });
}

export function teardown(data) {
    return data;
    // Clear necessary test data
}
