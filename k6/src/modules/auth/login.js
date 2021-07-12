import http from 'k6/http';
import { check } from 'k6';
import User from './model/User.js';

/**
 * @param params
 * @returns User
 */
export function loginUi(params) {
    const res = http.request(
        'POST',
        params.url + '/tao/Main/login',
        {
            login: params.login,
            password: params.password,
            loginForm_sent: 1,
            connect: 'Log in'
        },
        {
            redirects: 0,
            headers: {
                'Upgrade-Insecure-Requests': 1,
                Origin: params.url,
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9'
            }
        }
    );

    check(res, { 'Login status was 302': r => r.status === 302 });

    const user = new User();
    user.cookie = {
        [params.cookieName]: res.cookies[params.cookieName][0]['value']
    };

    return user;
}
