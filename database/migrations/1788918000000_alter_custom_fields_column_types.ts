import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'custom_fields'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('label').alter()
      table.text('help_text').nullable().alter()
      table.text('unit').nullable().alter()
      table.text('group').nullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('label').alter()
      table.string('help_text').nullable().alter()
      table.string('unit').nullable().alter()
      table.string('group').nullable().alter()
    })
  }
}
