import { sql, type SQLWrapper } from 'drizzle-orm';
import { pgTable, text, timestamp, boolean, integer, doublePrecision, uuid, primaryKey, unique, check, foreignKey, index } from 'drizzle-orm/pg-core';

const created = () => timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow();
const updated = () => timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow();
const categoryValues = sql`ARRAY['hospitality','retail','delivery','cleaning','warehouse']::text[]`;
const availabilityValues = sql`ARRAY['morning','afternoon','evening','weekend']::text[]`;
const validArray = (column: SQLWrapper, values: SQLWrapper) =>
  sql`cardinality(${column}) > 0 AND ${column} <@ ${values} AND array_position(${column}, NULL) IS NULL`;

export const user = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  profileType: text('profile_type').notNull(),
  createdAt: created(),
  updatedAt: updated(),
}, t => [
  unique('users_id_type_unique').on(t.id, t.profileType),
  check('users_profile_type_check', sql`${t.profileType} IN ('employee','employer')`),
]);
export const session = pgTable('sessions', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: created(), updatedAt: updated(),
  ipAddress: text('ip_address'), userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, t => [index('sessions_user_idx').on(t.userId)]);
export const account = pgTable('accounts', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(), providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'), refreshToken: text('refresh_token'), idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'), password: text('password'), createdAt: created(), updatedAt: updated(),
}, t => [index('accounts_user_idx').on(t.userId), unique('accounts_provider_unique').on(t.providerId, t.accountId)]);
export const verification = pgTable('verifications', {
  id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: created(), updatedAt: updated(),
}, t => [index('verifications_identifier_idx').on(t.identifier)]);

