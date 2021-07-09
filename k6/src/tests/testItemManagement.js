/**
 * Test item management: Create, list and update item
 */
import { loginUi } from '../modules/auth/login.js';
import { configLoader } from 'k6-core';
import { group, sleep } from 'k6';
import { accessItemsMenu, deleteItem, selectItemOfTree } from '../modules/item/navigation.js';
import { createMultipleItems } from '../modules/item/api.js';
import { getTokens } from '../components/security/csrf.js';

const config = configLoader.loadEnvironmentConfig();
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

    const itemCollection = createMultipleItems({
        url: config.application.url,
        user: parsedUser,
        quantity: 1,
        item: {
            classUri: config.application.itemClassUri,
            label: 'My test item'
        }
    });

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

export default function (data) {
    group(`Testing: ${data.config.application.url}`, function () {
        group('Access Item Menu', function () {
            accessItemsMenu({
                url: data.config.application.url,
                user: data.user
            });

            sleep(data.config.custom.intervalBetweenActions);
        });
    });
}

export function teardown(data) {
    data.itemCollection._items.forEach(item => {
        const response = selectItemOfTree({
            url: data.config.application.url,
            item: item,
            user: data.user
        });

        const tokens = getTokens(response);

        deleteItem({
            url: data.config.application.url,
            item: item,
            user: data.user,
            tokens: tokens
        });
    });

    return data;
}
