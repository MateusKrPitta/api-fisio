import type { HttpContext } from '@adonisjs/core/http'
import CustomModule from '#models/custom_module'
import CustomField from '#models/custom_field'

export default class CustomModulesController {
  /**
   * List all custom modules with their fields
   */
  async index({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const page = request.input('page', 1)
    const limit = request.input('limit', 10)
    const category = request.input('category', 'Todas')
    const search = request.input('search', '')
    const withFields = request.input('with_fields', 'false') === 'true'

    const query = CustomModule.query()
      .where('user_id', user.id)
      .orderBy('name', 'asc')

    if (category && category !== 'Todas') {
      query.where('category', category)
    }

    if (search) {
      query.where((q) => {
        q.whereILike('name', `%${search}%`)
         .orWhereILike('description', `%${search}%`)
      })
    }

    if (withFields) {
      query.preload('fields', (q) => {
        q.orderBy('sort_order', 'asc')
      })
    } else {
      query.withCount('fields')
    }

    const modules = await query.paginate(page, limit)

    return response.ok(modules)
  }

  /**
   * Get a single custom module by ID with its fields
   */
  async show({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const module = await CustomModule.query()
      .where('id', params.id)
      .where('user_id', user.id)
      .preload('fields', (query) => {
        query.orderBy('sort_order', 'asc')
      })
      .first()

    if (!module) {
      return response.notFound({ error: 'Módulo não encontrado.' })
    }

    return response.ok(module)
  }

  /**
   * Create a new custom module with fields
   */
  async store({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { name, description, category, fields } = request.only([
      'name',
      'description',
      'category',
      'fields',
    ])

    if (!name) {
      return response.badRequest({ error: 'O nome do módulo é obrigatório.' })
    }

    const module = await CustomModule.create({
      userId: user.id,
      name,
      description: description || null,
      category: category || 'Geral',
    })

    if (Array.isArray(fields) && fields.length > 0) {
      const fieldsToCreate = fields.map((f: any, idx: number) => ({
        moduleId: module.id,
        label: f.label,
        fieldType: f.fieldType || 'text',
        options: Array.isArray(f.options) ? JSON.stringify(f.options) : f.options || null,
        unit: f.unit || null,
        helpText: f.helpText || null,
        isRequired: !!f.isRequired,
        group: f.group || null,
        sortOrder: idx,
      }))
      await CustomField.createMany(fieldsToCreate)
    }

    await module.load('fields')
    return response.created(module)
  }

  /**
   * Update an existing module & its fields
   */
  async update({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const module = await CustomModule.query()
      .where('id', params.id)
      .where('user_id', user.id)
      .first()

    if (!module) {
      return response.notFound({ error: 'Módulo não encontrado.' })
    }

    const { name, description, category, fields } = request.only([
      'name',
      'description',
      'category',
      'fields',
    ])

    if (name) module.name = name
    if (description !== undefined) module.description = description
    if (category) module.category = category

    await module.save()

    if (Array.isArray(fields)) {
      // Replace existing fields
      await CustomField.query().where('module_id', module.id).delete()
      const fieldsToCreate = fields.map((f: any, idx: number) => ({
        moduleId: module.id,
        label: f.label,
        fieldType: f.fieldType || 'text',
        options: Array.isArray(f.options) ? JSON.stringify(f.options) : f.options || null,
        unit: f.unit || null,
        helpText: f.helpText || null,
        isRequired: !!f.isRequired,
        group: f.group || null,
        sortOrder: idx,
      }))
      await CustomField.createMany(fieldsToCreate)
    }

    await module.load('fields')
    return response.ok(module)
  }

  /**
   * Delete a custom module
   */
  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const module = await CustomModule.query()
      .where('id', params.id)
      .where('user_id', user.id)
      .first()

    if (!module) {
      return response.notFound({ error: 'Módulo não encontrado.' })
    }

    await module.delete()
    return response.ok({ message: 'Módulo excluído com sucesso.' })
  }
}
