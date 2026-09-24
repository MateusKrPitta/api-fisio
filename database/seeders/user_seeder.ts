import { BaseSeeder } from '@adonisjs/lucid/seeders'
import User from '#models/user'
import Company from '#models/company'
import Patient from '#models/patient'
import Appointment from '#models/appointment'
import FinancialRecord from '#models/financial_record'

export default class extends BaseSeeder {
  async run() {
    let targetCompany = await Company.query()
      .where('name', 'like', '%Milene%')
      .orWhere('name', 'like', '%FisMovie%')
      .first()

    if (!targetCompany) {
      targetCompany = await Company.create({
        name: 'Clinica Milene Salmazo',
        cnpj: '12.345.678/0001-90',
        crefito: '1234-SP',
        email: 'contato@fismovie.com.br',
        phone: '(11) 99999-9999',
        address: 'Av. Paulista, 1000 - São Paulo, SP',
        status: 'active',
        plan: 'silver',
        maxPhysios: 3,
        maxSecretaries: 1,
      })
    } else {
      targetCompany.name = 'Clinica Milene Salmazo'
      targetCompany.plan = 'silver'
      targetCompany.maxPhysios = 3
      targetCompany.maxSecretaries = 1
      await targetCompany.save()
    }

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
      milene.companyId = targetCompany.id
      milene.active = true
      await milene.save()
    } else {
      await User.create({
        fullName: 'Dra. Milene Salmazo',
        email: 'milene@crefito.com.br',
        crefito: '123456-F',
        password: 'admin',
        role: 'clinic_admin',
        companyId: targetCompany.id,
        active: true,
      })
    }

    // Unify any other team members created under this company
    await User.query()
      .whereIn('email', ['ana@crefito.com.br', 'mateus@email.com.br'])
      .update({ company_id: targetCompany.id })

    // Unify existing patients and appointments under this company
    await Patient.query()
      .whereNull('company_id')
      .orWhere('company_id', '!=', targetCompany.id)
      .update({ company_id: targetCompany.id })

    await Appointment.query()
      .whereNull('company_id')
      .orWhere('company_id', '!=', targetCompany.id)
      .update({ company_id: targetCompany.id })

    await FinancialRecord.query()
      .whereNull('company_id')
      .orWhere('company_id', '!=', targetCompany.id)
      .update({ company_id: targetCompany.id })
  }
}
