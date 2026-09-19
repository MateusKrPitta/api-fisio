import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'companies'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('plan', 30).defaultTo('bronze').notNullable() // bronze | silver | gold
      table.integer('max_physios').nullable().defaultTo(1)
      table.integer('max_secretaries').nullable().defaultTo(0)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('plan')
      table.dropColumn('max_physios')
      table.dropColumn('max_secretaries')
    })
  }
}
