import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'financial_records'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('user_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table
        .integer('patient_id')
        .nullable()
        .unsigned()
        .references('id')
        .inTable('patients')
        .onDelete('SET NULL')
      table
        .integer('appointment_id')
        .nullable()
        .unsigned()
        .references('id')
        .inTable('appointments')
        .onDelete('SET NULL')

      table.string('title').notNullable()
      table.decimal('amount', 10, 2).notNullable().defaultTo(0)
      table.string('type', 20).notNullable().defaultTo('receita') // receita | despesa
      table.string('status', 20).notNullable().defaultTo('pendente') // baixado | pendente | cancelado
      table.string('payment_method', 30).notNullable().defaultTo('pix') // pix | cartao_credito | cartao_debito | dinheiro | transferencia | outro
      table.date('date').notNullable()
      table.timestamp('paid_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
