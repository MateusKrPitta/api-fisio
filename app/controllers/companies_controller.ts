import Company from '#models/company'
import User from '#models/user'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

export default class CompaniesController {
  /**
   * List all companies (Super Admin) - Lightweight table list
   */
  async index({ auth, response }: HttpContext) {
    const currentUser = auth.getUserOrFail()
    if (currentUser.role !== 'superadmin') {
      return response.forbidden({ message: 'Acesso restrito ao Administrador do Sistema.' })
    }

    const companies = await Company.query()
      .select('id', 'name', 'cnpj', 'crefito', 'email', 'phone', 'logo_url', 'status', 'plan', 'max_physios', 'max_secretaries', 'created_at', 'updated_at')
      .withCount('users', (q) => q.as('users_count'))
      .withCount('patients', (q) => q.as('patients_count'))
      .orderBy('name', 'asc')

    return response.ok(
      companies.map((c) => ({
        id: c.id,
        name: c.name,
        cnpj: c.cnpj,
        crefito: c.crefito,
        email: c.email,
        phone: c.phone,
        logoUrl: c.logoUrl,
        status: c.status,
        plan: c.plan || 'bronze',
        maxPhysios: c.maxPhysios,
        maxSecretaries: c.maxSecretaries,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        usersCount: Number(c.$extras.users_count || 0),
        patientsCount: Number(c.$extras.patients_count || 0),
        $extras: {
          users_count: Number(c.$extras.users_count || 0),
          patients_count: Number(c.$extras.patients_count || 0),
        },
      }))
    )
  }

