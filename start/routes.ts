/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'
import { controllers } from '#generated/controllers'
import { loginLimiter, signupLimiter, publicSignatureLimiter } from '#start/limiter'

router.get('/', () => {
  return { hello: 'world' }
})

router
  .group(() => {
    // Public evaluation preview & digital signature endpoints (no login required)
    const PatientFormRecordsController = () => import('#controllers/patient_form_records_controller')
    router.get('public/evaluations/:token', [PatientFormRecordsController, 'showPublic'])
    router.post('public/evaluations/:token/sign', [PatientFormRecordsController, 'signPublic']).use(publicSignatureLimiter)

    // Initial database seeding trigger endpoint (Protected: dev only or with secret key)
    router.get('system-init-seed', async ({ request, response }) => {
      const isDev = process.env.NODE_ENV !== 'production'
      const secretKey = process.env.SEED_SECRET_KEY
      const providedKey = request.header('x-seed-key') || request.input('key')

      if (!isDev && (!secretKey || providedKey !== secretKey)) {
        return response.status(403).json({
          error: 'Acesso negado. A rota de inicialização do sistema está protegida.',
        })
      }

      const User = (await import('#models/user')).default
      const Company = (await import('#models/company')).default

      const company = await Company.updateOrCreate(
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
        admin = await User.create({
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
        milene.companyId = company.id
        milene.active = true
        await milene.save()
      } else {
        milene = await User.create({
          fullName: 'Dra. Milene Salmazo',
          email: 'milene@crefito.com.br',
          crefito: '123456-F',
          password: 'admin',
          role: 'clinic_admin',
          companyId: company.id,
          active: true,
        })
      }

      return { success: true, message: 'Seeds executados com sucesso no banco de dados!' }
    })

    router
      .group(() => {
        router.post('signup', [controllers.NewAccount, 'store']).use(signupLimiter)
        router.post('login', [controllers.AccessTokens, 'store']).use(loginLimiter)
      })
      .prefix('auth')
      .as('auth')

    router
      .group(() => {
        router.get('profile', [controllers.Profile, 'show'])
        router.post('logout', [controllers.AccessTokens, 'destroy'])
      })
      .prefix('account')
      .as('profile')
      .use(middleware.auth())

    router
      .group(() => {
        const DashboardController = () => import('#controllers/dashboard_controller')
        const PatientsController = () => import('#controllers/patients_controller')
        const EvaluationsController = () => import('#controllers/evaluations_controller')
        const AppointmentsController = () => import('#controllers/appointments_controller')

        // Dashboard Metrics
        router.get('dashboard', [DashboardController, 'metrics'])

        // Birthdays & Patients CRUD
        router.get('birthdays', [PatientsController, 'birthdays'])
        router.get('patients', [PatientsController, 'index'])
        router.get('patients/:id', [PatientsController, 'show'])
        router.get('patients/:id/evolutions', [PatientsController, 'evolutions'])
        router.post('patients', [PatientsController, 'store'])
        router.put('patients/:id', [PatientsController, 'update'])
        router.delete('patients/:id', [PatientsController, 'destroy'])

        // Evaluations
        router.get('patients/:patientId/evaluations', [EvaluationsController, 'index'])
        router.post('patients/:patientId/evaluations', [EvaluationsController, 'store'])
        router.delete('evaluations/:id', [EvaluationsController, 'destroy'])

        // Appointments CRUD & Baixa
        router.get('appointments', [AppointmentsController, 'index'])
        router.get('appointments/:id', [AppointmentsController, 'show'])
        router.post('appointments', [AppointmentsController, 'store'])
        router.put('appointments/:id', [AppointmentsController, 'update'])
        router.post('appointments/:id/baixa', [AppointmentsController, 'baixa'])
        router.delete('appointments/:id', [AppointmentsController, 'destroy'])

        const CustomModulesController = () => import('#controllers/custom_modules_controller')
        const FormTemplatesController = () => import('#controllers/form_templates_controller')
        const FinancialRecordsController = () => import('#controllers/financial_records_controller')

        // Custom Modules & Fields
        router.get('custom-modules', [CustomModulesController, 'index'])
        router.get('custom-modules/:id', [CustomModulesController, 'show'])
        router.post('custom-modules', [CustomModulesController, 'store'])
        router.put('custom-modules/:id', [CustomModulesController, 'update'])
        router.delete('custom-modules/:id', [CustomModulesController, 'destroy'])

        // Form Templates ("Fichas Técnicas")
        router.get('form-templates', [FormTemplatesController, 'index'])
        router.get('form-templates/:id', [FormTemplatesController, 'show'])
        router.post('form-templates', [FormTemplatesController, 'store'])
        router.put('form-templates/:id', [FormTemplatesController, 'update'])
        router.delete('form-templates/:id', [FormTemplatesController, 'destroy'])

        // Patient Form Records
        router.get('patients/:patientId/form-records', [PatientFormRecordsController, 'index']).as('patient_form_records.index')
        router.get('form-records/:id', [PatientFormRecordsController, 'show']).as('form_records.show')
        router.post('patients/:patientId/form-records', [PatientFormRecordsController, 'store']).as('patient_form_records.store')
        router.put('form-records/:id', [PatientFormRecordsController, 'update']).as('form_records.update')
        router.put('patients/:patientId/form-records/:id', [PatientFormRecordsController, 'update']).as('patient_form_records.update_nested')
        router.delete('form-records/:id', [PatientFormRecordsController, 'destroy']).as('form_records.destroy')
        router.delete('patients/:patientId/form-records/:id', [PatientFormRecordsController, 'destroy']).as('patient_form_records.destroy_nested')

        // AI Clinical Report Analysis & Saved Reports
        const AiReportsController = () => import('#controllers/ai_reports_controller')
        router.post('patients/:patientId/ai-report', [AiReportsController, 'generate'])
        router.get('patients/:patientId/saved-reports', [AiReportsController, 'index'])
        router.post('patients/:patientId/saved-reports', [AiReportsController, 'store'])
        router.delete('saved-reports/:id', [AiReportsController, 'destroy'])

        // Financial Records
        router.get('financial-records', [FinancialRecordsController, 'index'])
        router.post('financial-records', [FinancialRecordsController, 'store'])
        router.put('financial-records/:id', [FinancialRecordsController, 'update'])
        router.delete('financial-records/:id', [FinancialRecordsController, 'destroy'])

        const CompaniesController = () => import('#controllers/companies_controller')
        const TeamController = () => import('#controllers/team_controller')

        // Companies Management (Super Admin & Clinic Admin)
        router.get('companies', [CompaniesController, 'index'])
        router.get('companies/:id', [CompaniesController, 'show'])
        router.post('companies', [CompaniesController, 'store'])
        router.put('companies/:id', [CompaniesController, 'update'])
        router.delete('companies/:id', [CompaniesController, 'destroy'])

        // Team Management
        router.get('team', [TeamController, 'index'])
        router.get('team/quota', [TeamController, 'quota'])
        router.get('team/:id', [TeamController, 'show'])
        router.post('team', [TeamController, 'store'])
        router.put('team/:id', [TeamController, 'update'])
        router.delete('team/:id', [TeamController, 'destroy'])
      })
      .use(middleware.auth())
  })
  .prefix('/api/v1')
