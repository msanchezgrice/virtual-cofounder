// Quick script to list your Linear teams
// Run: npx tsx scripts/list-linear-teams.ts

async function main() {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey || apiKey === 'PLACEHOLDER') {
    console.log('❌ Set LINEAR_API_KEY in .env first');
    process.exit(1);
  }

  const query = `
    query {
      teams {
        nodes {
          id
          name
          key
        }
      }
    }
  `;

  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const result = await response.json();

  if (result.errors) {
    console.error('❌ GraphQL errors:', result.errors);
    process.exit(1);
  }

  const teams = result.data.teams.nodes;

  console.log('\n📋 Your Linear Teams:\n');
  teams.forEach((team: any) => {
    console.log(`  ${team.name} (${team.key})`);
    console.log(`    ID: ${team.id}`);
    console.log('');
  });
  console.log(`Total: ${teams.length} teams`);
}

main().catch(console.error);
