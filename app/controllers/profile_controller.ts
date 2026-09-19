import type { HttpContext } from '@adonisjs/core/http'
import Company from '#models/company'

export default class ProfileController {
  async show({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    let company: Company | null = null
    if (user.companyId) {
      company = await Company.find(user.companyId)
    }

    return response.json({
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
    })
  }
}
