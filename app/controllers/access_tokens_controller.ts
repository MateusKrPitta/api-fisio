import User from '#models/user'
import Company from '#models/company'
import { loginValidator } from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'

export default class AccessTokensController {
  async store({ request, response }: HttpContext) {
    const { email, password } = await request.validateUsing(loginValidator)

    const user = await User.verifyCredentials(email, password)

    // Verifica se a conta do usuário está ativa
    if (user.active === false) {
      return response.status(403).json({
        message: 'Esta conta de usuário está desativada ou bloqueada. Entre em contato com o administrador.',
      })
    }

    // Se estiver associado a uma clínica/empresa, verifica se ela está ativa
    let company: Company | null = null
    if (user.companyId) {
      company = await Company.find(user.companyId)
      if (company && company.status !== 'active') {
        return response.status(403).json({
          message: 'A clínica vinculada a este usuário está suspensa ou inativa. Entre em contato com o suporte.',
        })
      }
    }

    const token = await User.accessTokens.create(user)

    const userJson = {
      id: user.id,
      fullName: user.fullName,
      crefito: user.crefito,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      cpfCnpj: user.cpfCnpj,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      active: user.active,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      initials: user.initials,
      company: company
        ? {
            id: company.id,
            name: company.name,
            cnpj: company.cnpj,
            crefito: company.crefito,
            email: company.email,
            phone: company.phone,
            address: company.address,
            logoUrl: company.logoUrl,
            status: company.status,
          }
        : null,
    }

    return response.json({
      message: `Seja bem-vindo(a), ${user.fullName || user.email}!`,
      user: userJson,
      token: token.value!.release(),
    })
  }

  async destroy({ auth }: HttpContext) {
    const user = auth.getUserOrFail()
    if (user.currentAccessToken) {
      await User.accessTokens.delete(user, user.currentAccessToken.identifier)
    }

    return {
      message: 'Sessão encerrada com sucesso.',
    }
  }
}
