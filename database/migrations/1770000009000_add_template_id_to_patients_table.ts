import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'patients'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('template_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('form_templates')
        .onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('template_id')
    })
  }
}
