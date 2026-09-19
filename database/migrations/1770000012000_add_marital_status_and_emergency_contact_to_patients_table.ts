import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'patients'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('marital_status', 50).nullable()
      table.string('emergency_contact', 50).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('marital_status')
      table.dropColumn('emergency_contact')
    })
  }
}
