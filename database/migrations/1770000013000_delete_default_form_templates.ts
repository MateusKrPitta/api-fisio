import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      await db.rawQuery(
        `DELETE FROM form_templates WHERE title LIKE '%Coluna Vertebral%' OR title LIKE '%Ortopédica%' OR title LIKE '%Neurofuncional%' OR title LIKE '%Geriatria%' OR title LIKE '%Cardiorrespiratória%'`
      )
    })
  }

  async down() {}
}
