import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { orgs, roles, clients } from './schema';

if (process.env.NODE_ENV === 'production') {
  throw new Error('[seed] Must not run in production. Aborting.');
}

// Direct connection (port 5432) — only used for seed/migrations, never at runtime
const directClient = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const dbDirect = drizzle(directClient, { schema });

async function seed() {
  console.log('Seeding...');

  const [org] = await dbDirect.insert(orgs).values({
    name: 'Sharma & Associates',
    slug: 'sharma-associates',
  }).returning();
  console.log('Org created:', org.id);

  // Roles — insert in order so we can reference parent IDs
  const [foundingPartner] = await dbDirect.insert(roles).values({
    org_id: org.id,
    name: 'Founding Partner',
    color: '#7C3AED',
    sort_order: 0,
  }).returning();

  const [partner] = await dbDirect.insert(roles).values({
    org_id: org.id,
    name: 'Partner',
    color: '#2563EB',
    sort_order: 1,
    parent_role_id: foundingPartner.id,
  }).returning();

  const [seniorManager] = await dbDirect.insert(roles).values({
    org_id: org.id,
    name: 'Senior Manager',
    color: '#059669',
    sort_order: 2,
    parent_role_id: partner.id,
  }).returning();

  const [manager] = await dbDirect.insert(roles).values({
    org_id: org.id,
    name: 'Manager',
    color: '#D97706',
    sort_order: 3,
    parent_role_id: seniorManager.id,
  }).returning();

  const [articleAssistant] = await dbDirect.insert(roles).values({
    org_id: org.id,
    name: 'Article Assistant',
    color: '#DC2626',
    sort_order: 4,
    parent_role_id: manager.id,
  }).returning();

  await dbDirect.insert(roles).values({
    org_id: org.id,
    name: 'Intern',
    color: '#6B7280',
    sort_order: 5,
    parent_role_id: articleAssistant.id,
  });

  console.log('6 roles created');

  await dbDirect.insert(clients).values([
    { org_id: org.id, name: 'Rajesh Textiles Pvt Ltd', pan: 'AABCT1234F' },
    { org_id: org.id, name: 'Mehta Constructions', pan: 'AABCM5678G' },
    { org_id: org.id, name: 'Patel Trading Co', pan: 'AABCP9012H' },
    { org_id: org.id, name: 'ABC Industries Ltd', pan: 'AABCA3456I' },
    { org_id: org.id, name: 'XYZ Services Pvt Ltd', pan: 'AABCX7890J' },
  ]);

  console.log('5 clients created');
  console.log('Seed complete.');
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
