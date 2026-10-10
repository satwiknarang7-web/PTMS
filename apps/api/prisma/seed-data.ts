/**
 * Data created by `npm run db:seed`: the first root admin and the company organization (empty;
 * root admins appoint its project coordinators, who then add everyone else).
 *
 * The root admin's password is a first-run credential: change it after the first sign-in.
 */

/**
 * First root admin: creates organizations, appoints their project coordinators and adds other
 * root admins from the platform console. ROOT_EMAIL / ROOT_PASSWORD override these values.
 */
export const ROOT_ACCOUNT = {
  email: process.env.ROOT_EMAIL || 'satwik.narang@segueit.com',
  password: process.env.ROOT_PASSWORD || 'change@123',
  firstName: 'Satwik',
  lastName: 'Narang',
  jobTitle: 'Platform Administrator',
};

/** The company's own organization, created empty on the first run. */
export const COMPANY_ORGANIZATION = {
  name: 'SegueIT',
};

/**
 * Accounts and project keys created by the demo data of earlier versions. Only used by
 * `npm run db:remove-demo`, which deletes them from an existing database.
 */
export const LEGACY_DEMO = {
  organizationName: 'SegueIT',
  emails: [
    'admin@segueit.com',
    'priya.sharma@segueit.com',
    'arjun.mehta@segueit.com',
    'neha.verma@segueit.com',
    'rahul.iyer@segueit.com',
    'sara.khan@segueit.com',
    'client.viewer@segueit.com',
  ],
  projectKeys: ['WEB', 'MOB', 'ERP'],
};
