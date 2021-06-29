/**
 * Test item management: Create, list and update item
 */
import { loginUi } from '../modules/auth/login.js';
import { configLoader } from 'tao-k6-core';
import { group, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { accessItemsMenu } from '../modules/item/navigation.js';
import { createMultipleItems, deleteItems } from '../modules/item/api.js';

export const requests = new Counter('http_reqs');

let config = configLoader.loadEnvironmentConfig();
// eslint-disable-next-line no-undef
config.custom = configLoader.loadFileConfig(__ENV.CUSTOM_FILE);

export function setup() {
    const user = loginUi({
        url: config.application.url,
        login: config.application.login,
        password: config.application.password,
        cookieName: config.application.cookieName
    });

    const parsedUser = {
        _cookie: user._cookie
    };

    let itemCollection = createMultipleItems({
        url: config.application.url,
        user: parsedUser,
        quantity: 1,
        item: {
            classUri: config.application.itemClassUri,
            label: 'My test item'
        }
    });

    console.log('==============AAA==================');
    console.log(JSON.stringify(parsedUser));

    return {
        config: config,
        user: parsedUser,
        itemCollection: itemCollection
    };
}

export const options = {
    stages: config.options.stages,
    thresholds: config.options.thresholds
};

export default function (setupData) {
    group(`Testing: ${setupData.config.application.url}`, function () {
        group('Access Item Menu', function () {
            accessItemsMenu({
                url: setupData.config.application.url,
                user: setupData.user
            });

            sleep(setupData.config.custom.intervalBetweenActions);
        });
    });
}

export function teardown(data) {
    deleteItems({
        url: data.config.application.url,
        items: data.itemCollection._items,
        user: data.user
    });

    return data;
}
