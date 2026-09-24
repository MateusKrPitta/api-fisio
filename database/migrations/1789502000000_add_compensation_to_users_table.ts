import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('compensation_type', 30).nullable() // 'fixed' | 'per_session' | 'percentage' | 'hybrid' | 'pro_labore'
      table.decimal('base_salary', 10, 2).nullable()
      table.decimal('session_rate', 10, 2).nullable()
      table.decimal('commission_percentage', 5, 2).nullable()
      table.integer('payment_day').nullable() // 1 a 31
      table.string('pix_key', 100).nullable()
      table.text('bank_info').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('compensation_type')
      table.dropColumn('base_salary')
      table.dropColumn('session_rate')
      table.dropColumn('commission_percentage')
      table.dropColumn('payment_day')
      table.dropColumn('pix_key')
      table.dropColumn('bank_info')
    })
  }
}
