import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'companies'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('subscription_status', 30).defaultTo('trial').notNullable() // trial | active | past_due | suspended | canceled
      table.timestamp('trial_ends_at', { useTz: true }).nullable()
      table.integer('due_day').nullable().defaultTo(10)
      table.decimal('monthly_price', 10, 2).nullable().defaultTo(99.00)
      table.timestamp('next_billing_date', { useTz: true }).nullable()
      table.timestamp('last_payment_date', { useTz: true }).nullable()
      table.string('mp_customer_id', 100).nullable()
      table.string('mp_subscription_id', 100).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('subscription_status')
      table.dropColumn('trial_ends_at')
      table.dropColumn('due_day')
      table.dropColumn('monthly_price')
      table.dropColumn('next_billing_date')
      table.dropColumn('last_payment_date')
      table.dropColumn('mp_customer_id')
      table.dropColumn('mp_subscription_id')
    })
  }
}
