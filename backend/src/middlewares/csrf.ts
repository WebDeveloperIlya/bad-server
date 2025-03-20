import { doubleCsrf, DoubleCsrfConfigOptions } from 'csrf-csrf'
import { CSRF_SECRET, CSRF_COOKIE_NAME } from '../config'

export const doubleCsrfConfigOptions: DoubleCsrfConfigOptions = {
    getSecret: () => CSRF_SECRET,
    cookieName: CSRF_COOKIE_NAME,
    cookieOptions: {
        sameSite: 'strict',
        path: '/',
        secure: process.env.MODE === 'production',
        httpOnly: true,
        maxAge: 60 * 60 * 1000,
    },
}

export const { doubleCsrfProtection, generateToken } = doubleCsrf(
    doubleCsrfConfigOptions
)
