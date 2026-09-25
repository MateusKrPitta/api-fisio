import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('custom_modules', (table) => {
      table.text('name').alter()
      table.text('description').nullable().alter()
      table.text('category').nullable().alter()
    })

    this.schema.alterTable('form_templates', (table) => {
      table.text('title').alter()
      table.text('description').nullable().alter()
    })
  }

  async down() {
    this.schema.alterTable('custom_modules', (table) => {
      table.string('name', 255).alter()
      table.string('description', 255).nullable().alter()
      table.string('category', 255).nullable().alter()
    })

    this.schema.alterTable('form_templates', (table) => {
      table.string('title', 255).alter()
      table.string('description', 255).nullable().alter()
    })
  }
}
