import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'audit_logs'

  async up() {
    this.schema.createTableIfNotExists(this.tableName, (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('SET NULL')
      table.integer('company_id').unsigned().references('id').inTable('companies').onDelete('SET NULL')
      table.string('action').notNullable() // e.g. CREATE, UPDATE, DELETE
      table.string('table_name').notNullable() // e.g. patients, financial_records
      table.integer('record_id').unsigned().notNullable()
      table.json('old_data').nullable()
      table.json('new_data').nullable()

      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}