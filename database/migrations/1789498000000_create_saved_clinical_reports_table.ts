import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'saved_clinical_reports'

  async up() {
    this.schema.createTableIfNotExists(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('user_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table
        .integer('company_id')
        .nullable()
        .unsigned()
        .references('id')
        .inTable('companies')
        .onDelete('CASCADE')
      table
        .integer('patient_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('patients')
        .onDelete('CASCADE')

      table.string('scale_key', 60).notNullable()
      table.string('scale_title', 200).notNullable()
      table.string('tone', 40).notNullable().defaultTo('patient_friendly')
      table.text('report_text').notNullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['patient_id', 'scale_key'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
