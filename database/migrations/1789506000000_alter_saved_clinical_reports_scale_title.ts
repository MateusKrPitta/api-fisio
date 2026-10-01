import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('saved_clinical_reports', (table) => {
      table.text('scale_title').alter()
    })
  }

  async down() {
    this.schema.alterTable('saved_clinical_reports', (table) => {
      table.string('scale_title', 200).alter()
    })
  }
}
