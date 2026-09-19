import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'patient_form_records'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('signature_status', 50).defaultTo('pendente').notNullable()
      table.string('signature_token', 100).nullable().unique()
      table.text('signature_image').nullable()
      table.timestamp('signed_at', { useTz: true }).nullable()
      table.string('signed_by_name', 255).nullable()
      table.string('signed_by_cpf', 30).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('signature_status')
      table.dropColumn('signature_token')
      table.dropColumn('signature_image')
      table.dropColumn('signed_at')
      table.dropColumn('signed_by_name')
      table.dropColumn('signed_by_cpf')
    })
  }
}
