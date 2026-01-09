import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const SINGLE_USER_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002';

export async function GET() {
  try {
    const projects = await db.project.findMany({
      where: {
        workspaceId: SINGLE_USER_WORKSPACE_ID
      },
      orderBy: {
        name: 'asc'
      },
      select: {
        id: true,
        name: true,
        domain: true,
        status: true,
        hasPosthog: true,
        hasResend: true,
        createdAt: true
      }
    });

    return NextResponse.json({ projects, count: projects.length });
  } catch (error) {
    console.error('Failed to fetch projects:', error);
    
    // Return empty array with error flag instead of 500
    // This allows UI to render properly and show "no projects" state
    return NextResponse.json(
      { 
        projects: [], 
        count: 0, 
        error: 'Database connection failed - please try again',
        _debug: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 200 } // Return 200 so frontend can handle gracefully
    );
  }
}
