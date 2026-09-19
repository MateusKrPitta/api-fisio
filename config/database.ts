import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/lucid'

const dbUrl =
  env.get('DATABASE_URL') ||
  process.env.DATABASE_URL ||
  env.get('DATABASE_PRIVATE_URL') ||
  process.env.DATABASE_PRIVATE_URL ||
  env.get('DATABASE_PUBLIC_URL') ||
  process.env.DATABASE_PUBLIC_URL

const pgHost = env.get('DB_HOST') || env.get('PGHOST') || process.env.PGHOST || process.env.DB_HOST
const pgPort = Number(env.get('DB_PORT') || env.get('PGPORT') || process.env.PGPORT || 5432)
const pgUser = env.get('DB_USER') || env.get('PGUSER') || env.get('POSTGRES_USER') || process.env.PGUSER || process.env.POSTGRES_USER
const pgPassword = env.get('DB_PASSWORD') || env.get('PGPASSWORD') || env.get('POSTGRES_PASSWORD') || process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD
const pgDatabase = env.get('DB_DATABASE') || env.get('PGDATABASE') || env.get('POSTGRES_DB') || process.env.PGDATABASE || process.env.POSTGRES_DB

const hasPgEnv = Boolean(dbUrl) || Boolean(pgHost) || Boolean(pgUser)

const defaultConnection =
  env.get('DB_CONNECTION') || (app.inProduction || hasPgEnv ? 'pg' : 'sqlite')

const dbConfig = defineConfig({
  /**
   * Default connection used for all queries.
   */
  connection: defaultConnection,

  connections: {
    /**
     * SQLite connection (default in local dev without postgres).
     */
    sqlite: {
      client: 'better-sqlite3',

      connection: {
        filename: app.tmpPath('db.sqlite3'),
      },

      /**
       * Required by Knex for SQLite defaults.
       */
      useNullAsDefault: true,

      migrations: {
        /**
         * Sort migration files naturally by filename.
         */
        naturalSort: true,

        /**
         * Paths containing migration files.
         */
        paths: ['database/migrations'],
      },

      schemaGeneration: {
        /**
         * Enable schema generation from Lucid models.
         */
        enabled: true,

        /**
         * Custom schema rules file paths.
         */
        rulesPaths: ['./database/schema_rules.js'],
      },
    },

    /**
     * PostgreSQL connection (Railway / Production).
     */
    pg: {
      client: 'pg',
      connection: dbUrl
        ? dbUrl
        : {
            host: pgHost || '127.0.0.1',
            port: pgPort,
            user: pgUser || 'postgres',
            password: pgPassword || '',
            database: pgDatabase || 'railway',
          },
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
      debug: app.inDev,
    },

    /**
     * MySQL / MariaDB connection.
     * Install package to switch: npm install mysql2
     */
    // mysql: {
    //   client: 'mysql2',
    //   connection: {
    //     host: env.get('DB_HOST'),
    //     port: env.get('DB_PORT'),
    //     user: env.get('DB_USER'),
    //     password: env.get('DB_PASSWORD'),
    //     database: env.get('DB_DATABASE'),
    //   },
    //   migrations: {
    //     naturalSort: true,
    //     paths: ['database/migrations'],
    //   },
    //   debug: app.inDev,
    // },

    /**
     * Microsoft SQL Server connection.
     * Install package to switch: npm install tedious
     */
    // mssql: {
    //   client: 'mssql',
    //   connection: {
    //     server: env.get('DB_HOST'),
    //     port: env.get('DB_PORT'),
    //     user: env.get('DB_USER'),
    //     password: env.get('DB_PASSWORD'),
    //     database: env.get('DB_DATABASE'),
    //   },
    //   migrations: {
    //     naturalSort: true,
    //     paths: ['database/migrations'],
    //   },
    //   debug: app.inDev,
    // },

    /**
     * libSQL (Turso) connection.
     * Install package to switch: npm install @libsql/client
     */
    // libsql: {
    //   client: 'libsql',
    //   connection: {
    //     url: env.get('LIBSQL_URL'),
    //     authToken: env.get('LIBSQL_AUTH_TOKEN'),
    //   },
    //   useNullAsDefault: true,
    //   migrations: {
    //     naturalSort: true,
    //     paths: ['database/migrations'],
    //   },
    //   debug: app.inDev,
    // },
  },
})

export default dbConfig
