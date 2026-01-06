import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// Create fresh Prisma Client for seed (not cached)
const db = new PrismaClient();

// Hardcoded IDs for single-user MVP
const SINGLE_USER_ID = '00000000-0000-0000-0000-000000000001';
const SINGLE_USER_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002';

interface ProjectData {
  name: string;
  domain?: string;
  repo?: string;
  status: string;
  has_posthog?: boolean;
  has_resend?: boolean;
  vercel_project_id?: string;
  linear_team_id?: string;
}

async function seed() {
  try {
    console.log('🌱 Starting database seed...\n');

    // 1. Create default user
    console.log('Creating default user...');
    await db.user.upsert({
      where: { id: SINGLE_USER_ID },
      update: {},
      create: {
        id: SINGLE_USER_ID,
        email: 'miguel@example.com',
        name: 'Miguel'
      }
    });
    console.log('✓ Default user created\n');

    // 2. Create default workspace
    console.log('Creating default workspace...');
    await db.workspace.upsert({
      where: { id: SINGLE_USER_WORKSPACE_ID },
      update: {},
      create: {
        id: SINGLE_USER_WORKSPACE_ID,
        name: "Miguel's Workspace",
        slug: 'miguel',
        ownerUserId: SINGLE_USER_ID,
        plan: 'pro',
        maxProjects: 100,
        maxScansPerDay: 500
      }
    });
    console.log('✓ Default workspace created\n');

    // 3. Add user as workspace owner
    console.log('Adding workspace membership...');
    await db.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: SINGLE_USER_WORKSPACE_ID,
          userId: SINGLE_USER_ID
        }
      },
      update: {},
      create: {
        workspaceId: SINGLE_USER_WORKSPACE_ID,
        userId: SINGLE_USER_ID,
        role: 'owner'
      }
    });
    console.log('✓ Workspace membership created\n');

    // 4. Update user's default workspace
    console.log('Setting default workspace...');
    await db.user.update({
      where: { id: SINGLE_USER_ID },
      data: { defaultWorkspaceId: SINGLE_USER_WORKSPACE_ID }
    });
    console.log('✓ Default workspace set\n');

    // 5. Load projects from project_data.json
    console.log('Loading projects from project_data.json...');
    const projectDataPath = path.join(
      process.env.HOME || '',
      'Reboot',
      'dashboard-archive',
      'data',
      'project_data.json'
    );

    if (!fs.existsSync(projectDataPath)) {
      console.error(`✗ project_data.json not found at: ${projectDataPath}`);
      console.log('  Please ensure the file exists or update the path in scripts/seed.ts');
      process.exit(1);
    }

    const rawData = fs.readFileSync(projectDataPath, 'utf-8');
    const data = JSON.parse(rawData);
    const projects: ProjectData[] = data.projects || data;

    if (!Array.isArray(projects)) {
      console.error('✗ Invalid project_data.json format. Expected array of projects.');
      process.exit(1);
    }

    console.log(`✓ Found ${projects.length} projects\n`);

    // 6. Import projects
    console.log('Importing projects...');
    let successCount = 0;
    let errorCount = 0;

    for (const project of projects) {
      try {
        await db.project.upsert({
          where: {
            workspaceId_name: {
              workspaceId: SINGLE_USER_WORKSPACE_ID,
              name: project.name
            }
          },
          update: {
            domain: project.domain,
            repo: project.repo,
            status: project.status,
            hasPosthog: project.has_posthog || false,
            hasResend: project.has_resend || false,
            vercelProjectId: project.vercel_project_id,
            linearTeamId: project.linear_team_id
          },
          create: {
            workspaceId: SINGLE_USER_WORKSPACE_ID,
            name: project.name,
            domain: project.domain,
            repo: project.repo,
            status: project.status,
            hasPosthog: project.has_posthog || false,
            hasResend: project.has_resend || false,
            vercelProjectId: project.vercel_project_id,
            linearTeamId: project.linear_team_id
          }
        });
        successCount++;
        process.stdout.write(`✓ ${project.name}\n`);
      } catch (error) {
        errorCount++;
        console.error(`✗ ${project.name}:`, error);
      }
    }

    console.log('');
    console.log(`✓ Seed completed: ${successCount} projects imported, ${errorCount} errors\n`);

    // 7. Summary
    const finalProjectCount = await db.project.count();
    console.log('📊 Database summary:');
    console.log(`   Users: 1`);
    console.log(`   Workspaces: 1`);
    console.log(`   Projects: ${finalProjectCount}`);

    await db.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('✗ Seed failed:', error);
    await db.$disconnect();
    process.exit(1);
  }
}

seed();
