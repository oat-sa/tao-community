/**
 * Test item management: Create, list and update item
 */
import { loginUi } from '../modules/auth/login.js';
import { configLoader } from 'oat-k6-core';
import { group, sleep } from 'k6';
import { accessItemsMenu, deleteItem, editItem, selectItemOfTree } from '../modules/item/navigation.js';
import { createMultipleItems } from '../modules/item/api.js';
import { Rate } from 'k6/metrics';

const config = configLoader.loadEnvironmentConfig();
// eslint-disable-next-line no-undef
config.custom = configLoader.loadFileConfig(__ENV.CUSTOM_FILE);

export const options = config.options;

const errorRate = new Rate('errors');

export function setup() {
    const user = loginUi({
        url: config.application.url,
        login: config.application.login,
        password: config.application.password,
        cookieName: config.application.cookieName,
        errorRate: errorRate
    });

    const parsedUser = {
        cookie: user.cookie
    };

    const itemCollection = createMultipleItems({
        url: config.application.url,
        user: parsedUser,
        quantity: 1,
        item: {
            classUri: config.application.itemClassUri,
            label: 'My test item'
        },
        errorRate: errorRate
    });

    return {
        config: config,
        user: parsedUser,
        itemCollection: itemCollection
    };
}

export default function (data) {
    group(`Testing: ${data.config.application.url}`, function () {
        group('Access Item Menu', function () {
            accessItemsMenu({
                url: data.config.application.url,
                user: data.user,
                errorRate: errorRate
            });

            sleep(data.config.custom.intervalBetweenActions);
        });

        group('Edit items', function () {
            data.itemCollection.items.forEach(item => {
                const selectItemResponse = selectItemOfTree({
                    url: data.config.application.url,
                    item: item,
                    user: data.user,
                    errorRate: errorRate
                });

                editItem({
                    url: data.config.application.url,
                    item: item,
                    user: data.user,
                    tokens: selectItemResponse.tokens,
                    errorRate: errorRate
                });

                sleep(data.config.custom.intervalBetweenActions);
            });
        });
    });
}

export function teardown(data) {
    data.itemCollection.items.forEach(item => {
        const selectItemResponse = selectItemOfTree({
            url: data.config.application.url,
            item: item,
            user: data.user,
            errorRate: errorRate
        });

        deleteItem({
            url: data.config.application.url,
            item: item,
            user: data.user,
            tokens: selectItemResponse.tokens,
            errorRate: errorRate
        });
    });

    return data;
}
