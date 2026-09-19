import { BaseSeeder } from '@adonisjs/lucid/seeders'
import User from '#models/user'
import Company from '#models/company'

export default class extends BaseSeeder {
  async run() {
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

    let admin = await User.findBy('email', 'admin@sistema.com.br')
    if (admin) {
      admin.password = 'admin'
      admin.role = 'superadmin'
      admin.active = true
      await admin.save()
    } else {
      await User.create({
        fullName: 'Administrador Master',
        email: 'admin@sistema.com.br',
        password: 'admin',
        crefito: 'ADMIN-MASTER',
        role: 'superadmin',
        active: true,
      })
    }

    let milene = await User.findBy('email', 'milene@crefito.com.br')
    if (milene) {
      milene.password = 'admin'
      milene.role = 'clinic_admin'
      milene.companyId = defaultCompany.id
      milene.active = true
      await milene.save()
    } else {
      await User.create({
        fullName: 'Dra. Milene Salmazo',
        email: 'milene@crefito.com.br',
        crefito: '123456-F',
        password: 'admin',
        role: 'clinic_admin',
        companyId: defaultCompany.id,
        active: true,
      })
    }
  }
}
