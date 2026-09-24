import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'satisfaction_surveys'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().references('id').inTable('companies').onDelete('CASCADE').nullable()
      table.integer('patient_id').unsigned().references('id').inTable('patients').onDelete('CASCADE').notNullable()
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('SET NULL').nullable()
      
      table.string('token', 64).notNullable().unique()
      table.string('status', 30).notNullable().defaultTo('pendente') // pendente | respondido
      
      table.integer('nps_score').nullable() // 0 to 10
      table.integer('therapist_rating').nullable() // 1 to 5
      table.integer('recovery_rating').nullable() // 1 to 5
      table.integer('structure_rating').nullable() // 1 to 5
      table.text('feedback').nullable()
      
      table.timestamp('answered_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['company_id', 'patient_id'])
      table.index(['token'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
