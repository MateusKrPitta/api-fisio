import type { HttpContext } from '@adonisjs/core/http'
import FormTemplate from '#models/form_template'
import CustomModule from '#models/custom_module'
import PatientFormRecord from '#models/patient_form_record'

export default class FormTemplatesController {
  /**
   * List all form templates ("Fichas Técnicas")
   */
  async index({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const page = request.input('page', 1)
    const limit = request.input('limit', 10)
    const search = request.input('search', '')

    const query = FormTemplate.query()
      .where('user_id', user.id)
      .where('is_active', true)

    if (search) {
      query.where('title', 'ilike', `%${search}%`)
    }

    const paginated = await query
      .orderBy('title', 'asc')
      .paginate(page, limit)

    const templates = paginated.all()

    const data = templates.map((t) => {
      let parsedIds: number[] = []
      try {
        parsedIds = t.moduleIds ? (typeof t.moduleIds === 'string' ? JSON.parse(t.moduleIds) : t.moduleIds) : []
      } catch (e) {}

      return {
        ...t.toJSON(),
        moduleIds: parsedIds,
      }
    })

    return response.ok({
      meta: paginated.getMeta(),
      data,
    })
  }

  /**
   * Get a single form template by ID with its hydrated modules and fields
   */
  async show({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const template = await FormTemplate.query()
      .where('id', params.id)
      .where('user_id', user.id)
      .first()

    if (!template) {
      return response.notFound({ error: 'Ficha Técnica não encontrada.' })
    }

    const moduleIds: number[] = template.moduleIds
      ? typeof template.moduleIds === 'string'
        ? JSON.parse(template.moduleIds)
        : template.moduleIds
      : []

    const modules = moduleIds.length > 0
      ? await CustomModule.query()
          .whereIn('id', moduleIds)
          .preload('fields', (q) => q.orderBy('sort_order', 'asc'))
      : []

    return response.ok({
      ...template.toJSON(),
      modules,
    })
  }

  /**
   * Create a new form template
   */
  async store({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { title, description, moduleIds } = request.only(['title', 'description', 'moduleIds'])

    if (!title) {
      return response.badRequest({ error: 'O título da Ficha Técnica é obrigatório.' })
    }

    const template = await FormTemplate.create({
      userId: user.id,
      title,
      description: description || null,
      moduleIds: Array.isArray(moduleIds) ? JSON.stringify(moduleIds) : moduleIds || '[]',
      isActive: true,
    })

    return response.created(template)
  }

  /**
   * Update a form template
   */
  async update({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const template = await FormTemplate.query()
      .where('id', params.id)
      .where('user_id', user.id)
      .first()

    if (!template) {
      return response.notFound({ error: 'Ficha Técnica não encontrada.' })
    }

    const { title, description, moduleIds, isActive } = request.only([
      'title',
      'description',
      'moduleIds',
      'isActive',
    ])

    if (title) template.title = title
    if (description !== undefined) template.description = description
    if (moduleIds) template.moduleIds = Array.isArray(moduleIds) ? JSON.stringify(moduleIds) : moduleIds
    if (isActive !== undefined) template.isActive = isActive

    await template.save()
    return response.ok(template)
  }

  /**
   * Delete a form template
   */
  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const template = await FormTemplate.query()
      .where('id', params.id)
      .where('user_id', user.id)
      .first()

    if (!template) {
      return response.notFound({ error: 'Ficha Técnica não encontrada.' })
    }

    const hasRecords = await PatientFormRecord.query()
      .where('template_id', template.id)
      .first()

    if (hasRecords) {
      template.isActive = false
      await template.save()
      return response.ok({ message: 'A avaliação já possuía registros e foi arquivada para preservar o histórico.' })
    }

    try {
      await template.delete()
      return response.ok({ message: 'Ficha Técnica excluída com sucesso.' })
    } catch (err) {
      template.isActive = false
      await template.save()
      return response.ok({ message: 'A avaliação foi arquivada pois já possuía vínculos com pacientes.' })
    }
  }
}
