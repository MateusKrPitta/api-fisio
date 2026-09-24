import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'financial_records'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('category', 50).nullable() // 'salario' | 'comissao' | 'aluguel' | 'insumos' | 'marketing' | 'impostos' | 'outros'
      table.integer('recipient_user_id').unsigned().references('id').inTable('users').onDelete('SET NULL').nullable()
      table.string('reference_month', 7).nullable() // ex: '2026-09'
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['recipient_user_id'])
      table.dropColumn('recipient_user_id')
      table.dropColumn('category')
      table.dropColumn('reference_month')
    })
  }
}
