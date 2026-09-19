/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  // Node
  NODE_ENV: Env.schema.enum.optional(['development', 'production', 'test'] as const),
  PORT: Env.schema.number.optional(),
  HOST: Env.schema.string.optional(),
  LOG_LEVEL: Env.schema.string.optional(),

  // App
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string.optional(),

  // Session
  SESSION_DRIVER: Env.schema.enum.optional(['cookie', 'memory', 'database'] as const),

  // Database
  DB_CONNECTION: Env.schema.enum.optional(['sqlite', 'pg'] as const),
  DATABASE_URL: Env.schema.string.optional(),
  DB_HOST: Env.schema.string.optional(),
  DB_PORT: Env.schema.number.optional(),
  DB_USER: Env.schema.string.optional(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string.optional(),

  // Railway / Standard Postgres env vars
  PGHOST: Env.schema.string.optional(),
  PGPORT: Env.schema.number.optional(),
  PGUSER: Env.schema.string.optional(),
  PGPASSWORD: Env.schema.string.optional(),
  PGDATABASE: Env.schema.string.optional(),
  POSTGRES_USER: Env.schema.string.optional(),
  POSTGRES_PASSWORD: Env.schema.string.optional(),
  POSTGRES_DB: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Variables for configuring the limiter package
  |----------------------------------------------------------
  */
  LIMITER_STORE: Env.schema.enum.optional(['database', 'memory'] as const),
})
