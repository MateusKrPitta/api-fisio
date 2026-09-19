import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('patients', (table) => {
      table.index(['company_id'])
      table.index(['user_id'])
      table.index(['name'])
    })

    this.schema.alterTable('appointments', (table) => {
      table.index(['company_id'])
      table.index(['user_id'])
      table.index(['date'])
      table.index(['status'])
    })

    this.schema.alterTable('financial_records', (table) => {
      table.index(['company_id'])
      table.index(['user_id'])
      table.index(['date'])
      table.index(['status'])
    })
  }

  async down() {
    this.schema.alterTable('patients', (table) => {
      table.dropIndex(['company_id'])
      table.dropIndex(['user_id'])
      table.dropIndex(['name'])
    })

    this.schema.alterTable('appointments', (table) => {
      table.dropIndex(['company_id'])
      table.dropIndex(['user_id'])
      table.dropIndex(['date'])
      table.dropIndex(['status'])
    })

    this.schema.alterTable('financial_records', (table) => {
      table.dropIndex(['company_id'])
      table.dropIndex(['user_id'])
      table.dropIndex(['date'])
      table.dropIndex(['status'])
    })
  }
}