  /**
   * Get single company details with full address and users (On-Demand)
   */
  async show({ params, auth, response }: HttpContext) {
    const currentUser = auth.getUserOrFail()
    if (!params.id || params.id === 'undefined' || isNaN(Number(params.id))) {
      return response.badRequest({ message: 'ID da empresa inválido.' })
    }

    if (currentUser.role !== 'superadmin' && currentUser.companyId !== Number(params.id)) {
      return response.forbidden({ message: 'Acesso negado.' })
    }

    const company = await Company.query()
      .where('id', Number(params.id))
      .preload('users', (uQuery) => uQuery.orderBy('fullName', 'asc'))
      .firstOrFail()

    return response.ok({
      id: company.id,
      name: company.name,
      cnpj: company.cnpj,
      crefito: company.crefito,
      email: company.email,
      phone: company.phone,
      address: company.address,
      logoUrl: company.logoUrl,
      status: company.status,
      plan: company.plan || 'bronze',
      maxPhysios: company.maxPhysios,
      maxSecretaries: company.maxSecretaries,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
      users: (company.users || []).map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        crefito: u.crefito,
        role: u.role,
        cpfCnpj: u.cpfCnpj,
        phone: u.phone,
        avatarUrl: u.avatarUrl,
        active: u.active !== false,
        companyId: u.companyId,
      })),
    })
  }

  /**
   * Create new company + clinic admin + optional physiotherapists
   */
  async store({ request, auth, response }: HttpContext) {
    const currentUser = auth.getUserOrFail()
    if (currentUser.role !== 'superadmin') {
      return response.forbidden({ message: 'Acesso restrito ao Administrador do Sistema.' })
    }

    const data = request.only([
      'name',
      'cnpj',
      'crefito',
      'email',
      'phone',
      'address',
      'logoUrl',
      'status',
      'plan',
      'maxPhysios',
      'maxSecretaries',
      'adminName',
      'adminEmail',
      'adminPassword',
      'adminCrefito',
      'adminPhone',
      'adminCpfCnpj',
      'physiotherapists',
    ])

    if (!data.name || !data.name.trim()) {
      return response.badRequest({ message: 'O nome da empresa é obrigatório.' })
    }

    if (!data.adminEmail || !data.adminPassword) {
      return response.badRequest({ message: 'E-mail e senha do Administrador da Empresa são obrigatórios.' })
    }

    // Determine plan and user limits
    const plan: 'bronze' | 'silver' | 'gold' = data.plan || 'bronze'
    let maxPhysios: number | null = 1
    let maxSecretaries: number | null = 0

    if (plan === 'silver') {
      maxPhysios = 3
      maxSecretaries = 1
    } else if (plan === 'gold') {
      maxPhysios = null
      maxSecretaries = null
    }

    if (data.maxPhysios !== undefined) {
      maxPhysios = data.maxPhysios === null || data.maxPhysios === '' ? null : Number(data.maxPhysios)
    }
    if (data.maxSecretaries !== undefined) {
      maxSecretaries = data.maxSecretaries === null || data.maxSecretaries === '' ? null : Number(data.maxSecretaries)
    }

    // Check initial physios limit
    const validPhysios = Array.isArray(data.physiotherapists)
      ? data.physiotherapists.filter((p: any) => p.email && p.password && p.fullName)
      : []

    if (maxPhysios !== null && 1 + validPhysios.length > maxPhysios) {
      return response.badRequest({
        message: `O plano ${plan.toUpperCase()} permite no máximo ${maxPhysios} fisioterapeuta(s) (incluindo o administrador). Você tentou cadastrar ${1 + validPhysios.length}.`,
      })
    }

    // Check if admin email is already taken
    const existingUser = await User.findBy('email', data.adminEmail.toLowerCase().trim())
    if (existingUser) {
      return response.badRequest({ message: `O e-mail ${data.adminEmail} já está em uso por outro usuário.` })
    }

    const trx = await db.transaction()

    try {
      // 1. Create company
      const company = new Company()
      company.useTransaction(trx)
      company.name = data.name.trim()
      company.cnpj = data.cnpj || null
      company.crefito = data.crefito || null
      company.email = data.email ? data.email.trim() : null
      company.phone = data.phone || null
      company.address = data.address || null
      company.logoUrl = data.logoUrl || null
      company.status = data.status || 'active'
      company.plan = plan
      company.maxPhysios = maxPhysios
      company.maxSecretaries = maxSecretaries
      await company.save()

      // 2. Create clinic admin user
      const adminUser = new User()
      adminUser.useTransaction(trx)
      adminUser.fullName = data.adminName?.trim() || `Admin ${company.name}`
      adminUser.email = data.adminEmail.toLowerCase().trim()
      adminUser.password = data.adminPassword
      adminUser.crefito = data.adminCrefito?.trim() || `ADMIN-${company.id}-${Date.now().toString().slice(-4)}`
      adminUser.role = 'clinic_admin'
      adminUser.companyId = company.id
      adminUser.cpfCnpj = data.adminCpfCnpj || null
      adminUser.phone = data.adminPhone || null
      adminUser.active = true
      await adminUser.save()

      // 3. Create initial physiotherapists if provided
      if (validPhysios.length > 0) {
        for (const physio of validPhysios) {
          const existingPhysio = await User.findBy('email', physio.email.toLowerCase().trim())
          if (!existingPhysio) {
            const physioUser = new User()
            physioUser.useTransaction(trx)
            physioUser.fullName = physio.fullName.trim()
            physioUser.email = physio.email.toLowerCase().trim()
            physioUser.password = physio.password
            physioUser.crefito = physio.crefito?.trim() || `CREFITO-${Date.now().toString().slice(-6)}`
            physioUser.role = physio.role || 'physiotherapist'
            physioUser.companyId = company.id
            physioUser.cpfCnpj = physio.cpfCnpj || null
            physioUser.phone = physio.phone || null
            physioUser.avatarUrl = physio.avatarUrl || null
            physioUser.active = true
            await physioUser.save()
          }
        }
      }

      await trx.commit()

      await company.load('users')
      return response.created(company)
    } catch (error: any) {
      await trx.rollback()
      return response.internalServerError({
        message: 'Erro ao cadastrar empresa e profissionais.',
        error: error.message,
      })
    }
  }

  /**
   * Update company
   */
  async update({ params, request, auth, response }: HttpContext) {
    const currentUser = auth.getUserOrFail()
    if (currentUser.role !== 'superadmin' && currentUser.companyId !== Number(params.id)) {
      return response.forbidden({ message: 'Acesso negado.' })
    }

    const company = await Company.findOrFail(params.id)
    const data = request.only([
      'name',
      'cnpj',
      'crefito',
      'email',
      'phone',
      'address',
      'logoUrl',
      'status',
      'plan',
      'maxPhysios',
      'maxSecretaries',
    ])

    if (currentUser.role === 'superadmin') {
      if (data.plan && data.plan !== company.plan) {
        company.plan = data.plan
        if (data.plan === 'bronze') {
          company.maxPhysios = data.maxPhysios !== undefined ? (data.maxPhysios === null ? null : Number(data.maxPhysios)) : 1
          company.maxSecretaries = data.maxSecretaries !== undefined ? (data.maxSecretaries === null ? null : Number(data.maxSecretaries)) : 0
        } else if (data.plan === 'silver') {
          company.maxPhysios = data.maxPhysios !== undefined ? (data.maxPhysios === null ? null : Number(data.maxPhysios)) : 3
          company.maxSecretaries = data.maxSecretaries !== undefined ? (data.maxSecretaries === null ? null : Number(data.maxSecretaries)) : 1
        } else if (data.plan === 'gold') {
          company.maxPhysios = data.maxPhysios !== undefined ? (data.maxPhysios === null ? null : Number(data.maxPhysios)) : null
          company.maxSecretaries = data.maxSecretaries !== undefined ? (data.maxSecretaries === null ? null : Number(data.maxSecretaries)) : null
        }
      } else {
        if (data.maxPhysios !== undefined) {
          company.maxPhysios = data.maxPhysios === null || data.maxPhysios === '' ? null : Number(data.maxPhysios)
        }
        if (data.maxSecretaries !== undefined) {
          company.maxSecretaries = data.maxSecretaries === null || data.maxSecretaries === '' ? null : Number(data.maxSecretaries)
        }
      }
    }

    const standardFields = request.only([
      'name',
      'cnpj',
      'crefito',
      'email',
      'phone',
      'address',
      'logoUrl',
      'status',
    ])
    company.merge(standardFields)
    await company.save()

    return response.ok(company)
  }

  /**
   * Delete company
   */
  async destroy({ params, auth, response }: HttpContext) {
    const currentUser = auth.getUserOrFail()
    if (currentUser.role !== 'superadmin') {
      return response.forbidden({ message: 'Acesso restrito ao Administrador do Sistema.' })
    }

    const company = await Company.findOrFail(params.id)
    await company.delete()

    return response.ok({ message: 'Empresa removida com sucesso.' })
  }
}
