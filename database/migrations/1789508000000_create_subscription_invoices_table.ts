import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'subscription_invoices'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table
        .integer('company_id')
        .unsigned()
        .references('id')
        .inTable('companies')
        .onDelete('CASCADE')
        .notNullable()

      table.string('title', 150).notNullable()
      table.decimal('amount', 10, 2).notNullable()
      table.timestamp('due_date', { useTz: true }).notNullable()
      table.timestamp('paid_at', { useTz: true }).nullable()
      table.string('status', 30).defaultTo('pending').notNullable() // pending | paid | overdue | canceled
      table.string('payment_method', 50).nullable() // pix | credit_card | bank_slip | manual
      table.string('mp_payment_id', 100).nullable()
      table.string('mp_preference_id', 150).nullable()
      table.text('pix_qr_code').nullable()
      table.text('pix_qr_code_base64').nullable()
      table.text('ticket_url').nullable()
      table.text('notes').nullable()

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).nullable()

      table.index(['company_id', 'status'])
      table.index(['due_date'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
