import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('patients', (table) => {
      table
        .integer('company_id')
        .unsigned()
        .references('id')
        .inTable('companies')
        .onDelete('CASCADE')
        .nullable()
    })

    this.schema.alterTable('appointments', (table) => {
      table
        .integer('company_id')
        .unsigned()
        .references('id')
        .inTable('companies')
        .onDelete('CASCADE')
        .nullable()
    })

    this.schema.alterTable('financial_records', (table) => {
      table
        .integer('company_id')
        .unsigned()
        .references('id')
        .inTable('companies')
        .onDelete('CASCADE')
        .nullable()
    })
  }

  async down() {
    this.schema.alterTable('patients', (table) => {
      table.dropColumn('company_id')
    })

    this.schema.alterTable('appointments', (table) => {
      table.dropColumn('company_id')
    })

    this.schema.alterTable('financial_records', (table) => {
      table.dropColumn('company_id')
    })
  }
}
