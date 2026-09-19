import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'patients'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.decimal('session_rate', 10, 2).nullable().defaultTo(0)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('session_rate')
    })
  }
}
