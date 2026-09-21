/*
|--------------------------------------------------------------------------
| Define HTTP limiters
|--------------------------------------------------------------------------
|
| The "limiter.define" method creates an HTTP middleware to apply rate
| limits on a route or a group of routes. Feel free to define as many
| throttle middleware as needed.
|
*/

import limiter from '@adonisjs/limiter/services/main'

export const loginLimiter = limiter.define('login', (ctx) => {
  const isDev = process.env.NODE_ENV !== 'production'
  return limiter.allowRequests(isDev ? 50 : 15).every('1 minute').usingKey(ctx.request.ip())
})

export const signupLimiter = limiter.define('signup', (ctx) => {
  return limiter.allowRequests(5).every('15 minutes').usingKey(ctx.request.ip())
})

export const publicSignatureLimiter = limiter.define('public_signature', (ctx) => {
  return limiter.allowRequests(10).every('1 minute').usingKey(ctx.request.ip())
})

export const whatsappLimiter = limiter.define('whatsapp', (ctx) => {
  return limiter.allowRequests(10).every('1 minute').usingKey(ctx.request.ip())
})

export const globalLimiter = limiter.define('global', (ctx) => {
  return limiter.allowRequests(100).every('1 minute').usingKey(ctx.request.ip())
})