import User from '#models/user'
import Company from '#models/company'
import type { HttpContext } from '@adonisjs/core/http'

export default class TeamController {
  private formatUser(user: User) {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      crefito: user.crefito,
      role: user.role,
      companyId: user.companyId,
      cpfCnpj: user.cpfCnpj,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      active: user.active !== false,
      compensationType: user.compensationType || null,
      baseSalary: user.baseSalary !== null && user.baseSalary !== undefined ? Number(user.baseSalary) : null,
      sessionRate: user.sessionRate !== null && user.sessionRate !== undefined ? Number(user.sessionRate) : null,
      commissionPercentage:
        user.commissionPercentage !== null && user.commissionPercentage !== undefined
          ? Number(user.commissionPercentage)
          : null,
      paymentDay: user.paymentDay || null,
      pixKey: user.pixKey || null,
      bankInfo: user.bankInfo || null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }
  }

  /**
   * Get quota and usage information for the active clinic/company
   */
  async quota({ auth, request, response }: HttpContext) {
    const currentUser = auth.getUserOrFail()
    let companyId = currentUser.companyId
    if (currentUser.role === 'superadmin') {
      const qCompanyId = request.input('companyId')
      if (qCompanyId && qCompanyId !== 'undefined') {
        companyId = Number(qCompanyId)
      }
    }

    if (!companyId) {
      return response.ok({
        plan: 'gold',
        maxPhysios: null,
        maxSecretaries: null,
        physiosUsed: 0,
        secretariesUsed: 0,
        canAddPhysio: true,
        canAddSecretary: true,
      })
    }

    const company = await Company.find(companyId)
    if (!company) {
      return response.notFound({ message: 'Clínica não encontrada.' })
    }

    const physiosCount = await User.query()
      .where('companyId', companyId)
      .whereIn('role', ['clinic_admin', 'physiotherapist'])
      .where('active', true)
      .count('* as total')

    const secretariesCount = await User.query()
      .where('companyId', companyId)
      .where('role', 'secretary')
      .where('active', true)
      .count('* as total')

    const physiosUsed = Number(physiosCount[0]?.$extras?.total || 0)
    const secretariesUsed = Number(secretariesCount[0]?.$extras?.total || 0)

    const maxPhysios = company.maxPhysios
    const maxSecretaries = company.maxSecretaries

    return response.ok({
      companyId: company.id,
      companyName: company.name,
      plan: company.plan || 'bronze',
      maxPhysios,
      maxSecretaries,
      physiosUsed,
      secretariesUsed,
      canAddPhysio: maxPhysios === null || physiosUsed < maxPhysios,
      canAddSecretary: maxSecretaries === null || (maxSecretaries > 0 && secretariesUsed < maxSecretaries),
    })
  }

  /**
   * List team members
   */
  async index({ auth, request, response }: HttpContext) {
    const currentUser = auth.getUserOrFail()
    const query = User.query().preload('company').orderBy('fullName', 'asc')

    if (currentUser.role === 'superadmin') {
      const companyId = request.input('companyId')
      if (companyId && companyId !== 'undefined') {
        query.where('companyId', Number(companyId))
      }
    } else {
      if (!currentUser.companyId) {
        return response.ok([this.formatUser(currentUser)])
      }
      query.where('companyId', currentUser.companyId)
    }

    const role = request.input('role')
    if (role) {
      query.where('role', role)
    }

    const users = await query
    return response.ok(users.map((u) => this.formatUser(u)))
  }

  /**
   * Get single team member
   */
  async show({ params, auth, response }: HttpContext) {
    const currentUser = auth.getUserOrFail()
    if (!params.id || params.id === 'undefined' || isNaN(Number(params.id))) {
      return response.badRequest({ message: 'ID do usuário inválido.' })
    }

    const user = await User.query().where('id', Number(params.id)).preload('company').firstOrFail()

    if (
      currentUser.role !== 'superadmin' &&
      currentUser.companyId !== user.companyId &&
      currentUser.id !== user.id
    ) {
      return response.forbidden({ message: 'Acesso negado.' })
    }

    return response.ok(this.formatUser(user))
  }

  /**
   * Add a new team member (Physiotherapist / Secretary / Clinic Admin)
   */
  async store({ request, auth, response }: HttpContext) {
    const currentUser = auth.getUserOrFail()

    if (currentUser.role !== 'superadmin' && currentUser.role !== 'clinic_admin') {
      return response.forbidden({ message: 'Apenas administradores podem cadastrar profissionais.' })
    }

    const data = request.only([
      'fullName',
      'email',
      'password',
      'crefito',
      'role',
      'cpfCnpj',
      'phone',
      'avatarUrl',
      'companyId',
      'compensationType',
      'baseSalary',
      'sessionRate',
      'commissionPercentage',
      'paymentDay',
      'pixKey',
      'bankInfo',
    ])

    if (!data.fullName || !data.email || !data.password) {
      return response.badRequest({ message: 'Nome, e-mail e senha são obrigatórios.' })
    }

    const existing = await User.findBy('email', data.email.toLowerCase().trim())
    if (existing) {
      return response.badRequest({ message: `O e-mail ${data.email} já está em uso.` })
    }

    const targetCompanyId =
      currentUser.role === 'superadmin' && data.companyId
        ? Number(data.companyId)
        : currentUser.companyId

    if (targetCompanyId) {
      const company = await Company.find(targetCompanyId)
      if (company) {
        const targetRole = data.role || 'physiotherapist'
        const planName = (company.plan || 'bronze').toUpperCase()

        if (targetRole === 'physiotherapist' || targetRole === 'clinic_admin') {
          if (company.maxPhysios !== null && company.maxPhysios !== undefined) {
            const physiosCountRes = await User.query()
              .where('companyId', targetCompanyId)
              .whereIn('role', ['clinic_admin', 'physiotherapist'])
              .where('active', true)
              .count('* as total')
            const physiosUsed = Number(physiosCountRes[0]?.$extras?.total || 0)

            if (physiosUsed >= company.maxPhysios) {
              return response.badRequest({
                message: `Limite de fisioterapeutas atingido para o plano ${planName} (máximo de ${company.maxPhysios} profissional(is)). Faça o upgrade do plano para adicionar mais.`,
              })
            }
          }
        } else if (targetRole === 'secretary') {
          if (company.maxSecretaries !== null && company.maxSecretaries !== undefined) {
            if (company.maxSecretaries <= 0) {
              return response.badRequest({
                message: `O plano ${planName} não permite o cadastro de secretárias. Faça o upgrade para o plano Prata ou Ouro.`,
              })
            }

            const secCountRes = await User.query()
              .where('companyId', targetCompanyId)
              .where('role', 'secretary')
              .where('active', true)
              .count('* as total')
            const secUsed = Number(secCountRes[0]?.$extras?.total || 0)

            if (secUsed >= company.maxSecretaries) {
              return response.badRequest({
                message: `Limite de secretárias(os) atingido para o plano ${planName} (máximo de ${company.maxSecretaries}). Faça o upgrade para adicionar mais.`,
              })
            }
          }
        }
      }
    }

    const user = new User()
    user.fullName = data.fullName.trim()
    user.email = data.email.toLowerCase().trim()
    user.password = data.password
    user.crefito = data.crefito?.trim() || `CREFITO-${Date.now().toString().slice(-6)}`
    user.role = data.role || 'physiotherapist'
    user.companyId = targetCompanyId || null
    user.cpfCnpj = data.cpfCnpj || null
    user.phone = data.phone || null
    user.avatarUrl = data.avatarUrl || null
    user.active = true
    user.compensationType = data.compensationType || null
    user.baseSalary = data.baseSalary !== undefined && data.baseSalary !== null ? String(data.baseSalary) : null
    user.sessionRate = data.sessionRate !== undefined && data.sessionRate !== null ? String(data.sessionRate) : null
    user.commissionPercentage =
      data.commissionPercentage !== undefined && data.commissionPercentage !== null
        ? String(data.commissionPercentage)
        : null
    user.paymentDay = data.paymentDay ? Number(data.paymentDay) : null
    user.pixKey = data.pixKey || null
    user.bankInfo = data.bankInfo || null

    await user.save()
    return response.created(this.formatUser(user))
  }

  /**
   * Update team member
   */
  async update({ params, request, auth, response }: HttpContext) {
    const currentUser = auth.getUserOrFail()
    if (!params.id || params.id === 'undefined' || isNaN(Number(params.id))) {
      return response.badRequest({ message: 'ID do usuário inválido.' })
    }

    const user = await User.findOrFail(Number(params.id))

    if (
      currentUser.role !== 'superadmin' &&
      currentUser.role !== 'clinic_admin' &&
      currentUser.id !== user.id
    ) {
      return response.forbidden({ message: 'Acesso negado.' })
    }

    if (
      currentUser.role === 'clinic_admin' &&
      user.companyId !== currentUser.companyId
    ) {
      return response.forbidden({ message: 'Acesso negado a membros de outra clínica.' })
    }

    const data = request.only([
      'fullName',
      'email',
      'password',
      'crefito',
      'role',
      'cpfCnpj',
      'phone',
      'avatarUrl',
      'active',
      'compensationType',
      'baseSalary',
      'sessionRate',
      'commissionPercentage',
      'paymentDay',
      'pixKey',
      'bankInfo',
    ])

    if (data.email && data.email.toLowerCase().trim() !== user.email) {
      const existing = await User.findBy('email', data.email.toLowerCase().trim())
      if (existing && existing.id !== user.id) {
        return response.badRequest({ message: `O e-mail ${data.email} já está em uso.` })
      }
      user.email = data.email.toLowerCase().trim()
    }

    // Role or activation change quota checks
    if (
      user.companyId &&
      (
        (data.role && data.role !== user.role) ||
        (data.active === true && user.active === false)
      )
    ) {
      const newRole = data.role || user.role
      const company = await Company.find(user.companyId)

      if (company) {
        const planName = (company.plan || 'bronze').toUpperCase()

        if (newRole === 'physiotherapist' || newRole === 'clinic_admin') {
          if (company.maxPhysios !== null && company.maxPhysios !== undefined) {
            const physiosCountRes = await User.query()
              .where('companyId', user.companyId)
              .whereIn('role', ['clinic_admin', 'physiotherapist'])
              .where('active', true)
              .whereNot('id', user.id)
              .count('* as total')
            const physiosUsed = Number(physiosCountRes[0]?.$extras?.total || 0)

            if (physiosUsed >= company.maxPhysios) {
              return response.badRequest({
                message: `Não foi possível ativar/alterar para este cargo: limite de fisioterapeutas atingido para o plano ${planName} (máx: ${company.maxPhysios}).`,
              })
            }
          }
        } else if (newRole === 'secretary') {
          if (company.maxSecretaries !== null && company.maxSecretaries !== undefined) {
            if (company.maxSecretaries <= 0) {
              return response.badRequest({
                message: `O plano ${planName} não permite secretárias. Faça upgrade de plano.`,
              })
            }

            const secCountRes = await User.query()
              .where('companyId', user.companyId)
              .where('role', 'secretary')
              .where('active', true)
              .whereNot('id', user.id)
              .count('* as total')
            const secUsed = Number(secCountRes[0]?.$extras?.total || 0)

            if (secUsed >= company.maxSecretaries) {
              return response.badRequest({
                message: `Limite de secretárias atingido para o plano ${planName} (máx: ${company.maxSecretaries}).`,
              })
            }
          }
        }
      }
    }

    if (data.fullName) user.fullName = data.fullName.trim()
    if (data.password) user.password = data.password
    if (data.crefito !== undefined) user.crefito = data.crefito
    if (data.cpfCnpj !== undefined) user.cpfCnpj = data.cpfCnpj
    if (data.phone !== undefined) user.phone = data.phone
    if (data.avatarUrl !== undefined) user.avatarUrl = data.avatarUrl
    if (data.active !== undefined) user.active = Boolean(data.active)

    if (data.compensationType !== undefined) user.compensationType = data.compensationType || null
    if (data.baseSalary !== undefined) user.baseSalary = data.baseSalary !== null ? String(data.baseSalary) : null
    if (data.sessionRate !== undefined) user.sessionRate = data.sessionRate !== null ? String(data.sessionRate) : null
    if (data.commissionPercentage !== undefined)
      user.commissionPercentage = data.commissionPercentage !== null ? String(data.commissionPercentage) : null
    if (data.paymentDay !== undefined) user.paymentDay = data.paymentDay ? Number(data.paymentDay) : null
    if (data.pixKey !== undefined) user.pixKey = data.pixKey || null
    if (data.bankInfo !== undefined) user.bankInfo = data.bankInfo || null

    // Only superadmin or clinic_admin can change roles
    if (data.role && (currentUser.role === 'superadmin' || currentUser.role === 'clinic_admin')) {
      user.role = data.role
    }

    await user.save()
    return response.ok(this.formatUser(user))
  }

  /**
   * Remove team member
   */
  async destroy({ params, auth, response }: HttpContext) {
    const currentUser = auth.getUserOrFail()
    if (!params.id || params.id === 'undefined' || isNaN(Number(params.id))) {
      return response.badRequest({ message: 'ID do usuário inválido.' })
    }

    const user = await User.findOrFail(Number(params.id))

    if (currentUser.role !== 'superadmin' && currentUser.role !== 'clinic_admin') {
      return response.forbidden({ message: 'Acesso restrito a administradores.' })
    }

    if (
      currentUser.role === 'clinic_admin' &&
      user.companyId !== currentUser.companyId
    ) {
      return response.forbidden({ message: 'Acesso negado a membros de outra clínica.' })
    }

    if (user.id === currentUser.id) {
      return response.badRequest({ message: 'Você não pode excluir sua própria conta.' })
    }

    await user.delete()
    return response.ok({ message: 'Profissional removido com sucesso.' })
  }
}
