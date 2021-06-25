/**
 *
 * This is a template file, please replace with your implementation.
 *
 */
import { loginUi } from '../modules/auth/login.js';
import { configLoader } from 'tao-k6-core';
import { group, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { accessItemsMenu } from '../modules/items/navigation.js';

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
    group(`Login to application: ${setupData.config.application.url}`, function () {
        const responseLogin = loginUi(
            setupData.config.application.url,
            setupData.config.application.login,
            setupData.config.application.password
        );

        console.warn(responseLogin);
    });

    group(`Testing: ${setupData.config.application.url}`, function () {
        group('Access Item Menu', function () {
            accessItemsMenu({
                url: setupData.config.application.url
            });

            sleep(setupData.config.custom.intervalBetweenActions);
        });
    });
}

export function teardown(data) {
    // Clear necessary test data
    return data;
}
