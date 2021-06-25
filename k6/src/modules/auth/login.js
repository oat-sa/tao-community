import http from 'k6/http';
import { check } from 'k6';

export function loginUi(url, login, password) {
    const res = http.request(
        'POST',
        url + '/tao/Main/login',
        {
            login: login,
            password: password,
            loginForm_sent: 1,
            connect: 'Log in'
        },
        {
            redirects: 999,
            headers: {
                'Upgrade-Insecure-Requests': 1,
                Origin: url,
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9'
            }
        }
    );

    check(res, { 'status was 200': r => r.status === 200 });

    return res;
}
