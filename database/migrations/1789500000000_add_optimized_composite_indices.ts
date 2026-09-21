import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('appointments', (table) => {
      table.index(['patient_id', 'date'])
      table.index(['patient_id', 'status'])
    })

    this.schema.alterTable('patient_form_records', (table) => {
      table.index(['patient_id', 'record_date'])
      table.index(['patient_id', 'template_id'])
    })

    this.schema.alterTable('financial_records', (table) => {
      table.index(['patient_id', 'date'])
    })
  }

  async down() {
    this.schema.alterTable('appointments', (table) => {
      table.dropIndex(['patient_id', 'date'])
      table.dropIndex(['patient_id', 'status'])
    })

    this.schema.alterTable('patient_form_records', (table) => {
      table.dropIndex(['patient_id', 'record_date'])
      table.dropIndex(['patient_id', 'template_id'])
    })

    this.schema.alterTable('financial_records', (table) => {
      table.dropIndex(['patient_id', 'date'])
    })
  }
}
