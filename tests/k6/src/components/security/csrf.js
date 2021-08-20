/**
 * @param response
 * @return {*}
 */
export function getTokens(response) {
    return {
        csrfToken: getCSRFTokenByHTML(response.body),
        signature: getSignatureByHTML(response.body)
    };
}

export function getSignatureByHTML(htmlContent) {
    return getTokenByHTML(
        /<input( +)type='hidden'( +)name='signature'( +)id='signature'( +)value=".*"( +)\/>/gm,
        htmlContent
    );
}

export function getCSRFTokenByHTML(htmlContent) {
    return getTokenByHTML(
        /<input( +)type='hidden'( +)name='X-CSRF-Token'( +)id='X-CSRF-Token'( +)value=".*"( +)\/>/gm,
        htmlContent
    );
}

function getTokenByHTML(regex, htmlContent) {
    let match;

    while ((match = regex.exec(htmlContent)) !== null) {
        // This is necessary to avoid infinite loops with zero-width matches
        if (match.index === regex.lastIndex) {
            regex.lastIndex++;
        }

        const htmlElement = match[0];
        const subRegex = /value=".*"/gm;
        const occurrences = subRegex.exec(htmlElement);

        if (occurrences !== null) {
            let token = occurrences[0].replace('value="', '');

            token = token.substr(0, token.indexOf('"'));

            return token;
        }
    }

    return null;
}
