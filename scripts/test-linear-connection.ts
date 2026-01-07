// Simple test to verify Linear API connection
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local
config({ path: resolve(__dirname, '../.env.local'), override: true });

console.log('LINEAR_API_KEY:', process.env.LINEAR_API_KEY?.substring(0, 20) + '...');

// Now test the Linear API directly
async function testLinearAPI() {
  const apiKey = process.env.LINEAR_API_KEY;

  const query = `
    query {
      teams {
        nodes {
          id
          name
        }
      }
    }
  `;

  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Authorization': apiKey!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const result = await response.json();

  if (result.errors) {
    console.error('❌ Linear API errors:', JSON.stringify(result.errors, null, 2));
    process.exit(1);
  }

  console.log('✓ Linear API connection successful!');
  console.log('Teams:', result.data.teams.nodes.map((t: any) => t.name).join(', '));
}

testLinearAPI().catch(console.error);
