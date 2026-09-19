import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'companies'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('name').notNullable()
      table.string('cnpj', 30).nullable()
      table.string('crefito', 50).nullable()
      table.string('email', 254).nullable()
      table.string('phone', 50).nullable()
      table.text('address').nullable()
      table.text('logo_url').nullable()
      table.string('status', 20).defaultTo('active').notNullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
