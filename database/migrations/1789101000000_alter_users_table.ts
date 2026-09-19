import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('company_id')
        .unsigned()
        .references('id')
        .inTable('companies')
        .onDelete('CASCADE')
        .nullable()

      table.string('role', 30).defaultTo('clinic_admin').notNullable()
      table.string('cpf_cnpj', 30).nullable()
      table.string('phone', 50).nullable()
      table.text('avatar_url').nullable()
      table.boolean('active').defaultTo(true).notNullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('company_id')
      table.dropColumn('role')
      table.dropColumn('cpf_cnpj')
      table.dropColumn('phone')
      table.dropColumn('avatar_url')
      table.dropColumn('active')
    })
  }
}