export const employeeProfiles = pgTable('employee_profiles', {
  userId: text('user_id').primaryKey(), profileType: text('profile_type').notNull().default('employee'),
  bio: text('bio'), categories: text('categories').array().notNull(),
  availability: text('availability').array().notNull(), createdAt: created(), updatedAt: updated(),
}, t => [
  foreignKey({ columns: [t.userId, t.profileType], foreignColumns: [user.id, user.profileType] }).onDelete('cascade'),
  check('employee_type_check', sql`${t.profileType} = 'employee'`),
  check('employee_categories_check', validArray(t.categories, categoryValues)),
  check('employee_availability_check', validArray(t.availability, availabilityValues)),
  check('employee_bio_check', sql`${t.bio} IS NULL OR length(${t.bio}) <= 500`),
]);
export const employerProfiles = pgTable('employer_profiles', {
  userId: text('user_id').primaryKey(), profileType: text('profile_type').notNull().default('employer'),
  companyName: text('company_name').notNull(), industry: text('industry').notNull(),
  workplaceLabel: text('workplace_label').notNull(),
  latitude: doublePrecision('latitude').notNull(), longitude: doublePrecision('longitude').notNull(),
  seedKey: text('seed_key').unique(), createdAt: created(), updatedAt: updated(),
}, t => [
  foreignKey({ columns: [t.userId, t.profileType], foreignColumns: [user.id, user.profileType] }).onDelete('cascade'),
  check('employer_type_check', sql`${t.profileType} = 'employer'`),
  check('employer_coordinates_check', sql`${t.latitude} BETWEEN -90 AND 90 AND ${t.longitude} BETWEEN -180 AND 180`),
  check('employer_name_check', sql`length(trim(${t.companyName})) BETWEEN 1 AND 160`),
]);
export const employeePreferences = pgTable('employee_preferences', {
  userId: text('user_id').primaryKey().references(() => employeeProfiles.userId, { onDelete: 'cascade' }),
  radiusMeters: integer('radius_meters').notNull().default(5000),
  locationSource: text('location_source'),
  createdAt: created(), updatedAt: updated(),
}, t => [
  check('radius_check', sql`${t.radiusMeters} IN (1000,5000,10000,20000)`),
  check('location_check', sql`${t.locationSource} IS NULL OR ${t.locationSource} = 'device'`),
]);
export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  employerUserId: text('employer_user_id').notNull().references(() => employerProfiles.userId, { onDelete: 'restrict' }),
  seedKey: text('seed_key').unique(), role: text('role').notNull(), category: text('category').notNull(),
  hourlyPayMinor: integer('hourly_pay_minor').notNull(), currency: text('currency').notNull().default('GBP'),
  weeklyHoursMin: integer('weekly_hours_min').notNull(), weeklyHoursMax: integer('weekly_hours_max').notNull(),
  availability: text('availability').array().notNull(), scheduleSummary: text('schedule_summary').notNull(),
  description: text('description').notNull(), areaLabel: text('area_label').notNull(),
  latitude: doublePrecision('latitude').notNull(), longitude: doublePrecision('longitude').notNull(),
  isActive: boolean('is_active').notNull().default(true), isDemo: boolean('is_demo').notNull().default(false),
  mockEmployerInterested: boolean('mock_employer_interested'), createdAt: created(), updatedAt: updated(),
}, t => [
  index('jobs_employer_idx').on(t.employerUserId),
  check('job_role_check', sql`length(trim(${t.role})) BETWEEN 1 AND 160`),
  check('job_category_check', sql`${t.category} = ANY(${categoryValues})`),
  check('job_pay_check', sql`${t.hourlyPayMinor} > 0 AND ${t.currency} = 'GBP'`),
  check('job_hours_check', sql`${t.weeklyHoursMin} > 0 AND ${t.weeklyHoursMax} >= ${t.weeklyHoursMin} AND ${t.weeklyHoursMax} <= 168`),
  check('job_availability_check', validArray(t.availability, availabilityValues)),
  check('job_coordinates_check', sql`${t.latitude} BETWEEN -90 AND 90 AND ${t.longitude} BETWEEN -180 AND 180`),
  check('job_demo_check', sql`(${t.isDemo} AND ${t.mockEmployerInterested} IS NOT NULL) OR (NOT ${t.isDemo} AND ${t.mockEmployerInterested} IS NULL)`),
]);
export const jobDecisions = pgTable('job_decisions', {
  employeeUserId: text('employee_user_id').notNull().references(() => employeeProfiles.userId, { onDelete: 'restrict' }),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'restrict' }),
  decision: text('decision').notNull(), createdAt: created(),
}, t => [
  primaryKey({ columns: [t.employeeUserId, t.jobId] }),
  check('decision_check', sql`${t.decision} IN ('pass','interested')`),
  index('decisions_job_idx').on(t.jobId, t.decision, t.createdAt, t.employeeUserId),
  index('decisions_saved_idx').on(t.employeeUserId, t.createdAt.desc(), t.jobId).where(sql`${t.decision} = 'interested'`),
]);
export const matches = pgTable('matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  employeeUserId: text('employee_user_id').notNull(), jobId: uuid('job_id').notNull(),
  source: text('source').notNull(), createdAt: created(),
}, t => [
  unique('matches_pair_unique').on(t.employeeUserId, t.jobId),
  foreignKey({ columns: [t.employeeUserId, t.jobId], foreignColumns: [jobDecisions.employeeUserId, jobDecisions.jobId] }).onDelete('restrict'),
  check('match_source_check', sql`${t.source} IN ('employer_acceptance','demo')`),
  index('matches_employee_idx').on(t.employeeUserId, t.createdAt.desc(), t.id),
  index('matches_job_idx').on(t.jobId),
]);
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  matchId: uuid('match_id').notNull().unique().references(() => matches.id, { onDelete: 'restrict' }),
  createdAt: created(),
});
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'restrict' }),
  senderUserId: text('sender_user_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  clientMessageId: uuid('client_message_id').notNull(), body: text('body').notNull(), createdAt: created(),
  readAt: timestamp('read_at', { withTimezone: true, precision: 3 }),
}, t => [
  unique('message_retry_unique').on(t.conversationId, t.senderUserId, t.clientMessageId),
  check('message_body_check', sql`length(trim(${t.body})) > 0 AND length(${t.body}) <= 4000`),
  index('messages_history_idx').on(t.conversationId, t.createdAt, t.id),
  index('messages_sender_idx').on(t.senderUserId),
]);
