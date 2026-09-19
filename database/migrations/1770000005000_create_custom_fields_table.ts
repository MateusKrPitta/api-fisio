import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'custom_fields'

  async up() {
    this.schema.createTableIfNotExists(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('module_id')
        .unsigned()
        .references('id')
        .inTable('custom_modules')
        .onDelete('CASCADE')
      table.string('label').notNullable()
      table.string('field_type').notNullable() // 'text' | 'long_text' | 'number' | 'scale_0_10' | 'date' | 'single_select' | 'multi_select' | 'boolean'
      table.text('options').nullable() // JSON string of options for select fields
      table.string('unit').nullable() // 'º', 'kg', 'cm', '0-10'
      table.string('help_text').nullable()
      table.boolean('is_required').defaultTo(false)
      table.integer('sort_order').defaultTo(0)
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
