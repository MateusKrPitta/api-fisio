import { BaseSeeder } from '@adonisjs/lucid/seeders'
import User from '#models/user'
import Company from '#models/company'

export default class extends BaseSeeder {
  async run() {
    // 1. Super Administrador do Sistema (Acesso Master /admin)
    await User.updateOrCreate(
      { email: 'admin@sistema.com.br' },
      {
        fullName: 'Administrador Master',
        email: 'admin@sistema.com.br',
        password: 'admin',
        crefito: 'ADMIN-MASTER',
        role: 'superadmin',
        active: true,
      }
    )

    // 2. Empresa / Clínica Padrão de Exemplo
    const defaultCompany = await Company.updateOrCreate(
      { name: 'Clínica Fisioterapia FisMovie' },
      {
        name: 'Clínica Fisioterapia FisMovie',
        cnpj: '12.345.678/0001-90',
        crefito: '1234-SP',
        email: 'contato@fismovie.com.br',
        phone: '(11) 99999-9999',
        address: 'Av. Paulista, 1000 - São Paulo, SP',
        status: 'active',
      }
    )

    // 3. Usuário Administrador da Clínica (Dra. Milene)
    await User.updateOrCreate(
      { email: 'milene@crefito.com.br' },
      {
        fullName: 'Dra. Milene Salmazo',
        email: 'milene@crefito.com.br',
        crefito: '123456-F',
        password: 'admin',
        role: 'clinic_admin',
        companyId: defaultCompany.id,
        active: true,
      }
    )
  }
}
